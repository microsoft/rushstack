// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RequestSchedulerError, RequestSchedulerErrorCode } from './RequestScheduler';

const MAX_TIMER_DELAY_MS: number = 0x7fffffff;

/** One dispatched request tracked by a {@link WorkspaceRestartArbiter}. */
export interface IWorkspaceRestartTicket {
  readonly waitingForDrain: boolean;
}

interface IMutableTicket {
  waitingForDrain: boolean;
  left: boolean;
}

/** Options for {@link WorkspaceRestartArbiter.waitForDrainAsync}, supplied by request admission. */
export interface IWorkspaceRestartDrainOptions {
  readonly abortSignal: AbortSignal;
  readonly noWait: boolean | undefined;
  readonly waitTimeoutMs: number | undefined;
}

/**
 * Arbitrates process restarts between requests whose environments differ from the running daemon.
 * A request that needs a restart waits until every other request this process can serve has finished,
 * so a mismatched environment never preempts queued or in-flight work that matches the running process.
 */
export class WorkspaceRestartArbiter {
  readonly #listeners: Set<() => void> = new Set();
  #servingCount: number = 0;

  /** The number of tracked requests that are not waiting for a restart. */
  public get servingCount(): number {
    return this.#servingCount;
  }

  public enter(): IWorkspaceRestartTicket {
    this.#servingCount++;
    const ticket: IMutableTicket = { waitingForDrain: false, left: false };
    return ticket;
  }

  public leave(ticket: IWorkspaceRestartTicket): void {
    const state: IMutableTicket = ticket as IMutableTicket;
    if (state.left) return;
    state.left = true;
    if (!state.waitingForDrain) this.#decrement();
  }

  /**
   * Waits until no other tracked request is still being served by this process, then counts the ticket
   * as served again so concurrent restart candidates proceed one at a time.
   */
  public async waitForDrainAsync(
    ticket: IWorkspaceRestartTicket,
    options: IWorkspaceRestartDrainOptions
  ): Promise<void> {
    const state: IMutableTicket = ticket as IMutableTicket;
    if (state.left || state.waitingForDrain) throw new Error('The restart ticket is not being served.');
    state.waitingForDrain = true;
    this.#decrement();
    try {
      const deadline: number | undefined =
        options.waitTimeoutMs === undefined ? undefined : Date.now() + options.waitTimeoutMs;
      while (this.#servingCount > 0) {
        if (options.noWait) {
          throw new RequestSchedulerError(
            RequestSchedulerErrorCode.NoWait,
            'Another environment is still being served; the request did not wait for a restart.'
          );
        }
        await this.#waitForChangeAsync(options.abortSignal, deadline);
      }
    } finally {
      state.waitingForDrain = false;
      this.#servingCount++;
    }
  }

  #decrement(): void {
    this.#servingCount--;
    if (this.#servingCount === 0) {
      for (const listener of Array.from(this.#listeners)) listener();
    }
  }

  #waitForChangeAsync(abortSignal: AbortSignal, deadline: number | undefined): Promise<void> {
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
          new RequestSchedulerError(RequestSchedulerErrorCode.Aborted, 'The request was aborted before execution.')
        );
      if (abortSignal.aborted) {
        settleAborted();
        return;
      }
      this.#listeners.add(settle);
      abortSignal.addEventListener('abort', settleAborted, { once: true, signal: unsubscribe.signal });
      if (deadline !== undefined) {
        timer = setTimeout(
          () =>
            settle(
              new RequestSchedulerError(
                RequestSchedulerErrorCode.WaitTimeout,
                'The request was not admitted before the daemon could restart for its environment.'
              )
            ),
          Math.min(MAX_TIMER_DELAY_MS, Math.max(0, deadline - Date.now()))
        );
      }
    });
  }
}
