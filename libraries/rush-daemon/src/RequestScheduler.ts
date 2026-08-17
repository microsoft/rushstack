// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Describes which daemon requests may execute concurrently.
 *
 * @public
 */
export enum RequestExclusivityClass {
  SharedBuild = 'SHARED-BUILD',
  SharedRead = 'SHARED-READ',
  Exclusive = 'EXCLUSIVE'
}

/**
 * Identifies why admission to the scheduler failed.
 *
 * @public
 */
export enum RequestSchedulerErrorCode {
  Aborted = 'ABORTED',
  NoWait = 'NO_WAIT',
  WaitTimeout = 'WAIT_TIMEOUT'
}

const MAX_TIMER_DELAY_MS: number = 0x7fffffff;

/**
 * An error raised when a request cannot be admitted.
 *
 * @public
 */
export class RequestSchedulerError extends Error {
  public readonly code: RequestSchedulerErrorCode;

  public constructor(code: RequestSchedulerErrorCode, message: string) {
    super(message);
    this.name = RequestSchedulerError.name;
    this.code = code;
  }
}

/**
 * Options that control admission to a {@link RequestScheduler}.
 *
 * @public
 */
export interface IRequestSchedulerAcquireOptions {
  /**
   * The compatibility class for the request.
   */
  exclusivityClass: RequestExclusivityClass;

  /**
   * Fail immediately instead of entering the queue.
   */
  noWait?: boolean;

  /**
   * The maximum time to wait in the queue. There is no timeout when omitted.
   */
  waitTimeoutMs?: number;

  /**
   * Cancels this request while it is waiting. Releasing an admitted request remains the caller's responsibility.
   */
  abortSignal?: AbortSignal;

  /**
   * Called with the request's one-based position whenever the queue changes. If the callback throws,
   * the scheduler reports the error as a process warning and continues processing the queue.
   */
  onQueuePositionChanged?: (position: number) => void;
}

/**
 * A scheduler admission. The caller must release the lease when its request finishes.
 *
 * @public
 */
export interface IRequestLease {
  readonly exclusivityClass: RequestExclusivityClass;
  release(): void;
}

interface IQueuedRequest {
  readonly options: IRequestSchedulerAcquireOptions;
  readonly resolve: (lease: IRequestLease) => void;
  readonly reject: (error: Error) => void;
  timeout: NodeJS.Timeout | undefined;
  abortListener: (() => void) | undefined;
}

/**
 * Provides fair, queue-and-wait admission for daemon requests.
 *
 * Requests of the same shared class may execute concurrently. Different shared classes are serialized because
 * they access different consistency views of the workspace. Exclusive requests execute alone. Once an exclusive
 * request reaches the queue, it gates all requests behind it until it has executed.
 *
 * @public
 */
export class RequestScheduler {
  private readonly _queue: IQueuedRequest[] = [];
  private _activeClass: RequestExclusivityClass | undefined;
  private _activeRequestCount: number = 0;

  /**
   * The number of requests currently waiting for admission.
   */
  public get queuedRequestCount(): number {
    return this._queue.length;
  }

  /**
   * The number of requests that currently hold a lease.
   */
  public get activeRequestCount(): number {
    return this._activeRequestCount;
  }

