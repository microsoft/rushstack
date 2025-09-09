// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Options for controlling the parallelism of asynchronous operations.
 *
 * @remarks
 * Used with {@link (Async:class).(mapAsync:1)}, {@link (Async:class).(mapAsync:2)} and
 * {@link (Async:class).(forEachAsync:1)}, and {@link (Async:class).(forEachAsync:2)}.
 *
 * @public
 */
export interface IAsyncParallelismOptions {
  /**
   * Optionally used with the  {@link (Async:class).(mapAsync:1)}, {@link (Async:class).(mapAsync:2)} and
   * {@link (Async:class).(forEachAsync:1)}, and {@link (Async:class).(forEachAsync:2)} to limit the maximum
   * number of concurrent promises to the specified number.
   */
  concurrency?: number;

  /**
   * Optionally used with the {@link (Async:class).(forEachAsync:2)} to enable weighted operations where an operation can
   * take up more or less than one concurrency unit.
   */
  weighted?: boolean;
}

/**
 * @remarks
 * Used with {@link Async.runWithRetriesAsync}.
 *
 * @public
 */
export interface IRunWithRetriesOptions<TResult> {
  /**
   * The action to be performed. The action is repeatedly executed until it completes without throwing or the
   * maximum number of retries is reached.
   *
   * @param retryCount - The number of times the action has been retried.
   */
  action: (retryCount: number) => Promise<TResult> | TResult;
  /**
   * The maximum number of times the action should be retried.
   */
  maxRetries: number;
  /**
   * The delay in milliseconds between retries.
   */
  retryDelayMs?: number;
}

/**
 * @remarks
 * Used with {@link Async.runWithTimeoutAsync}.
 *
 * @public
 */
export interface IRunWithTimeoutOptions<TResult> {
  /**
   * The action to be performed. The action is executed with a timeout.
   */
  action: () => Promise<TResult> | TResult;
  /**
   * The timeout in milliseconds.
   */
  timeoutMs: number;
  /**
   * The message to use for the error if the timeout is reached.
   */
  timeoutMessage?: string;
}

/**
 * @remarks
 * Used with {@link (Async:class).(forEachAsync:2)} and {@link (Async:class).(mapAsync:2)}.
 *
 * @public
 */
export interface IWeighted {
  /**
   * The weight of the element, used to determine the concurrency units that it will take up.
   *  Must be a whole number greater than or equal to 0.
   */
  weight: number;
}

function toWeightedIterator<TEntry>(
  iterable: Iterable<TEntry> | AsyncIterable<TEntry>,
  useWeights?: boolean
): AsyncIterable<{ element: TEntry; weight: number }> {
  const iterator: Iterator<TEntry> | AsyncIterator<TEntry, TEntry> = (
    (iterable as Iterable<TEntry>)[Symbol.iterator] ||
    (iterable as AsyncIterable<TEntry>)[Symbol.asyncIterator]
  ).call(iterable);
  return {
    [Symbol.asyncIterator]: () => ({
      // eslint-disable-next-line @typescript-eslint/naming-convention
      next: async () => {
        // The await is necessary here, but TS will complain - it's a false positive.
        const { value, done } = await iterator.next();
        return {
          value: { element: value, weight: useWeights ? value?.weight : 1 },
          done: !!done
        };
      }
    })
  };
}

/**
 * Utilities for parallel asynchronous operations, for use with the system `Promise` APIs.
 *
 * @public
 */
export class Async {
  /**
   * Given an input array and a `callback` function, invoke the callback to start a
   * promise for each element in the array.  Returns an array containing the results.
   *
   * @remarks
   * This API is similar to the system `Array#map`, except that the loop is asynchronous,
   * and the maximum number of concurrent promises can be throttled
   * using {@link IAsyncParallelismOptions.concurrency}.
   *
   * If `callback` throws a synchronous exception, or if it returns a promise that rejects,
   * then the loop stops immediately.  Any remaining array items will be skipped, and
   * overall operation will reject with the first error that was encountered.
   *
   * @param iterable - the array of inputs for the callback function
   * @param callback - a function that starts an asynchronous promise for an element
   *   from the array
   * @param options - options for customizing the control flow
   * @returns an array containing the result for each callback, in the same order
   *   as the original input `array`
   */
  public static async mapAsync<TEntry, TRetVal>(
    iterable: Iterable<TEntry> | AsyncIterable<TEntry>,
    callback: (entry: TEntry, arrayIndex: number) => Promise<TRetVal>,
    options?: (IAsyncParallelismOptions & { weighted?: false }) | undefined
  ): Promise<TRetVal[]>;

