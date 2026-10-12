// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonShutdownDeadlineError, type DaemonShutdownStage } from './DaemonShutdownDeadlineError';

/** Where a shutdown is when it is cut short. */
export interface IDaemonShutdownProgress {
  readonly stage: DaemonShutdownStage;
  readonly unfinishedRequests: ReadonlyArray<string>;
}

/** Options for {@link DaemonShutdownDeadline}. */
export interface IDaemonShutdownDeadlineOptions {
  /** How long a shutdown may take. Without it, only {@link DaemonShutdownDeadline.expire} cuts one short. */
  readonly timeoutMs: number | undefined;
  readonly getProgress: () => IDaemonShutdownProgress;
  /** Reports a failure of cleanup that finished after the shutdown was cut short. */
  readonly onLateFailure: (error: Error) => void;
}

/**
 * Races a shutdown's cleanup against its deadline, so that an await that ignores cancellation cannot keep the
 * daemon from exiting.
 */
export class DaemonShutdownDeadline {
  readonly #options: IDaemonShutdownDeadlineOptions;
  #forcedBy: string | undefined;
  #cutShort: ((forcedBy: string | undefined) => void) | undefined;

  public constructor(options: IDaemonShutdownDeadlineOptions) {
    this.#options = options;
  }

  /**
   * Settles as the cleanup does, unless the deadline passes or {@link DaemonShutdownDeadline.expire} is called
   * first. Then it rejects with {@link DaemonShutdownDeadlineError}, and the cleanup goes on in the background.
   */
  public async raceAsync(cleanup: Promise<void>): Promise<void> {
    const startedAtMs: number = Date.now();
    let timer: NodeJS.Timeout | undefined;
    const cutShort: Promise<void> = new Promise<void>((resolve, reject) => {
      this.#cutShort = (forcedBy: string | undefined) =>
        reject(
          new DaemonShutdownDeadlineError({
            ...this.#options.getProgress(),
            elapsedMs: Date.now() - startedAtMs,
            forcedBy
          })
        );
    });
    if (this.#forcedBy !== undefined) {
      this.#cutShort?.(this.#forcedBy);
    } else if (this.#options.timeoutMs !== undefined) {
      timer = setTimeout(() => this.#cutShort?.(undefined), this.#options.timeoutMs);
    }
    try {
      await Promise.race([cleanup, cutShort]);
    } catch (error) {
      if (error instanceof DaemonShutdownDeadlineError) {
        cleanup.catch((lateError: unknown) =>
          this.#options.onLateFailure(lateError instanceof Error ? lateError : new Error(String(lateError)))
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
      this.#cutShort = undefined;
    }
  }

  /** Cuts the running shutdown short now. A shutdown that has not started yet is cut short when it starts. */
  public expire(forcedBy: string): void {
    this.#forcedBy ??= forcedBy;
    this.#cutShort?.(forcedBy);
  }
}