  /**
   * Waits until the request is compatible with all active requests and earlier queued requests.
   */
  public acquireAsync(options: IRequestSchedulerAcquireOptions): Promise<IRequestLease> {
    try {
      this._validateOptions(options);
    } catch (error) {
      return Promise.reject(error);
    }

    if (options.abortSignal?.aborted) {
      return Promise.reject(
        new RequestSchedulerError(RequestSchedulerErrorCode.Aborted, 'The request was aborted before admission.')
      );
    }

    if (this._queue.length === 0 && this._canAdmit(options.exclusivityClass)) {
      return Promise.resolve(this._createLease(options.exclusivityClass));
    }

    if (options.noWait) {
      return Promise.reject(
        new RequestSchedulerError(
          RequestSchedulerErrorCode.NoWait,
          'The request cannot be admitted immediately and --no-wait was specified.'
        )
      );
    }

    return new Promise<IRequestLease>((resolve, reject) => {
      const request: IQueuedRequest = {
        options,
        resolve,
        reject,
        timeout: undefined,
        abortListener: undefined
      };

      if (options.waitTimeoutMs !== undefined) {
        request.timeout = setTimeout(() => {
          this._rejectQueuedRequest(
            request,
            new RequestSchedulerError(
              RequestSchedulerErrorCode.WaitTimeout,
              `The request was not admitted within ${options.waitTimeoutMs}ms.`
            )
          );
        }, options.waitTimeoutMs);
      }

      if (options.abortSignal) {
        request.abortListener = () => {
          this._rejectQueuedRequest(
            request,
            new RequestSchedulerError(RequestSchedulerErrorCode.Aborted, 'The request was aborted while waiting.')
          );
        };
        options.abortSignal.addEventListener('abort', request.abortListener, { once: true });
      }
      this._queue.push(request);
      this._notifyQueuePositions();
      this._drainQueue();
    });
  }

  private _validateOptions(options: IRequestSchedulerAcquireOptions): void {
    if (
      options.waitTimeoutMs !== undefined &&
      (!Number.isFinite(options.waitTimeoutMs) ||
        options.waitTimeoutMs < 0 ||
        options.waitTimeoutMs > MAX_TIMER_DELAY_MS)
    ) {
      throw new RangeError(`waitTimeoutMs must be between 0 and ${MAX_TIMER_DELAY_MS}.`);
    }
  }

  private _canAdmit(exclusivityClass: RequestExclusivityClass): boolean {
    if (this._activeRequestCount === 0) {
      return true;
    }

    return (
      exclusivityClass !== RequestExclusivityClass.Exclusive && exclusivityClass === this._activeClass
    );
  }

  private _createLease(exclusivityClass: RequestExclusivityClass): IRequestLease {
    this._activeClass = exclusivityClass;
    this._activeRequestCount++;

    let released: boolean = false;
    return {
      exclusivityClass,
      release: (): void => {
        if (released) {
          return;
        }

        released = true;
        this._activeRequestCount--;
        if (this._activeRequestCount === 0) {
          this._activeClass = undefined;
        }
        this._drainQueue();
      }
    };
  }

  private _drainQueue(): void {
    let admittedRequest: boolean = false;
    while (this._queue.length > 0) {
      const request: IQueuedRequest = this._queue[0];
      if (!this._canAdmit(request.options.exclusivityClass)) {
        break;
      }

      this._queue.shift();
      this._cleanupQueuedRequest(request);
      request.resolve(this._createLease(request.options.exclusivityClass));
      admittedRequest = true;
    }

    if (admittedRequest) {
      this._notifyQueuePositions();
    }
  }

  private _rejectQueuedRequest(request: IQueuedRequest, error: Error): void {
    const index: number = this._queue.indexOf(request);
    if (index < 0) {
      return;
    }

    this._queue.splice(index, 1);
    this._cleanupQueuedRequest(request);
    request.reject(error);
    this._notifyQueuePositions();
    this._drainQueue();
  }

  private _cleanupQueuedRequest(request: IQueuedRequest): void {
    if (request.timeout) {
      clearTimeout(request.timeout);
      request.timeout = undefined;
    }
    if (request.options.abortSignal && request.abortListener) {
      request.options.abortSignal.removeEventListener('abort', request.abortListener);
      request.abortListener = undefined;
    }
  }

  private _notifyQueuePositions(): void {
    for (let index: number = 0; index < this._queue.length; index++) {
      try {
        this._queue[index].options.onQueuePositionChanged?.(index + 1);
      } catch (error) {
        process.emitWarning(error instanceof Error ? error : String(error), {
          code: 'RUSH_DAEMON_QUEUE_POSITION_CALLBACK_ERROR'
        });
      }
    }
  }
}
