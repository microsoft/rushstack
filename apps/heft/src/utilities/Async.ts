// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export class Async {
  public static async forEachLimitAsync<TEntry>(
    array: TEntry[],
    parallelismLimit: number,
    fn: (entry: TEntry) => Promise<void>
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
            fn(array[index++])
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
}
