// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RequestSchedulerError, RequestSchedulerErrorCode } from './RequestScheduler';

const MAX_TIMER_DELAY_MS: number = 0x7fffffff;
const SCRIPT_TIMEOUT_CLAUSE: string = ', including a rushx script that may not exit until it is stopped';
// Waiting longer may not help behind a script, such as a dev server, that runs until it is stopped.
const SCRIPT_TIMEOUT_REMEDY: string = 'Stop the script, or use --wait-timeout <seconds> to wait longer.';
const TIMEOUT_REMEDY: string = 'Use --wait-timeout <seconds> to wait longer.';

/** Names the waived time, since a drain that waived time times out that much later than the wait timeout. */
function formatWaivedTime(waivedMs: number): string {
  const seconds: number = Math.round(waivedMs / 100) / 10;
  return seconds === 0
    ? ''
    : `; ${seconds}s spent waiting for requests that were already running did not count`;
}

/** One dispatched request tracked by a {@link WorkspaceRestartArbiter}. */
export interface IWorkspaceRestartTicket {
  readonly waitingForDrain: boolean;
}

/** Options for {@link WorkspaceRestartArbiter.enter}. */
export interface IWorkspaceRestartTicketOptions {
  /** The request runs a rushx script, which can run until it is stopped (for example, a dev server). */
  readonly runsScript?: boolean;
}

interface IMutableTicket {
  /** The request waits for a drain or for a pending restart, so it is not counted as served. */
  waitingForDrain: boolean;
  left: boolean;
  readonly runsScript: boolean;
}

interface IWaitKind {
  /**
   * The request waits to restart the daemon, so {@link WorkspaceRestartArbiter.hasPendingRestart} reports its restart
   * to other requests until it leaves.
   */
  readonly restarts: boolean;
  /** Whether the request must keep waiting. */
  readonly isBlocked: () => boolean;
  /** How many other requests the request waits for, reported as its queue position. */
  readonly countWaitedFor: () => number;
  readonly noWaitMessage: string;
  /** Begins the timeout message, which goes on to name the requests that the restart waits for. */
  readonly timeoutPrefix: string;
}

/** Options for {@link WorkspaceRestartArbiter.waitForDrainAsync}, supplied by request admission. */
export interface IWorkspaceRestartDrainOptions {
  readonly abortSignal: AbortSignal;
  readonly noWait: boolean | undefined;
  readonly waitTimeoutMs: number | undefined;
  /**
   * Do not spend `waitTimeoutMs` while a request that was already being served when the wait began is still being
   * served and no rushx script is. The timeout then limits waiting while a rushx script is served, since a script
   * may not exit until it is stopped, and waiting for requests that arrived later, which could otherwise keep the
   * request waiting for as long as they keep arriving.
   */
  readonly waivesTimeoutForServedWork?: boolean;
  /**
   * Called while the request waits with the number of other requests that it waits for, when the wait begins and
   * whenever that number changes, so that the client can report the wait as a queue position.
   */
  readonly onServingCountChanged?: (servingCount: number) => void;
}

/**
 * Arbitrates process restarts between requests whose environments differ from the running daemon.
 * A request that needs a restart waits until every other request this process can serve has finished,
 * so a mismatched environment never preempts queued or in-flight work that matches the running process.
 * A rushx script that arrives while a restart is pending waits for the restart instead, since it may not exit until
 * it is stopped and the restart would otherwise wait for it.
 */
export class WorkspaceRestartArbiter {
  readonly #listeners: Set<() => void> = new Set();
  readonly #countListeners: Set<() => void> = new Set();
  readonly #serving: Set<IMutableTicket> = new Set();
  /** Requests that began a restart drain and have not left, so their restarts are still pending. */
  readonly #restartCandidates: Set<IMutableTicket> = new Set();

  /** The number of tracked requests that are not waiting for a restart. */
  public get servingCount(): number {
    return this.#serving.size;
  }

  public enter(options?: IWorkspaceRestartTicketOptions): IWorkspaceRestartTicket {
    const ticket: IMutableTicket = {
      waitingForDrain: false,
      left: false,
      runsScript: options?.runsScript === true
    };
    this.#serve(ticket);
    return ticket;
  }

  public leave(ticket: IWorkspaceRestartTicket): void {
    const state: IMutableTicket = ticket as IMutableTicket;
    if (state.left) return;
    state.left = true;
    this.#restartCandidates.delete(state);
    if (!state.waitingForDrain) this.#stopServing(state);
  }

