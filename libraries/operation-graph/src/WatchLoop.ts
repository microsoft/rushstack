// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { once } from 'node:events';

import { AlreadyReportedError } from '@rushstack/node-core-library';

import type { OperationRequestRunCallback } from './Operation';
import { OperationStatus } from './OperationStatus';
import type {
  IAfterExecuteEventMessage,
  IPCHost,
  CommandMessageFromHost,
  ISyncEventMessage,
  IRequestRunEventMessage
} from './protocol.types';

/**
 * Callbacks for the watch loop.
 *
 * @beta
 */
export interface IWatchLoopOptions {
  /**
   * Callback that performs the core work of a single iteration.
   */
  executeAsync: (state: IWatchLoopState) => Promise<OperationStatus>;
  /**
   * Logging callback immediately before execution occurs.
   */
  onBeforeExecute: () => void;
  /**
   * Logging callback when a run is requested (and hasn't already been).
   *
   * @param requestor - The name of the operation requesting a rerun.
   * @param detail - Optional detail about why the rerun is requested, e.g. the name of a changed file.
   */
  onRequestRun: OperationRequestRunCallback;
  /**
   * Logging callback when a run is aborted.
   */
  onAbort: () => void;
}

/**
 * The public API surface of the watch loop, for use in the `executeAsync` callback.
 *
 * @beta
 */
export interface IWatchLoopState {
  get abortSignal(): AbortSignal;
  requestRun: OperationRequestRunCallback;
}

/**
 * This class implements a watch loop.
 *
 * @beta
 */
export class WatchLoop implements IWatchLoopState {
  readonly #options: Readonly<IWatchLoopOptions>;

  #abortController: AbortController;
  #isRunning: boolean;
  #runRequested: boolean;
  #requestRunPromise: Promise<[string, string?]>;
  #resolveRequestRun!: (value: [string, string?]) => void;

