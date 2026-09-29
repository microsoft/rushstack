// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const MAX_TIMER_DELAY_MS: number = 0x7fffffff;

/** What one idle garbage collection returned, and how long it paused the daemon. */
export interface IDaemonIdleGarbageCollection {
  readonly durationMs: number;
  readonly heapUsedBytesBefore: number;
  readonly heapUsedBytesAfter: number;
  readonly residentBytesBefore: number;
  readonly residentBytesAfter: number;
}

export interface IDaemonIdleGarbageCollectorOptions {
  /** How long no request may be pending, and no engine work running, before the collection starts. */
  readonly delayMs: number;
  /** Runs one full garbage collection that returns the freed heap pages to the operating system. */
  readonly collect: () => void;
  /** Whether engine work that no request waits for, such as an iteration that its clients left, is running. */
  readonly isEngineBusy: () => boolean;
  readonly onCollected: (collection: IDaemonIdleGarbageCollection) => void;
  /**
   * Receives the error from a collection that failed, or whose memory use could not be read. The collector then
   * stops.
   */
  readonly onError: (error: Error) => void;
}

/**
 * Runs one memory-reducing garbage collection after each request, once the daemon has been idle for a while.
 *
 * @remarks
 * Full collections during a request free the heap but keep its pages pooled, so the daemon keeps the resident memory
 * of its busiest recent request. V8's memory reducer returns the pages only when one of its checks, 8 seconds apart,
 * finds the mutator idle, and after some requests none does. This collector runs one collection once no request has
 * been pending for the delay and the engine is idle. It never starts one while a request is pending, and it does
 * not start another until a request settles again.
 */
export class DaemonIdleGarbageCollector implements Disposable {
  readonly #options: IDaemonIdleGarbageCollectorOptions;
  #activeRequests: number = 0;
  #settledSinceCollection: boolean = false;
  #stopped: boolean = false;
  #timer: NodeJS.Timeout | undefined;

  public constructor(options: IDaemonIdleGarbageCollectorOptions) {
    const { delayMs } = options;
    if (!Number.isFinite(delayMs) || delayMs <= 0 || delayMs > MAX_TIMER_DELAY_MS) {
      throw new RangeError(
        `The idle garbage collection delay must be greater than zero and at most ${MAX_TIMER_DELAY_MS} ms.`
      );
    }
    this.#options = options;
  }

  /** Counts a request as pending until the returned function is called. */
  public acquire(): () => void {
    this.#activeRequests++;
    this.#clearTimer();
    let released: boolean = false;
    return () => {
      if (released) return;
      released = true;
      this.#activeRequests--;
      this.#settledSinceCollection = true;
      this.#schedule();
    };
  }

  public [Symbol.dispose](): void {
    this.#stopped = true;
    this.#clearTimer();
  }

  #schedule(): void {
    this.#clearTimer();
    if (this.#stopped || this.#activeRequests !== 0 || !this.#settledSinceCollection) return;
    this.#timer = setTimeout(() => this.#collectWhenIdle(), this.#options.delayMs);
    this.#timer.unref();
  }

  #clearTimer(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  #collectWhenIdle(): void {
    this.#timer = undefined;
    if (this.#options.isEngineBusy()) {
      // The engine is still running work that no request waits for; wait a whole delay again.
      this.#schedule();
      return;
    }
    this.#settledSinceCollection = false;
    let collection: IDaemonIdleGarbageCollection;
    try {
      collection = measureCollection(this.#options.collect);
    } catch (error) {
      this.#stopped = true;
      this.#options.onError(error as Error);
      return;
    }
    this.#options.onCollected(collection);
  }
}

function measureCollection(collect: () => void): IDaemonIdleGarbageCollection {
  // Reading the resident memory can fail too, for example when the process has no file descriptor left.
  const before: NodeJS.MemoryUsage = process.memoryUsage();
  const startTime: number = performance.now();
  collect();
  const durationMs: number = performance.now() - startTime;
  const after: NodeJS.MemoryUsage = process.memoryUsage();
  return {
    durationMs,
    heapUsedBytesBefore: before.heapUsed,
    heapUsedBytesAfter: after.heapUsed,
    residentBytesBefore: before.rss,
    residentBytesAfter: after.rss
  };
}