  /**
   * Given an input array and a `callback` function, invoke the callback to start a
   * promise for each element in the array.  Returns an array containing the results.
   *
   * @remarks
   * This API is similar to the system `Array#map`, except that the loop is asynchronous,
   * and the maximum number of concurrent units can be throttled
   * using {@link IAsyncParallelismOptions.concurrency}. Using the {@link IAsyncParallelismOptions.weighted}
   * option, the weight of each operation can be specified, which determines how many concurrent units it takes up.
   *
   * If `callback` throws a synchronous exception, or if it returns a promise that rejects,
   * then the loop stops immediately.  Any remaining array items will be skipped, and
   * overall operation will reject with the first error that was encountered.
   *
   * @param iterable - the array of inputs for the callback function
   * @param callback - a function that starts an asynchronous promise for an element
   *   from the array
   * @param options - options for customizing the control flow
   * @returns an array containing the result for each callback, in the same order
   *   as the original input `array`
   */
  public static async mapAsync<TEntry extends IWeighted, TRetVal>(
    iterable: Iterable<TEntry> | AsyncIterable<TEntry>,
    callback: (entry: TEntry, arrayIndex: number) => Promise<TRetVal>,
    options: IAsyncParallelismOptions & { weighted: true }
  ): Promise<TRetVal[]>;
  public static async mapAsync<TEntry, TRetVal>(
    iterable: Iterable<TEntry> | AsyncIterable<TEntry>,
    callback: (entry: TEntry, arrayIndex: number) => Promise<TRetVal>,
    options?: IAsyncParallelismOptions | undefined
  ): Promise<TRetVal[]> {
    const result: TRetVal[] = [];

    // @ts-expect-error https://github.com/microsoft/TypeScript/issues/22609, it succeeds against the implementation but fails against the overloads
    await Async.forEachAsync(
      iterable,
      async (item: TEntry, arrayIndex: number): Promise<void> => {
        result[arrayIndex] = await callback(item, arrayIndex);
      },
      options
    );

    return result;
  }

