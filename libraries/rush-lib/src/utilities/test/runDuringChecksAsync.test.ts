// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { runDuringChecksAsync } from '../runDuringChecksAsync';

interface IDeferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}

function createDeferred<T>(): IDeferred<T> {
  let resolveDeferred!: (value: T) => void;
  let rejectDeferred!: (error: Error) => void;
  const promise: Promise<T> = new Promise<T>((resolve, reject) => {
    resolveDeferred = resolve;
    rejectDeferred = reject;
  });
  return { promise, resolve: resolveDeferred, reject: rejectDeferred };
}

// Lets every pending callback run, including those of timers and of I/O
function waitForTurnsAsync(): Promise<void> {
  return new Promise((resolve: () => void) => setTimeout(resolve, 10));
}

describe(runDuringChecksAsync.name, () => {
  it('starts the operation before the checks, and returns its result once both finish', async () => {
    const events: string[] = [];
    const operation: IDeferred<number> = createDeferred();
    const resultPromise: Promise<number> = runDuringChecksAsync(
      async () => {
        events.push('operation started');
        return await operation.promise;
      },
      async () => {
        events.push('checks started');
        await waitForTurnsAsync();
        events.push('checks passed');
      }
    );
    let result: number | undefined;
    void resultPromise.then((value: number) => {
      result = value;
    });

    expect(events).toEqual(['operation started', 'checks started']);
    await waitForTurnsAsync();
    await waitForTurnsAsync();
    expect(events).toEqual(['operation started', 'checks started', 'checks passed']);
    expect(result).toBeUndefined();
    operation.resolve(3);
    expect(await resultPromise).toBe(3);
  });

  it('throws the error of the operation if the checks pass', async () => {
    const error: Error = new Error('The operation failed');

    await expect(runDuringChecksAsync(() => Promise.reject(error), async () => {})).rejects.toBe(error);
  });

  it('waits for the operation if the checks fail, and throws the error of the checks', async () => {
    const operation: IDeferred<number> = createDeferred();
    const checkError: Error = new Error('The checks failed');
    const resultPromise: Promise<number> = runDuringChecksAsync(
      () => operation.promise,
      async () => {
        throw checkError;
      }
    );
    let isSettled: boolean = false;
    void resultPromise.then(
      () => {
        isSettled = true;
      },
      () => {
        isSettled = true;
      }
    );

    await waitForTurnsAsync();
    expect(isSettled).toBe(false);
    operation.reject(new Error('The operation failed too'));
    await expect(resultPromise).rejects.toBe(checkError);
  });

  it('handles a failure of the operation while the checks run', async () => {
    const onUnhandledRejection: jest.Mock = jest.fn();
    process.on('unhandledRejection', onUnhandledRejection);
    try {
      const error: Error = new Error('The operation failed');
      const resultPromise: Promise<number> = runDuringChecksAsync(
        () => Promise.reject(error),
        waitForTurnsAsync
      );

      await expect(resultPromise).rejects.toBe(error);
      expect(onUnhandledRejection).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });
});
