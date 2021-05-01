// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Options for controlling the parallelism of asynchronous operations.
 * @beta
 */
export interface IAsyncParallelismOptions {
  /**
   * If provided, asynchronous operations like `mapAsync` and `forEachAsync` will limit the
   * number of concurrent operations to the specified number.
   */
  concurrency?: number;
}

/**
 * Utilities for parallel asynchronous operations, to augment built-in Promises capability.
 * @beta
 */
export class Async {
  /**
   * Given an input array and an asynchronous callback function, execute the callback
   * function for every element in the array and return a promise for an array containing
   * the results.
   *
   * Behaves like an asynchronous version of built-in `Array#map`.
   */
  public static async mapAsync<TEntry, TRetVal>(
    array: TEntry[],
    fn: (entry: TEntry, index: number) => Promise<TRetVal>,
    options?: IAsyncParallelismOptions | undefined
  ): Promise<TRetVal[]> {
    const result: TRetVal[] = [];

    await Async.forEachAsync(
      array,
      async (item: TEntry, index: number): Promise<void> => {
        result[index] = await fn(item, index);
      },
      options
    );

    return result;
  }

  /**
   * Given an input array and an asynchronous callback function, execute the callback
   * function for every element in the array and return a void promise.
   *
   * Behaves like an asynchronous version of built-in `Array#forEach`.
   */
  public static async forEachAsync<TEntry>(
    array: TEntry[],
    fn: (entry: TEntry, index: number) => Promise<void>,
    options?: IAsyncParallelismOptions | undefined
  ): Promise<void> {
    await new Promise((resolve: () => void, reject: (error: Error) => void) => {
      const concurrency: number =
        options?.concurrency && options.concurrency > 0 ? options.concurrency : Infinity;
      let operationsInProgress: number = 1;
      let index: number = 0;

      function onOperationCompletion(): void {
        operationsInProgress--;
        if (operationsInProgress === 0 && index >= array.length) {
          resolve();
        }

        while (operationsInProgress < concurrency) {
          if (index < array.length) {
            operationsInProgress++;
            try {
              Promise.resolve(fn(array[index], index++))
                .then(() => onOperationCompletion())
                .catch(reject);
            } catch (error) {
              reject(error);
            }
          } else {
            break;
          }
        }
      }

      onOperationCompletion();
    });
  }

  /**
   * Return a promise that resolves after the specified number of milliseconds.
   */
  public static async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