  /**
   * Whether another tracked request needs to restart the daemon for its environment: it waits for the drain, or it
   * has drained and not yet left. A request that needs a restart leaves once the restart is planned, or once it
   * fails or is cancelled.
   */
  public hasPendingRestart(ticket: IWorkspaceRestartTicket): boolean {
    return Array.from(this.#restartCandidates).some((candidate: IMutableTicket) => candidate !== ticket);
  }

  /**
   * Waits until no other tracked request is still being served by this process, then counts the ticket
   * as served again so concurrent restart candidates proceed one at a time. Returns how many milliseconds of the
   * wait did not spend `waitTimeoutMs` (see {@link IWorkspaceRestartDrainOptions.waivesTimeoutForServedWork}).
   * From when the wait begins until the ticket leaves, {@link WorkspaceRestartArbiter.hasPendingRestart} reports
   * the restart to other requests.
   */
  public async waitForDrainAsync(
    ticket: IWorkspaceRestartTicket,
    options: IWorkspaceRestartDrainOptions
  ): Promise<number> {
    return await this.#waitAsync(ticket, options, {
      restarts: true,
      isBlocked: () => this.#serving.size > 0,
      countWaitedFor: () => this.#serving.size,
      noWaitMessage: 'Another environment is still being served; the request did not wait for a restart.',
      timeoutPrefix:
        'The request was not admitted before the daemon could restart for its environment, which waits for'
    });
  }

  /**
   * Waits, for a request that runs a rushx script, until no other tracked request needs to restart the daemon for
   * its environment, then counts the ticket as served again. A script may not exit until it is stopped, so it waits
   * for a pending restart instead of starting and delaying the restart until it exits. The options apply as for
   * {@link WorkspaceRestartArbiter.waitForDrainAsync}, and the queue position counts the requests that are served or
   * need a restart.
   */
  public async waitForPendingRestartAsync(
    ticket: IWorkspaceRestartTicket,
    options: IWorkspaceRestartDrainOptions
  ): Promise<number> {
    return await this.#waitAsync(ticket, options, {
      restarts: false,
      isBlocked: () => this.hasPendingRestart(ticket),
      countWaitedFor: () => new Set([...this.#serving, ...this.#restartCandidates]).size,
      noWaitMessage:
        'Another request is waiting to restart the daemon for its environment; the rushx script did not wait ' +
        'for the restart.',
      timeoutPrefix:
        "The rushx script was not admitted before the daemon could restart for another request's environment. A " +
        'script waits for a pending restart so that the restart does not wait for the script, and the restart ' +
        'waits for'
    });
  }

  async #waitAsync(
    ticket: IWorkspaceRestartTicket,
    options: IWorkspaceRestartDrainOptions,
    kind: IWaitKind
  ): Promise<number> {
    const state: IMutableTicket = ticket as IMutableTicket;
    if (state.left || state.waitingForDrain) throw new Error('The restart ticket is not being served.');
    if (kind.restarts) this.#restartCandidates.add(state);
    state.waitingForDrain = true;
    this.#stopServing(state);
    const waivedFor: IMutableTicket[] = options.waivesTimeoutForServedWork ? Array.from(this.#serving) : [];
    let remainingMs: number | undefined = options.waitTimeoutMs;
    let waivedMs: number = 0;
    let reported: number | undefined;
    const report = (): void => {
      const count: number = kind.countWaitedFor();
      if (count > 0 && count !== reported) {
        reported = count;
        options.onServingCountChanged?.(count);
      }
    };
    try {
      while (kind.isBlocked()) {
        if (options.noWait) {
          throw new RequestSchedulerError(RequestSchedulerErrorCode.NoWait, kind.noWaitMessage);
        }
        report();
        const waived: boolean =
          !this.#isServingScript() && waivedFor.some((served: IMutableTicket) => this.#serving.has(served));
        const startedAt: number = Date.now();
        this.#countListeners.add(report);
        try {
          await this.#waitForChangeAsync(
            options.abortSignal,
            waived || remainingMs === undefined ? undefined : startedAt + remainingMs,
            () => this.#createTimeoutError(kind, waivedMs)
          );
        } finally {
          this.#countListeners.delete(report);
          const elapsedMs: number = Date.now() - startedAt;
          if (waived) waivedMs += elapsedMs;
          else if (remainingMs !== undefined) remainingMs -= elapsedMs;
        }
      }
      return waivedMs;
    } finally {
      state.waitingForDrain = false;
      this.#serve(state);
    }
  }

  #serve(ticket: IMutableTicket): void {
    this.#serving.add(ticket);
    this.#notifyChange();
  }

  #stopServing(ticket: IMutableTicket): void {
    this.#serving.delete(ticket);
    this.#notifyChange();
  }

  /** Reports the new count, and wakes every waiting request to re-check what it waits for. */
  #notifyChange(): void {
    for (const listener of Array.from(this.#countListeners)) listener();
    for (const listener of Array.from(this.#listeners)) listener();
  }

  #isServingScript(): boolean {
    return Array.from(this.#serving).some((served: IMutableTicket) => served.runsScript);
  }

  #createTimeoutError(kind: IWaitKind, waivedMs: number): RequestSchedulerError {
    const script: boolean = this.#isServingScript();
    return new RequestSchedulerError(
      RequestSchedulerErrorCode.WaitTimeout,
      `${kind.timeoutPrefix} the requests that the daemon is serving to finish${script ? SCRIPT_TIMEOUT_CLAUSE : ''}` +
        `${formatWaivedTime(waivedMs)}. ${script ? SCRIPT_TIMEOUT_REMEDY : TIMEOUT_REMEDY}`
    );
  }

  #waitForChangeAsync(
    abortSignal: AbortSignal,
    deadline: number | undefined,
    createTimeoutError: () => RequestSchedulerError
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const unsubscribe: AbortController = new AbortController();
      const settle = (error?: RequestSchedulerError): void => {
        this.#listeners.delete(settle);
        unsubscribe.abort();
        if (timer) clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      const settleAborted = (): void =>
        settle(
          new RequestSchedulerError(
            RequestSchedulerErrorCode.Aborted,
            'The request was aborted before execution.'
          )
        );
      if (abortSignal.aborted) {
        settleAborted();
        return;
      }
      this.#listeners.add(settle);
      abortSignal.addEventListener('abort', settleAborted, { once: true, signal: unsubscribe.signal });
      if (deadline !== undefined) {
        timer = setTimeout(
          () => settle(createTimeoutError()),
          Math.min(MAX_TIMER_DELAY_MS, Math.max(0, deadline - Date.now()))
        );
      }
    });
  }
}