  public constructor(options: IWatchLoopOptions) {
    this.#options = options;

    this.#abortController = new AbortController();
    this.#isRunning = false;
    // Always start as true, so that any requests prior to first run are silenced.
    this.#runRequested = true;
    this.#requestRunPromise = new Promise<[string, string?]>((resolve) => {
      this.#resolveRequestRun = resolve;
    });
  }

  /**
   * Runs the inner loop until the abort signal is cancelled or a run completes without a new run being requested.
   */
  public async runUntilStableAsync(abortSignal: AbortSignal): Promise<OperationStatus> {
    if (abortSignal.aborted) {
      return OperationStatus.Aborted;
    }

    abortSignal.addEventListener('abort', this.#abortCurrent, { once: true });

    try {
      let result: OperationStatus = OperationStatus.Ready;

      do {
        // Always check the abort signal first, in case it was aborted in the async tick since the last executeAsync() call.
        if (abortSignal.aborted) {
          return OperationStatus.Aborted;
        }

        result = await this.#runIterationAsync();
      } while (this.#runRequested);

      // Even if the run has finished, if the abort signal was aborted, we should return `Aborted` just in case.
      return abortSignal.aborted ? OperationStatus.Aborted : result;
    } finally {
      abortSignal.removeEventListener('abort', this.#abortCurrent);
    }
  }

  /**
   * Runs the inner loop until the abort signal is aborted. Will otherwise wait indefinitely for a new run to be requested.
   */
  public async runUntilAbortedAsync(abortSignal: AbortSignal, onWaiting: () => void): Promise<void> {
    if (abortSignal.aborted) {
      return;
    }

    const abortPromise: Promise<unknown> = once(abortSignal, 'abort');

    while (!abortSignal.aborted) {
      await this.runUntilStableAsync(abortSignal);

      onWaiting();
      await Promise.race([this.#requestRunPromise, abortPromise]);
    }
  }

  /**
   * Sets up an IPC handler that will run the inner loop when it receives a "run" message from the host.
   * Runs until receiving an "exit" message from the host, or aborts early if an unhandled error is thrown.
   */
  public async runIPCAsync(host: IPCHost = process): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let abortController: AbortController = new AbortController();

      let runRequestedFromHost: boolean = true;
      let status: OperationStatus = OperationStatus.Ready;

      function tryMessageHost(
        message: ISyncEventMessage | IRequestRunEventMessage | IAfterExecuteEventMessage
      ): void {
        if (!host.send) {
          return reject(new Error('Host does not support IPC'));
        }

        try {
          host.send(message);
        } catch (err) {
          reject(new Error(`Unable to communicate with host: ${err}`));
        }
      }

      function requestRunFromHost(requestor: string, detail?: string): void {
        if (runRequestedFromHost) {
          return;
        }

        runRequestedFromHost = true;

        const requestRunMessage: IRequestRunEventMessage = {
          event: 'requestRun',
          requestor,
          detail
        };

        tryMessageHost(requestRunMessage);
      }

      function sendSync(): void {
        const syncMessage: ISyncEventMessage = {
          event: 'sync',
          status
        };
        tryMessageHost(syncMessage);
      }

      host.on('message', async (message: CommandMessageFromHost) => {
        switch (message.command) {
          case 'exit': {
            return resolve();
          }

          case 'cancel': {
            if (this.#isRunning) {
              abortController.abort();
              abortController = new AbortController();
              // This will terminate the currently executing `runUntilStableAsync` call.
            }
            return;
          }

          case 'run': {
            runRequestedFromHost = false;

            status = OperationStatus.Executing;

            try {
              status = await this.runUntilStableAsync(abortController.signal);
              // ESLINT: "Promises must be awaited, end with a call to .catch, end with a call to .then ..."
              this.#requestRunPromise.then(
                ([requestor, detail]) => requestRunFromHost(requestor, detail),
                (error: Error) => {
                  // Unreachable code. The promise will never be rejected.
                }
              );
            } catch (err) {
              status = OperationStatus.Failure;
              return reject(err);
            } finally {
              const afterExecuteMessage: IAfterExecuteEventMessage = {
                event: 'after-execute',
                status
              };
              tryMessageHost(afterExecuteMessage);
            }
            return;
          }

          case 'sync': {
            return sendSync();
          }

          default: {
            return reject(new Error(`Unexpected command from host: ${message}`));
          }
        }
      });

      sendSync();
    });
  }

  /**
   * Requests that a new run occur.
   */
  public requestRun: OperationRequestRunCallback = (requestor: string, detail?: string) => {
    if (!this.#runRequested) {
      this.#options.onRequestRun(requestor, detail);
      this.#runRequested = true;
      if (this.#isRunning) {
        this.#options.onAbort();
        this.#abortCurrent();
      }
    }
    this.#resolveRequestRun([requestor, detail]);
  };

  /**
   * The abort signal for the current iteration.
   */
  public get abortSignal(): AbortSignal {
    return this.#abortController.signal;
  }

  /**
   * Cancels the current iteration (if possible).
   */
  #abortCurrent = (): void => {
    this.#abortController.abort();
  };

  /**
   * Resets the abort signal and run request state.
   */
  #reset(): void {
    if (this.#abortController.signal.aborted) {
      this.#abortController = new AbortController();
    }

    if (this.#runRequested) {
      this.#runRequested = false;
      this.#requestRunPromise = new Promise<[string, string?]>((resolve) => {
        this.#resolveRequestRun = resolve;
      });
    }
  }

  /**
   * Runs a single iteration of the loop.
   * @returns The status of the iteration.
   */
  async #runIterationAsync(): Promise<OperationStatus> {
    this.#reset();

    this.#options.onBeforeExecute();
    try {
      this.#isRunning = true;
      return await this.#options.executeAsync(this);
    } catch (err) {
      if (!(err instanceof AlreadyReportedError)) {
        throw err;
      } else {
        return OperationStatus.Failure;
      }
    } finally {
      this.#isRunning = false;
    }
  }
}
