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

  /**
   * Admit a shared request at once, ahead of the queued requests, if it is compatible with every active request and
   * one of them was admitted in queue order, so that the queued requests wait for that one anyway. Otherwise the
   * request waits in queue order like any other.
   *
   * @remarks
   * For a short request that should not wait behind a queued request that itself waits for a long one, such as a
   * rushx script, which needs its lease only until it starts, behind a reload that waits for a running build. Such
   * requests cannot keep the queued requests waiting indefinitely: once every active request was admitted ahead of
   * the queue, later ones wait in it.
   */
  admitAheadOfQueue?: boolean;
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

interface ILeaseState {
  exclusivityClass: RequestExclusivityClass;
  /** Whether the lease was admitted ahead of queued requests; see `admitAheadOfQueue`. */
  readonly aheadOfQueue: boolean;
  onPreempted: (() => void) | undefined;
  /** Whether `onPreempted` was called, so that the lease's owner is stopping its work. */
  preempted: boolean;
  released: boolean;
  readonly onReleased: (() => void)[];
}

/**
 * Provides fair, queue-and-wait admission for daemon requests.
 *
 * Requests of the same shared class may execute concurrently. Different shared classes are serialized because
 * they access different consistency views of the workspace. Exclusive requests execute alone. Once an exclusive
 * request reaches the queue, it gates all requests behind it until it has executed. The one exception is a shared
 * request that asks to be admitted ahead of the queue (`admitAheadOfQueue`) while a compatible request that was
 * admitted in queue order is still active.
 *
 * @public
 */
export class RequestScheduler {
  readonly #queue: IQueuedRequest[] = [];
  #activeClass: RequestExclusivityClass | undefined;
  #activeRequestCount: number = 0;
  /** How many of the active leases were admitted ahead of queued requests. */
  #aheadOfQueueCount: number = 0;
  readonly #activeLeaseStates: Set<ILeaseState> = new Set();
  readonly #leaseStates: WeakMap<IRequestLease, ILeaseState> = new WeakMap();

  /**
   * Atomically reduces an exclusive owner's rights without opening a gap in admission.
   * Used to publish a reloaded generation and retain it while the initiating request executes.
   */
  public downgradeExclusiveLease(
    lease: IRequestLease,
    target: RequestExclusivityClass.SharedBuild | RequestExclusivityClass.SharedRead
  ): void {
    const state: ILeaseState | undefined = this.#leaseStates.get(lease);
    if (!state || state.released || state.exclusivityClass !== RequestExclusivityClass.Exclusive) {
      throw new Error('Only an active exclusive lease from this scheduler can be downgraded.');
    }
    state.exclusivityClass = target;
    this.#activeClass = target;
    this.#drainQueue();
  }

  /**
   * Lets requests that cannot be admitted alongside an active lease preempt it. `onPreempted` is called once, as
   * soon as such a request waits for admission; the lease's owner should then stop its work and release the lease.
   *
   * @remarks
   * For a request that no client waits for any more, such as a failed build that returned its result while its
   * independent operations continue, so that it never delays another request.
   */
  public markLeasePreemptible(lease: IRequestLease, onPreempted: () => void): void {
    const state: ILeaseState | undefined = this.#leaseStates.get(lease);
    if (!state || state.released) {
      throw new Error('Only an active lease from this scheduler can be marked preemptible.');
    }
    state.onPreempted = onPreempted;
    this.#preemptIfContended();
  }

  /**
   * Preempts every active lease that was marked preemptible, as a request that cannot be admitted alongside it
   * would, and resolves once all of them are released. Other leases and queued requests are not affected.
   *
   * @remarks
   * For a request that the daemon does not serve, so that the command which its client then runs in-process does
   * not run alongside work that nobody waits for.
   */
  public preemptLeasesAsync(): Promise<void> {
    const releases: Promise<void>[] = [];
    for (const state of Array.from(this.#activeLeaseStates)) {
      if (state.onPreempted || state.preempted) {
        releases.push(new Promise((resolve) => state.onReleased.push(resolve)));
        this.#preempt(state);
      }
    }
    return Promise.all(releases).then(() => undefined);
  }

  /**
   * Reports every queued request's position to it again, as when the queue changes, for a caller whose reports say
   * more than the position, such as what the queue waits for, when that changed.
   */
  public notifyQueuePositions(): void {
    this.#notifyQueuePositions();
  }

  /**
   * The number of requests currently waiting for admission.
   */
  public get queuedRequestCount(): number {
    return this.#queue.length;
  }

  /**
   * The number of requests that currently hold a lease.
   */
  public get activeRequestCount(): number {
    return this.#activeRequestCount;
  }

  /**
   * Whether a request holds a lease, and every lease that is held was marked preemptible (see
   * {@link RequestScheduler.markLeasePreemptible}) or was already preempted. A queued request that cannot be admitted
   * alongside them then waits only while their owners stop their work.
   */
  public get activeLeasesArePreemptible(): boolean {
    const states: ILeaseState[] = Array.from(this.#activeLeaseStates);
    return states.length > 0 && states.every((state: ILeaseState) => !!state.onPreempted || state.preempted);
  }

  /**
   * Waits until the request is compatible with all active requests and earlier queued requests. With
   * `admitAheadOfQueue`, compatibility with the active requests can be enough; see that option.
   */
  public acquireAsync(options: IRequestSchedulerAcquireOptions): Promise<IRequestLease> {
    try {
      this.#validateOptions(options);
    } catch (error) {
      return Promise.reject(error);
    }

    if (options.abortSignal?.aborted) {
      return Promise.reject(
        new RequestSchedulerError(
          RequestSchedulerErrorCode.Aborted,
          'The request was aborted before admission.'
        )
      );
    }

    if (this.#canAdmit(options.exclusivityClass)) {
      if (this.#queue.length === 0) {
        return Promise.resolve(this.#createLease(options.exclusivityClass, false));
      }
      if (options.admitAheadOfQueue && this.#activeRequestCount > this.#aheadOfQueueCount) {
        return Promise.resolve(this.#createLease(options.exclusivityClass, true));
      }
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
          this.#rejectQueuedRequest(
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
          this.#rejectQueuedRequest(
            request,
            new RequestSchedulerError(
              RequestSchedulerErrorCode.Aborted,
              'The request was aborted while waiting.'
            )
          );
        };
        options.abortSignal.addEventListener('abort', request.abortListener, { once: true });
      }
      this.#queue.push(request);
      this.#notifyQueuePositions();
      this.#drainQueue();
    });
  }

