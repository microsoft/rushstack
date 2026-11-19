// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonRestartReason } from '@rushstack/rush-daemon-protocol';
import { formatDaemonRestartCause, type DaemonRestartRequester } from '@rushstack/rush-client-core';

import { RequestSchedulerError, RequestSchedulerErrorCode } from './RequestScheduler';

const MAX_TIMER_DELAY_MS: number = 0x7fffffff;
const ENVIRONMENT_RESTART_CAUSE: string = 'for its environment';
const SCRIPT_TIMEOUT_CLAUSE: string = ', including a rushx script that may not exit until it is stopped';
// Waiting longer may not help behind a script, such as a dev server, that runs until it is stopped.
const SCRIPT_TIMEOUT_REMEDY: string = 'Stop the script, or use --wait-timeout <seconds> to wait longer.';
const TIMEOUT_REMEDY: string = 'Use --wait-timeout <seconds> to wait longer.';

/** Says why the daemon restarts, as the end of "the daemon restarts <cause>", if the reason is known. */
function formatCause(
  restartReason: DaemonRestartReason | undefined,
  requester: DaemonRestartRequester
): string | undefined {
  return restartReason && formatDaemonRestartCause(restartReason, requester);
}

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
  /** Why the request needs a restart, while it is a restart candidate. */
  restartReason: DaemonRestartReason | undefined;
}

interface IWaitKind {
  /**
   * The request waits to restart the daemon, so {@link WorkspaceRestartArbiter.hasPendingRestart} reports its restart
   * to other requests until it leaves.
   */
  readonly restarts: boolean;
  /** Whether the request must keep waiting. */
  readonly isBlocked: () => boolean;
  /** The other requests that the request waits for. Their number is reported as its queue position. */
  readonly getWaitedFor: () => ReadonlySet<IMutableTicket>;
  /** Why the daemon restarts, if that is known. */
  readonly getRestartReason: () => DaemonRestartReason | undefined;
  /** Lets a request that waits to restart find that it no longer needs to. */
  readonly recheck: IWorkspaceRestartRecheck | undefined;
  readonly getNoWaitMessage: () => string;
  /** Begins the timeout message, which goes on to name the requests that the restart waits for. */
  readonly getTimeoutPrefix: () => string;
}

/** What a request that waits for a restart waits for, besides how many requests. */
export interface IWorkspaceRestartWaitReport {
  /** How many of the requests that the request waits for run a rushx script. */
  readonly scriptCount: number;
  /**
   * Why the daemon restarts: for a restart drain, the request's own reason, and for a rushx script that waits for a
   * pending restart, the reason of the first request that needs one. Undefined if that request gave no reason.
   */
  readonly restartReason: DaemonRestartReason | undefined;
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
   * Why the request needs the restart that {@link WorkspaceRestartArbiter.waitForDrainAsync} waits for. The admission
   * errors of the drain name it, as do those of rushx scripts that wait for the restart, and their reports. Without
   * it, they say that the daemon restarts for the request's environment.
   */
  readonly restartReason?: DaemonRestartReason;
  /**
   * Called while the request waits with the number of other requests that it waits for, when the wait begins and
   * whenever that number or the report changes, so that the client can report the wait as a queue position.
   */
  readonly onServingCountChanged?: (servingCount: number, report: IWorkspaceRestartWaitReport) => void;
}

/**
 * Lets a request that waits for a restart drain find that it no longer needs the restart. The change that needed it
 * may be reverted during the drain, while requests that do not need a restart keep the drain from finishing.
 */
export interface IWorkspaceRestartRecheck {
  /**
   * Resolves whether the request still needs the restart. It is called every `intervalMs` while the request waits,
   * each time after the previous call settles. A call that rejects counts as true.
   */
  readonly stillNeedsRestartAsync: () => Promise<boolean>;
  readonly intervalMs: number;
}

