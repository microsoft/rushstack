// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Async } from '@rushstack/node-core-library';
import { OperationStatus } from '../OperationStatus.ts';
import { WorkQueue } from '../WorkQueue.ts';

describe(WorkQueue.name, () => {
  it('Executes in dependency order', async () => {
    const abortController: AbortController = new AbortController();

    const queue: WorkQueue = new WorkQueue(abortController.signal);

    const executed: Set<number> = new Set();

    const outerPromises: Promise<OperationStatus>[] = [];

    for (let i: number = 0; i < 10; i++) {
      outerPromises.push(
        queue.pushAsync(async () => {
          executed.add(i);
          return OperationStatus.Success;
        }, i)
      );
    }

    let expectedCount: number = 0;
    const queuePromise: Promise<void> = (async () => {
      for await (const task of queue) {
        expect(executed.size).toBe(expectedCount);
        await task();
        ++expectedCount;
        expect(executed.has(outerPromises.length - expectedCount)).toBe(true);
      }
    })();

    expect((await Promise.all(outerPromises)).every((status) => status === OperationStatus.Success)).toBe(
      true
    );
    abortController.abort();
    await queuePromise;
  });

  it('Aborts any tasks left on the queue when aborted', async () => {
    const abortController: AbortController = new AbortController();

    const queue: WorkQueue = new WorkQueue(abortController.signal);

    const executed: Set<number> = new Set();

    const outerPromises: Promise<OperationStatus>[] = [];

    for (let i: number = 0; i < 10; i++) {
      outerPromises.push(
        queue.pushAsync(async () => {
          executed.add(i);
          return OperationStatus.Success;
        }, i)
      );
    }

    let expectedCount: number = 0;
    for await (const task of queue) {
      expect(executed.size).toBe(expectedCount);
      await task();
      ++expectedCount;
      expect(executed.has(outerPromises.length - expectedCount)).toBe(true);

      if (expectedCount === 1) {
        abortController.abort();
      }
    }

    const results: OperationStatus[] = await Promise.all(outerPromises);
    // The last pushed operation had the highest priority, so is the only one executed before the abort call
    expect(results.pop()).toBe(OperationStatus.Success);
    for (const result of results) {
      expect(result).toBe(OperationStatus.Aborted);
    }
  });

  it('works with Async.forEachAsync', async () => {
    const abortController: AbortController = new AbortController();

    const queue: WorkQueue = new WorkQueue(abortController.signal);

    const executed: Set<number> = new Set();

    const outerPromises: Promise<OperationStatus>[] = [];

    for (let i: number = 0; i < 10; i++) {
      outerPromises.push(
        queue.pushAsync(async () => {
          executed.add(i);
          return OperationStatus.Success;
        }, i)
      );
    }

    let expectedCount: number = 0;
    const queuePromise: Promise<void> = Async.forEachAsync(
      queue,
      async (task) => {
        expect(executed.size).toBe(expectedCount);
        await task();
        ++expectedCount;
        expect(executed.has(outerPromises.length - expectedCount)).toBe(true);
      },
      { concurrency: 1 }
    );

    expect((await Promise.all(outerPromises)).every((status) => status === OperationStatus.Success)).toBe(
      true
    );
    abortController.abort();
    await queuePromise;
  });

  it('works concurrently with Async.forEachAsync', async () => {
    const abortController: AbortController = new AbortController();

    const queue: WorkQueue = new WorkQueue(abortController.signal);

    let running: number = 0;
    let maxRunning: number = 0;

    const array: number[] = [1, 2, 3, 4, 5, 6, 7, 8];

    const fn: () => Promise<OperationStatus> = jest.fn(async () => {
      running++;
      await Async.sleepAsync(0);
      maxRunning = Math.max(maxRunning, running);
      running--;
      return OperationStatus.Success;
    });
    const outerPromises: Promise<OperationStatus>[] = array.map((index) => queue.pushAsync(fn, 0));

    const queuePromise: Promise<void> = Async.forEachAsync(queue, (task) => task(), { concurrency: 3 });
    expect((await Promise.all(outerPromises)).every((status) => status === OperationStatus.Success)).toBe(
      true
    );

    abortController.abort();
    await queuePromise;

    expect(fn).toHaveBeenCalledTimes(8);
    expect(maxRunning).toEqual(3);
  });
});
