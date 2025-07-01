// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export async function withTimeout<T>(
  promise: Thenable<T>,
  timeoutMs: number,
  timeoutMessage: string = 'Operation timed out'
): Promise<T> {
  const timeoutPromise: Promise<never> = new Promise<never>((resolve, reject) => {
    setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]);
}