/** How a wait for a restart drain or a pending restart ended. */
export interface IWorkspaceRestartWaitResult {
  /**
   * How many milliseconds of the wait did not spend `waitTimeoutMs`
   * (see {@link IWorkspaceRestartDrainOptions.waivesTimeoutForServedWork}).
   */
  readonly waivedMs: number;
  /**
   * The wait ended because {@link IWorkspaceRestartRecheck.stillNeedsRestartAsync} resolved false, so the request no
   * longer counts as a pending restart. Otherwise the wait ended because the request no longer had to wait.
   */
  readonly restartWithdrawn: boolean;
}

/** Calls {@link IWorkspaceRestartRecheck.stillNeedsRestartAsync} while a restart candidate waits. */
class RestartRecheck {
  /** A call resolved false. */
  public withdrawn: boolean = false;
  readonly #recheck: IWorkspaceRestartRecheck;
  readonly #onWithdrawn: () => void;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #stopped: boolean = false;

  public constructor(recheck: IWorkspaceRestartRecheck, onWithdrawn: () => void) {
    this.#recheck = recheck;
    this.#onWithdrawn = onWithdrawn;
    this.#schedule();
  }

  /** Ignores a call that is still running, and makes no more. */
  public stop(): void {
    this.#stopped = true;
    clearTimeout(this.#timer);
  }

  #schedule(): void {
    this.#timer = setTimeout(() => {
      void this.#recheckAsync();
    }, this.#recheck.intervalMs);
  }

  async #recheckAsync(): Promise<void> {
    let stillNeeded: boolean = true;
    try {
      stillNeeded = await this.#recheck.stillNeedsRestartAsync();
    } catch {
      // For example, a file that the capture reads was being rewritten. The next call tries again.
    }
    if (this.#stopped) return;
    if (stillNeeded) {
      this.#schedule();
    } else {
      this.withdrawn = true;
      this.#onWithdrawn();
    }
  }
}

