// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Utilities for parallel asynchronous operations, to augment built-in Promise capability.
 * @public
 */
export class Async {
  /**
   * Take an input array and map it through an asynchronous function, with a maximum number
   * of parallel operations provided by the `parallelismLimit` parameter.
   */
  public static async mapLimitAsync<TEntry, TRetVal>(
    array: TEntry[],
    parallelismLimit: number,
    fn: ((entry: TEntry) => Promise<TRetVal>) | ((entry: TEntry, index: number) => Promise<TRetVal>)
  ): Promise<TRetVal[]> {
    const result: TRetVal[] = [];

    await Async.forEachLimitAsync(
      array,
      parallelismLimit,
      async (item: TEntry, index: number): Promise<void> => {
        result[index] = await fn(item, index);
      }
    );

    return result;
  }

  /**
   * Take an input array and loop through it, calling an asynchronous function, with a maximum number
   * of parallel operations provided by the `parallelismLimit` parameter.
   */
  public static async forEachLimitAsync<TEntry>(
    array: TEntry[],
    parallelismLimit: number,
    fn: ((entry: TEntry) => Promise<void>) | ((entry: TEntry, index: number) => Promise<void>)
  ): Promise<void> {
    return new Promise((resolve: () => void, reject: (error: Error) => void) => {
      if (parallelismLimit < 1) {
        throw new Error('parallelismLimit must be at least 1');
      }

      let operationsInProgress: number = 1;
      let index: number = 0;

      function onOperationCompletion(): void {
        operationsInProgress--;
        if (operationsInProgress === 0 && index >= array.length) {
          resolve();
        }

        while (operationsInProgress < parallelismLimit) {
          if (index < array.length) {
            operationsInProgress++;
            fn(array[index], index++)
              .then(() => onOperationCompletion())
              .catch(reject);
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
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