  private static async _forEachWeightedAsync<TReturn, TEntry extends { weight: number; element: TReturn }>(
    iterable: AsyncIterable<TEntry>,
    callback: (entry: TReturn, arrayIndex: number) => Promise<void>,
    options?: IAsyncParallelismOptions | undefined
  ): Promise<void> {
    await new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
      const concurrency: number =
        options?.concurrency && options.concurrency > 0 ? options.concurrency : Infinity;
      let concurrentUnitsInProgress: number = 0;

      const iterator: Iterator<TEntry> | AsyncIterator<TEntry> = (iterable as AsyncIterable<TEntry>)[
        Symbol.asyncIterator
      ].call(iterable);

      let arrayIndex: number = 0;
      let iteratorIsComplete: boolean = false;
      let promiseHasResolvedOrRejected: boolean = false;

      async function queueOperationsAsync(): Promise<void> {
        while (
          concurrentUnitsInProgress < concurrency &&
          !iteratorIsComplete &&
          !promiseHasResolvedOrRejected
        ) {
          // Increment the current concurrency units in progress by the concurrency limit before fetching the iterator weight.
          // This function is reentrant, so this if concurrency is finite, at most 1 operation will be waiting. If it's infinite,
          //  there will be effectively no cap on the number of operations waiting.
          const limitedConcurrency: number = !Number.isFinite(concurrency) ? 1 : concurrency;
          concurrentUnitsInProgress += limitedConcurrency;
          const currentIteratorResult: IteratorResult<TEntry> = await iterator.next();
          // eslint-disable-next-line require-atomic-updates
          iteratorIsComplete = !!currentIteratorResult.done;

          if (!iteratorIsComplete) {
            const currentIteratorValue: TEntry = currentIteratorResult.value;
            Async.validateWeightedIterable(currentIteratorValue);
            // Cap the weight to concurrency, this allows 0 weight items to execute despite the concurrency limit.
            const weight: number = Math.min(currentIteratorValue.weight, concurrency);

            // Wait until there's have enough capacity to run this job, this function will be re-entered as tasks call `onOperationCompletionAsync`
            if (concurrentUnitsInProgress + weight - limitedConcurrency > concurrency) {
              break;
            }

            // Remove the "lock" from the concurrency check and only apply the current weight.
            //  This should allow other operations to execute.
            concurrentUnitsInProgress += weight;
            concurrentUnitsInProgress -= limitedConcurrency;

            Promise.resolve(callback(currentIteratorValue.element, arrayIndex++))
              .then(async () => {
                // Remove the operation completely from the in progress units.
                concurrentUnitsInProgress -= weight;
                await onOperationCompletionAsync();
              })
              .catch((error) => {
                promiseHasResolvedOrRejected = true;
                reject(error);
              });
          } else {
            // The iterator is complete and there wasn't a value, so untrack the waiting state.
            concurrentUnitsInProgress -= limitedConcurrency;
          }
        }

        if (iteratorIsComplete) {
          await onOperationCompletionAsync();
        }
      }

      async function onOperationCompletionAsync(): Promise<void> {
        if (!promiseHasResolvedOrRejected) {
          if (concurrentUnitsInProgress === 0 && iteratorIsComplete) {
            promiseHasResolvedOrRejected = true;
            resolve();
          } else if (!iteratorIsComplete) {
            await queueOperationsAsync();
          }
        }
      }

      queueOperationsAsync().catch((error) => {
        promiseHasResolvedOrRejected = true;
        reject(error);
      });
    });
  }

  /**
   * Given an input array and a `callback` function, invoke the callback to start a
   * promise for each element in the array.
   *
   * @remarks
   * This API is similar to the system `Array#forEach`, except that the loop is asynchronous,
   * and the maximum number of concurrent promises can be throttled
   * using {@link IAsyncParallelismOptions.concurrency}.
   *
   * If `callback` throws a synchronous exception, or if it returns a promise that rejects,
   * then the loop stops immediately.  Any remaining array items will be skipped, and
   * overall operation will reject with the first error that was encountered.
   *
   * @param iterable - the array of inputs for the callback function
   * @param callback - a function that starts an asynchronous promise for an element
   *   from the array
   * @param options - options for customizing the control flow
   */
  public static async forEachAsync<TEntry>(
    iterable: Iterable<TEntry> | AsyncIterable<TEntry>,
    callback: (entry: TEntry, arrayIndex: number) => Promise<void>,
    options?: (IAsyncParallelismOptions & { weighted?: false }) | undefined
  ): Promise<void>;

  /**
   * Given an input array and a `callback` function, invoke the callback to start a
   * promise for each element in the array.
   *
   * @remarks
   * This API is similar to the other `Array#forEachAsync`, except that each item can have
   * a weight that determines how many concurrent operations are allowed. The unweighted
   * `Array#forEachAsync` is a special case of this method where weight = 1 for all items.
   *
   * The maximum number of concurrent operations can still be throttled using
   * {@link IAsyncParallelismOptions.concurrency}, however it no longer determines the
   * maximum number of operations that can be in progress at once. Instead, it determines the
   * number of concurrency units that can be in progress at once. The weight of each operation
   * determines how many concurrency units it takes up. For example, if the concurrency is 2
   * and the first operation has a weight of 2, then only one more operation can be in progress.
   *
   * If `callback` throws a synchronous exception, or if it returns a promise that rejects,
   * then the loop stops immediately.  Any remaining array items will be skipped, and
   * overall operation will reject with the first error that was encountered.
   *
   * @param iterable - the array of inputs for the callback function
   * @param callback - a function that starts an asynchronous promise for an element
   *   from the array
   * @param options - options for customizing the control flow
   */
  public static async forEachAsync<TEntry extends IWeighted>(
    iterable: Iterable<TEntry> | AsyncIterable<TEntry>,
    callback: (entry: TEntry, arrayIndex: number) => Promise<void>,
    options: IAsyncParallelismOptions & { weighted: true }
  ): Promise<void>;
  public static async forEachAsync<TEntry>(
    iterable: Iterable<TEntry> | AsyncIterable<TEntry>,
    callback: (entry: TEntry, arrayIndex: number) => Promise<void>,
    options?: IAsyncParallelismOptions
  ): Promise<void> {
    await Async._forEachWeightedAsync(toWeightedIterator(iterable, options?.weighted), callback, options);
  }

  /**
   * Return a promise that resolves after the specified number of milliseconds.
   */
  public static async sleepAsync(ms: number): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Executes an async function and optionally retries it if it fails.
   */
  public static async runWithRetriesAsync<TResult>({
    action,
    maxRetries,
    retryDelayMs = 0
  }: IRunWithRetriesOptions<TResult>): Promise<TResult> {
    let retryCount: number = 0;
    while (true) {
      try {
        return await action(retryCount);
      } catch (e) {
        if (++retryCount > maxRetries) {
          throw e;
        } else if (retryDelayMs > 0) {
          await Async.sleepAsync(retryDelayMs);
        }
      }
    }
  }

  /**
   * Ensures that the argument is a valid {@link IWeighted}, with a `weight` argument that
   * is a positive integer or 0.
   */
  public static validateWeightedIterable(operation: IWeighted): void {
    if (operation.weight < 0) {
      throw new Error('Weight must be a whole number greater than or equal to 0');
    }
    if (operation.weight % 1 !== 0) {
      throw new Error('Weight must be a whole number greater than or equal to 0');
    }
  }

  /**
   * Returns a Signal, a.k.a. a "deferred promise".
   */
  public static getSignal(): [Promise<void>, () => void, (err: Error) => void] {
    return getSignal();
  }

  /**
   * Runs a promise with a timeout. If the promise does not resolve within the specified timeout,
   * it will reject with an error.
   * @remarks If the action is completely synchronous, runWithTimeoutAsync doesn't do anything meaningful.
   */
  public static async runWithTimeoutAsync<TResult>({
    action,
    timeoutMs,
    timeoutMessage = 'Operation timed out'
  }: IRunWithTimeoutOptions<TResult>): Promise<TResult> {
    let timeoutHandle: NodeJS.Timeout | undefined;
    const promise: Promise<TResult> = Promise.resolve(action());
    const timeoutPromise: Promise<never> = new Promise<never>((resolve, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });

    try {
      return Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}

/**
 * Returns an unwrapped promise.
 */
function getSignal(): [Promise<void>, () => void, (err: Error) => void] {
  let resolver: () => void;
  let rejecter: (err: Error) => void;
  const promise: Promise<void> = new Promise<void>((resolve, reject) => {
    resolver = resolve;
    rejecter = reject;
  });
  return [promise, resolver!, rejecter!];
}

/**
 * A queue that allows for asynchronous iteration. During iteration, the queue will wait until
 * the next item is pushed into the queue before yielding. If instead all queue items are consumed
 * and all callbacks have been called, the queue will return.
 *
 * @public
 */
export class AsyncQueue<T> implements AsyncIterable<[T, () => void]> {
  private _queue: T[];
  private _onPushSignal: Promise<void>;
  private _onPushResolve: () => void;

  public constructor(iterable?: Iterable<T>) {
    this._queue = iterable ? Array.from(iterable) : [];
    const [promise, resolver] = getSignal();
    this._onPushSignal = promise;
    this._onPushResolve = resolver;
  }

  public async *[Symbol.asyncIterator](): AsyncIterableIterator<[T, () => void]> {
    let activeIterations: number = 0;
    let [callbackSignal, callbackResolve] = getSignal();
    const callback: () => void = () => {
      if (--activeIterations === 0) {
        // Resolve whatever the latest callback promise is and create a new one
        callbackResolve();
        const [newCallbackSignal, newCallbackResolve] = getSignal();
        callbackSignal = newCallbackSignal;
        callbackResolve = newCallbackResolve;
      }
    };

    let position: number = 0;
    while (this._queue.length > position || activeIterations > 0) {
      if (this._queue.length > position) {
        activeIterations++;
        yield [this._queue[position++], callback];
      } else {
        // On push, the item will be added to the queue and the onPushSignal will be resolved.
        // On calling the callback, active iterations will be decremented by the callback and the
        // callbackSignal will be resolved. This means that the loop will continue if there are
        // active iterations or if there are items in the queue that haven't been yielded yet.
        await Promise.race([this._onPushSignal, callbackSignal]);
      }
    }
  }

  /**
   * Adds an item to the queue.
   *
   * @param item - The item to push into the queue.
   */
  public push(item: T): void {
    this._queue.push(item);
    this._onPushResolve();
    const [onPushSignal, onPushResolve] = getSignal();
    this._onPushSignal = onPushSignal;
    this._onPushResolve = onPushResolve;
  }
}