  #validateOptions(options: IRequestSchedulerAcquireOptions): void {
    if (
      options.waitTimeoutMs !== undefined &&
      (!Number.isFinite(options.waitTimeoutMs) ||
        options.waitTimeoutMs < 0 ||
        options.waitTimeoutMs > MAX_TIMER_DELAY_MS)
    ) {
      throw new RangeError(`waitTimeoutMs must be between 0 and ${MAX_TIMER_DELAY_MS}.`);
    }
  }

  #canAdmit(exclusivityClass: RequestExclusivityClass): boolean {
    if (this.#activeRequestCount === 0) {
      return true;
    }

    return exclusivityClass !== RequestExclusivityClass.Exclusive && exclusivityClass === this.#activeClass;
  }

  #createLease(exclusivityClass: RequestExclusivityClass, aheadOfQueue: boolean): IRequestLease {
    this.#activeClass = exclusivityClass;
    this.#activeRequestCount++;
    if (aheadOfQueue) this.#aheadOfQueueCount++;

    const state: ILeaseState = {
      exclusivityClass,
      aheadOfQueue,
      onPreempted: undefined,
      preempted: false,
      released: false,
      onReleased: []
    };
    const lease: IRequestLease = {
      get exclusivityClass(): RequestExclusivityClass {
        return state.exclusivityClass;
      },
      release: (): void => {
        if (state.released) {
          return;
        }

        state.released = true;
        state.onPreempted = undefined;
        this.#activeLeaseStates.delete(state);
        this.#activeRequestCount--;
        if (state.aheadOfQueue) this.#aheadOfQueueCount--;
        if (this.#activeRequestCount === 0) {
          this.#activeClass = undefined;
        }
        this.#drainQueue();
        for (const onReleased of state.onReleased.splice(0)) {
          onReleased();
        }
      }
    };
    this.#leaseStates.set(lease, state);
    this.#activeLeaseStates.add(state);
    return lease;
  }

  #drainQueue(): void {
    let admittedRequest: boolean = false;
    while (this.#queue.length > 0) {
      const request: IQueuedRequest = this.#queue[0];
      if (!this.#canAdmit(request.options.exclusivityClass)) {
        break;
      }

      this.#queue.shift();
      this.#cleanupQueuedRequest(request);
      request.resolve(this.#createLease(request.options.exclusivityClass, false));
      admittedRequest = true;
    }

    if (admittedRequest) {
      this.#notifyQueuePositions();
    }
    this.#preemptIfContended();
  }

  #preemptIfContended(): void {
    const head: IQueuedRequest | undefined = this.#queue[0];
    if (!head || this.#canAdmit(head.options.exclusivityClass)) {
      return;
    }
    for (const state of Array.from(this.#activeLeaseStates)) {
      this.#preempt(state);
    }
  }

  #preempt(state: ILeaseState): void {
    const onPreempted: (() => void) | undefined = state.onPreempted;
    if (!onPreempted) {
      return;
    }
    state.onPreempted = undefined;
    state.preempted = true;
    try {
      onPreempted();
    } catch (error) {
      process.emitWarning(error instanceof Error ? error : String(error), {
        code: 'RUSH_DAEMON_LEASE_PREEMPTION_CALLBACK_ERROR'
      });
    }
  }

  #rejectQueuedRequest(request: IQueuedRequest, error: Error): void {
    const index: number = this.#queue.indexOf(request);
    if (index < 0) {
      return;
    }

    this.#queue.splice(index, 1);
    this.#cleanupQueuedRequest(request);
    request.reject(error);
    this.#notifyQueuePositions();
    this.#drainQueue();
  }

  #cleanupQueuedRequest(request: IQueuedRequest): void {
    if (request.timeout) {
      clearTimeout(request.timeout);
      request.timeout = undefined;
    }
    if (request.options.abortSignal && request.abortListener) {
      request.options.abortSignal.removeEventListener('abort', request.abortListener);
      request.abortListener = undefined;
    }
  }

  #notifyQueuePositions(): void {
    for (let index: number = 0; index < this.#queue.length; index++) {
      try {
        this.#queue[index].options.onQueuePositionChanged?.(index + 1);
      } catch (error) {
        process.emitWarning(error instanceof Error ? error : String(error), {
          code: 'RUSH_DAEMON_QUEUE_POSITION_CALLBACK_ERROR'
        });
      }
    }
  }
}