/**
 * Arbitrates process restarts between requests whose environments differ from the running daemon.
 * A request that needs a restart waits until every other request this process can serve has finished,
 * so a mismatched environment never preempts queued or in-flight work that matches the running process.
 * A request that finds during or after the drain that it no longer needs the restart, since the change that needed it
 * was reverted, withdraws the restart.
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
      runsScript: options?.runsScript === true,
      restartReason: undefined
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
   * fails or is cancelled. A request that finds it no longer needs one withdraws its restart.
   */
  public hasPendingRestart(ticket: IWorkspaceRestartTicket): boolean {
    return Array.from(this.#restartCandidates).some((candidate: IMutableTicket) => candidate !== ticket);
  }

  /**
   * Records that a request which drained for a restart no longer needs one, for example because the change was
   * reverted, so that requests waiting for its restart stop waiting. Does nothing for other requests.
   */
  public withdrawRestart(ticket: IWorkspaceRestartTicket): void {
    if (this.#restartCandidates.delete(ticket as IMutableTicket)) this.#notifyChange();
  }

  /**
   * Waits until no other tracked request is still being served by this process, then counts the ticket
   * as served again so concurrent restart candidates proceed one at a time. From when the wait begins until the
   * ticket leaves, {@link WorkspaceRestartArbiter.hasPendingRestart} reports the restart to other requests. If
   * `recheck` finds that the request no longer needs the restart, the wait ends then and the restart is withdrawn.
   */
  public async waitForDrainAsync(
    ticket: IWorkspaceRestartTicket,
    options: IWorkspaceRestartDrainOptions,
    recheck?: IWorkspaceRestartRecheck
  ): Promise<IWorkspaceRestartWaitResult> {
    const cause: string | undefined = formatCause(options.restartReason, 'thisRequest');
    return await this.#waitAsync(ticket, options, {
      restarts: true,
      isBlocked: () => this.#serving.size > 0,
      getWaitedFor: () => this.#serving,
      getRestartReason: () => options.restartReason,
      recheck,
      getNoWaitMessage: () =>
        cause === undefined
          ? 'Another environment is still being served; the request did not wait for a restart.'
          : `The daemon is still serving other requests, which finish before it restarts ${cause}; ` +
            'the request did not wait for a restart.',
      getTimeoutPrefix: () =>
        cause === undefined
          ? `The request was not admitted before the daemon could restart ${ENVIRONMENT_RESTART_CAUSE}, which waits for`
          : `The request was not admitted before the daemon could restart ${cause}. The restart waits for`
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
  ): Promise<IWorkspaceRestartWaitResult> {
    const getRestartReason = (): DaemonRestartReason | undefined =>
      Array.from(this.#restartCandidates).find((candidate: IMutableTicket) => candidate !== ticket)
        ?.restartReason;
    return await this.#waitAsync(ticket, options, {
      restarts: false,
      isBlocked: () => this.hasPendingRestart(ticket),
      getWaitedFor: () => new Set([...this.#serving, ...this.#restartCandidates]),
      getRestartReason,
      recheck: undefined,
      getNoWaitMessage: () => {
        const cause: string = formatCause(getRestartReason(), 'anotherRequest') ?? ENVIRONMENT_RESTART_CAUSE;
        return `Another request is waiting to restart the daemon ${cause}; the rushx script did not wait for the restart.`;
      },
      getTimeoutPrefix: () => {
        const cause: string | undefined = formatCause(getRestartReason(), 'anotherRequest');
        return (
          (cause === undefined
            ? "The rushx script was not admitted before the daemon could restart for another request's environment."
            : `The rushx script was not admitted before the daemon could restart for another request, ${cause}.`) +
          ' A script waits for a pending restart so that the restart does not wait for the script, and the ' +
          'restart waits for'
        );
      }
    });
  }

  async #waitAsync(
    ticket: IWorkspaceRestartTicket,
    options: IWorkspaceRestartDrainOptions,
    kind: IWaitKind
  ): Promise<IWorkspaceRestartWaitResult> {
    const state: IMutableTicket = ticket as IMutableTicket;
    if (state.left || state.waitingForDrain) throw new Error('The restart ticket is not being served.');
    if (kind.restarts) {
      state.restartReason = options.restartReason;
      this.#restartCandidates.add(state);
    }
    state.waitingForDrain = true;
    this.#stopServing(state);
    const waivedFor: IMutableTicket[] = options.waivesTimeoutForServedWork ? Array.from(this.#serving) : [];
    let remainingMs: number | undefined = options.waitTimeoutMs;
    let waivedMs: number = 0;
    let reported: string | undefined;
    const report = (): void => {
      const waitedFor: ReadonlySet<IMutableTicket> = kind.getWaitedFor();
      if (waitedFor.size === 0) return;
      const waitReport: IWorkspaceRestartWaitReport = {
        scriptCount: Array.from(waitedFor).filter((waited: IMutableTicket) => waited.runsScript).length,
        restartReason: kind.getRestartReason()
      };
      const key: string = JSON.stringify([waitedFor.size, waitReport.scriptCount, waitReport.restartReason]);
      if (key !== reported) {
        reported = key;
        options.onServingCountChanged?.(waitedFor.size, waitReport);
      }
    };
    // The ticket is a restart candidate for as long as the wait lasts, so withdrawing its restart wakes the wait.
    const recheck: RestartRecheck | undefined = kind.recheck
      ? new RestartRecheck(kind.recheck, () => this.withdrawRestart(ticket))
      : undefined;
    try {
      while (!recheck?.withdrawn && kind.isBlocked()) {
        if (options.noWait) {
          throw new RequestSchedulerError(RequestSchedulerErrorCode.NoWait, kind.getNoWaitMessage());
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
      return { waivedMs, restartWithdrawn: recheck?.withdrawn === true };
    } finally {
      recheck?.stop();
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
      `${kind.getTimeoutPrefix()} the requests that the daemon is serving to finish` +
        `${script ? SCRIPT_TIMEOUT_CLAUSE : ''}${formatWaivedTime(waivedMs)}. ` +
        (script ? SCRIPT_TIMEOUT_REMEDY : TIMEOUT_REMEDY)
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
