// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

function noop(): void {}

/**
 * Starts an operation, then runs the checks that decide whether its result may be used, so that both run at the
 * same time. Returns the result of the operation if the checks pass.
 *
 * @remarks
 * If the checks fail, this waits for the operation to finish, so that no work continues after the call, and throws
 * the error of the checks, whether or not the operation failed too.
 */
export async function runDuringChecksAsync<T>(
  runAsync: () => Promise<T>,
  checkAsync: () => Promise<void>
): Promise<T> {
  const resultPromise: Promise<T> = runAsync();
  // The operation may fail before the checks finish, which must not be reported as an unhandled rejection
  const settledPromise: Promise<void> = resultPromise.then(noop, noop);
  try {
    await checkAsync();
  } catch (error) {
    await settledPromise;
    throw error;
  }

  return await resultPromise;
}
