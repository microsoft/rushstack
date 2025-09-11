// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Async, AsyncQueue } from '../Async';

describe(Async.name, () => {
  describe(Async.mapAsync.name, () => {
    it('handles an empty array correctly', async () => {
      const result = await Async.mapAsync([] as number[], async (item) => `result ${item}`);
      expect(result).toEqual([]);
    });

    it('returns the same result as built-in Promise.all', async () => {
      const array: number[] = [1, 2, 3, 4, 5, 6, 7, 8];
      const fn: (item: number) => Promise<string> = async (item) => `result ${item}`;

      expect(await Async.mapAsync(array, fn)).toEqual(await Promise.all(array.map(fn)));
    });

    it('passes an index parameter to the callback function', async () => {
      const array: number[] = [1, 2, 3];
      const fn: (item: number, index: number) => Promise<string> = jest.fn(async (item) => `result ${item}`);

      await Async.mapAsync(array, fn);
      expect(fn).toHaveBeenNthCalledWith(1, 1, 0);
      expect(fn).toHaveBeenNthCalledWith(2, 2, 1);
      expect(fn).toHaveBeenNthCalledWith(3, 3, 2);
    });

    it('if concurrency is set, ensures no more than N operations occur in parallel', async () => {
      let running: number = 0;
      let maxRunning: number = 0;

      const array: number[] = [1, 2, 3, 4, 5, 6, 7, 8];

      const fn: (item: number) => Promise<string> = async (item) => {
        running++;
        await Async.sleepAsync(0);
        maxRunning = Math.max(maxRunning, running);
        running--;
        return `result ${item}`;
      };

      expect(await Async.mapAsync(array, fn, { concurrency: 3 })).toEqual([
        'result 1',
        'result 2',
        'result 3',
        'result 4',
        'result 5',
        'result 6',
        'result 7',
        'result 8'
      ]);
      expect(maxRunning).toEqual(3);
    });

    it('rejects if a sync iterator throws an error', async () => {
      const expectedError: Error = new Error('iterator error');
      let iteratorIndex: number = 0;
      const syncIterator: Iterator<number> = {
        next: () => {
          if (iteratorIndex < 5) {
            iteratorIndex++;
            return { done: false, value: iteratorIndex };
          } else {
            throw expectedError;
          }
        }
      };
      const syncIterable: Iterable<number> = {
        [Symbol.iterator]: () => syncIterator
      };

      await expect(() => Async.mapAsync(syncIterable, async (item) => `result ${item}`)).rejects.toThrow(
        expectedError
      );
    });

    it('rejects if an async iterator throws an error', async () => {
      const expectedError: Error = new Error('iterator error');
      let iteratorIndex: number = 0;
      const asyncIterator: AsyncIterator<number> = {
        next: () => {
          if (iteratorIndex < 5) {
            iteratorIndex++;
            return Promise.resolve({ done: false, value: iteratorIndex });
          } else {
            throw expectedError;
          }
        }
      };
      const syncIterable: AsyncIterable<number> = {
        [Symbol.asyncIterator]: () => asyncIterator
      };

      await expect(() => Async.mapAsync(syncIterable, async (item) => `result ${item}`)).rejects.toThrow(
        expectedError
      );
    });

    it('rejects if an async iterator rejects', async () => {
      const expectedError: Error = new Error('iterator error');
      let iteratorIndex: number = 0;
      const asyncIterator: AsyncIterator<number> = {
        next: () => {
          if (iteratorIndex < 5) {
            iteratorIndex++;
            return Promise.resolve({ done: false, value: iteratorIndex });
          } else {
            return Promise.reject(expectedError);
          }
        }
      };
      const syncIterable: AsyncIterable<number> = {
        [Symbol.asyncIterator]: () => asyncIterator
      };

      await expect(() => Async.mapAsync(syncIterable, async (item) => `result ${item}`)).rejects.toThrow(
        expectedError
      );
    });
  });

  describe(Async.forEachAsync.name, () => {
    it('handles an empty array correctly', async () => {
      let running: number = 0;
      let maxRunning: number = 0;

      const array: number[] = [];

      const fn: (item: number) => Promise<void> = jest.fn(async (item) => {
        running++;
        await Async.sleepAsync(0);
        maxRunning = Math.max(maxRunning, running);
        running--;
      });

      await Async.forEachAsync(array, fn, { concurrency: 3 });
      expect(fn).toHaveBeenCalledTimes(0);
      expect(maxRunning).toEqual(0);
    });

    it('if concurrency is set, ensures no more than N operations occur in parallel', async () => {
      let running: number = 0;
      let maxRunning: number = 0;

      const array: number[] = [1, 2, 3, 4, 5, 6, 7, 8];

      const fn: (item: number) => Promise<void> = jest.fn(async (item) => {
        running++;
        await Async.sleepAsync(0);
        maxRunning = Math.max(maxRunning, running);
        running--;
      });

      await Async.forEachAsync(array, fn, { concurrency: 3 });
      expect(fn).toHaveBeenCalledTimes(8);
      expect(maxRunning).toEqual(3);
    });

    it('returns when given an array with a large number of elements and a concurrency limit', async () => {
      const array: number[] = [];
      for (let i = 0; i < 250; i++) {
        array.push(i);
      }

      await Async.forEachAsync(array, async () => await Async.sleepAsync(0), { concurrency: 3 });
    });

    it('rejects if any operation rejects', async () => {
      const array: number[] = [1, 2, 3];

      const fn: (item: number) => Promise<void> = jest.fn(async (item) => {
        await Async.sleepAsync(0);
        if (item === 3) throw new Error('Something broke');
      });

      await expect(() => Async.forEachAsync(array, fn, { concurrency: 3 })).rejects.toThrowError(
        'Something broke'
      );
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('rejects if any operation synchronously throws', async () => {
      const array: number[] = [1, 2, 3];

      // The compiler is (rightly) very concerned about us claiming that this synchronous
      // function is going to return a promise. This situation is not very likely in a
      // TypeScript project, but it's such a common problem in JavaScript projects that
      // it's worth doing an explicit test.
      const fn: (item: number) => Promise<void> = jest.fn((item) => {
        if (item === 3) throw new Error('Something broke');
      }) as unknown as (item: number) => Promise<void>;

      await expect(() => Async.forEachAsync(array, fn, { concurrency: 3 })).rejects.toThrowError(
        'Something broke'
      );
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('rejects if a sync iterator throws an error', async () => {
      const expectedError: Error = new Error('iterator error');
      let iteratorIndex: number = 0;
      const syncIterator: Iterator<number> = {
        next: () => {
          if (iteratorIndex < 5) {
            iteratorIndex++;
            return { done: false, value: iteratorIndex };
          } else {
            throw expectedError;
          }
        }
      };
      const syncIterable: Iterable<number> = {
        [Symbol.iterator]: () => syncIterator
      };

      await expect(() =>
        Async.forEachAsync(syncIterable, async (item) => await Async.sleepAsync(0))
      ).rejects.toThrow(expectedError);
    });

    it('rejects if an async iterator throws an error', async () => {
      const expectedError: Error = new Error('iterator error');
      let iteratorIndex: number = 0;
      const asyncIterator: AsyncIterator<number> = {
        next: () => {
          if (iteratorIndex < 5) {
            iteratorIndex++;
            return Promise.resolve({ done: false, value: iteratorIndex });
          } else {
            throw expectedError;
          }
        }
      };
      const syncIterable: AsyncIterable<number> = {
        [Symbol.asyncIterator]: () => asyncIterator
      };

      await expect(() =>
        Async.forEachAsync(syncIterable, async (item) => await Async.sleepAsync(0))
      ).rejects.toThrow(expectedError);
    });

    it('does not exceed the maxiumum concurrency for an async iterator', async () => {
      let waitingIterators: number = 0;

      let resolve2!: (value: { done: true; value: undefined }) => void;
      const signal2: Promise<{ done: true; value: undefined }> = new Promise((resolve, reject) => {
        resolve2 = resolve;
      });

      let iteratorIndex: number = 0;
      const asyncIterator: AsyncIterator<number> = {
        next: () => {
          iteratorIndex++;
          if (iteratorIndex < 20) {
            return Promise.resolve({ done: false, value: iteratorIndex });
          } else {
            ++waitingIterators;
            return signal2;
          }
        }
      };
      const asyncIterable: AsyncIterable<number> = {
        [Symbol.asyncIterator]: () => asyncIterator
      };

      const finalPromise: Promise<void> = Async.forEachAsync(
        asyncIterable,
        async (item) => {
          // Do nothing
        },
        {
          concurrency: 4
        }
      );

      // Wait for all the instant resolutions to be done
      await Async.sleepAsync(0);

      // The final iteration cycle is locked, so only 1 iterator is waiting.
      expect(waitingIterators).toEqual(1);
      resolve2({ done: true, value: undefined });
      await finalPromise;
    });

    it('rejects if an async iterator rejects', async () => {
      const expectedError: Error = new Error('iterator error');
      let iteratorIndex: number = 0;
      const asyncIterator: AsyncIterator<number> = {
        next: () => {
          if (iteratorIndex < 5) {
            iteratorIndex++;
            return Promise.resolve({ done: false, value: iteratorIndex });
          } else {
            return Promise.reject(expectedError);
          }
        }
      };
      const syncIterable: AsyncIterable<number> = {
        [Symbol.asyncIterator]: () => asyncIterator
      };

      await expect(() =>
        Async.forEachAsync(syncIterable, async (item) => await Async.sleepAsync(0))
      ).rejects.toThrow(expectedError);
    });

    interface INumberWithWeight {
      n: number;
      weight: number;
    }

    it('handles an empty array correctly', async () => {
      let running: number = 0;
      let maxRunning: number = 0;

      const array: INumberWithWeight[] = [];

      const fn: (item: INumberWithWeight) => Promise<void> = jest.fn(async (item) => {
        running++;
        await Async.sleepAsync(0);
        maxRunning = Math.max(maxRunning, running);
        running--;
      });

      await Async.forEachAsync(array, fn, { concurrency: 3, weighted: true });
      expect(fn).toHaveBeenCalledTimes(0);
      expect(maxRunning).toEqual(0);
    });

    it('if concurrency is set, ensures no more than N operations occur in parallel', async () => {
      let running: number = 0;
      let maxRunning: number = 0;

      const array: INumberWithWeight[] = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ weight: 1, n }));

      const fn: (item: INumberWithWeight) => Promise<void> = jest.fn(async (item) => {
        running++;
        await Async.sleepAsync(0);
        maxRunning = Math.max(maxRunning, running);
        running--;
      });

      await Async.forEachAsync(array, fn, { concurrency: 3, weighted: true });
      expect(fn).toHaveBeenCalledTimes(8);
      expect(maxRunning).toEqual(3);
    });

    it('if concurrency is set but weighted is not, ensures no more than N operations occur in parallel and ignores operation weight', async () => {
      let running: number = 0;
      let maxRunning: number = 0;

      const array: INumberWithWeight[] = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ weight: 2, n }));

      const fn: (item: INumberWithWeight) => Promise<void> = jest.fn(async (item) => {
        running++;
        await Async.sleepAsync(0);
        maxRunning = Math.max(maxRunning, running);
        running--;
      });

      await Async.forEachAsync(array, fn, { concurrency: 3 });
      expect(fn).toHaveBeenCalledTimes(8);
      expect(maxRunning).toEqual(3);
    });

    it.each([
      {
        concurrency: 4,
        weight: 4,
        expectedConcurrency: 1
      },
      {
        concurrency: 4,
        weight: 1,
        expectedConcurrency: 4
      },
      {
        concurrency: 3,
        weight: 1,
        expectedConcurrency: 3
      },
      {
        concurrency: 6,
        weight: 2,
        expectedConcurrency: 3
      },
      {
        concurrency: 12,
        weight: 3,
        expectedConcurrency: 4
      }
    ])(
      'if concurrency is set to $concurrency with operation weight $weight, ensures no more than $expectedConcurrency operations occur in parallel',
      async ({ concurrency, weight, expectedConcurrency }) => {
        let running: number = 0;
        let maxRunning: number = 0;

        const array: INumberWithWeight[] = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ n, weight }));

        const fn: (item: INumberWithWeight) => Promise<void> = jest.fn(async (item) => {
          running++;
          await Async.sleepAsync(0);
          maxRunning = Math.max(maxRunning, running);
          running--;
        });

        await Async.forEachAsync(array, fn, { concurrency, weighted: true });
        expect(fn).toHaveBeenCalledTimes(8);
        expect(maxRunning).toEqual(expectedConcurrency);
      }
    );

    it('ensures that a large operation cannot be scheduled around', async () => {
      let running: number = 0;
      let maxRunning: number = 0;

      const array: INumberWithWeight[] = [
        { n: 1, weight: 1 },
        { n: 2, weight: 1 },
        { n: 3, weight: 1 },
        { n: 4, weight: 10 },
        { n: 5, weight: 1 },
        { n: 6, weight: 1 },
        { n: 7, weight: 5 },
        { n: 8, weight: 1 }
      ];

      const fn: (item: INumberWithWeight) => Promise<void> = jest.fn(async (item) => {
        running++;
        await Async.sleepAsync(0);
        maxRunning = Math.max(maxRunning, running);
        running--;
      });

      await Async.forEachAsync(array, fn, { concurrency: 3, weighted: true });
      expect(fn).toHaveBeenCalledTimes(8);
      expect(maxRunning).toEqual(3);
    });

    it('waits for a small and large operation to finish before scheduling more', async () => {
      let running: number = 0;
      let maxRunning: number = 0;

      const array: INumberWithWeight[] = [
        { n: 1, weight: 1 },
        { n: 2, weight: 10 },
        { n: 3, weight: 1 },
        { n: 4, weight: 10 },
        { n: 5, weight: 1 },
        { n: 6, weight: 10 },
        { n: 7, weight: 1 },
        { n: 8, weight: 10 }
      ];

      const fn: (item: INumberWithWeight) => Promise<void> = jest.fn(async (item) => {
        running++;
        await Async.sleepAsync(0);
        maxRunning = Math.max(maxRunning, running);
        running--;
      });

      await Async.forEachAsync(array, fn, { concurrency: 3, weighted: true });
      expect(fn).toHaveBeenCalledTimes(8);
      expect(maxRunning).toEqual(1);
    });

    it('allows operations with a weight of 0 and schedules them accordingly', async () => {
      let running: number = 0;
      let maxRunning: number = 0;

      const array: INumberWithWeight[] = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ n, weight: 0 }));

      array.unshift({ n: 9, weight: 3 });

      array.push({ n: 10, weight: 3 });

      const fn: (item: INumberWithWeight) => Promise<void> = jest.fn(async (item) => {
        running++;
        await Async.sleepAsync(0);
        maxRunning = Math.max(maxRunning, running);
        running--;
      });

      await Async.forEachAsync(array, fn, { concurrency: 3, weighted: true });
      expect(fn).toHaveBeenCalledTimes(10);
      expect(maxRunning).toEqual(9);
    });

    it('ensures isolated job runs in isolation while small jobs never run alongside it', async () => {
      const maxConcurrency: number = 10;
      let running: number = 0;
      const jobToMaxConcurrentJobsRunning: Record<number, number> = {};

      const array: INumberWithWeight[] = [
        { n: 1, weight: 1 },
        { n: 2, weight: 1 },
        { n: 3, weight: 1 },
        { n: 4, weight: maxConcurrency },
        { n: 5, weight: 1 },
        { n: 6, weight: 1 },
        { n: 7, weight: 1 }
      ];

      const fn: (item: INumberWithWeight) => Promise<void> = jest.fn(async (item) => {
        running++;
        jobToMaxConcurrentJobsRunning[item.n] = Math.max(jobToMaxConcurrentJobsRunning[item.n] || 0, running);

        // Simulate longer running time for heavyweight job
        if (item.weight === maxConcurrency) {
          await Async.sleepAsync(50);
        } else {
          await Async.sleepAsync(10);
        }

        running--;
      });

      await Async.forEachAsync(array, fn, { concurrency: maxConcurrency, weighted: true });

      expect(fn).toHaveBeenCalledTimes(7);

      // The heavyweight job (n=4) should run with only 1 concurrent job (itself)
      expect(jobToMaxConcurrentJobsRunning[4]).toEqual(1);

      // Small jobs should be able to run concurrently with each other but not with heavyweight job
      const nonIsolatedJobs = array.filter((job) => job.weight !== maxConcurrency);
      nonIsolatedJobs.forEach((job) => {
        expect(jobToMaxConcurrentJobsRunning[job.n]).toBeGreaterThanOrEqual(1);
        expect(jobToMaxConcurrentJobsRunning[job.n]).toBeLessThanOrEqual(6); // All small jobs could theoretically run together
      });
    });

    it('allows zero weight tasks to run alongside weight = concurrency task', async () => {
      const concurrency = 3;
      const array: INumberWithWeight[] = [
        { n: 1, weight: 0 },
        { n: 2, weight: concurrency },
        { n: 3, weight: 0 }
      ];

      let running: number = 0;
      const jobToMaxConcurrentJobsRunning: Record<number, number> = {};

      const fn: (item: INumberWithWeight) => Promise<void> = jest.fn(async (item) => {
        running++;
        jobToMaxConcurrentJobsRunning[item.n] = Math.max(jobToMaxConcurrentJobsRunning[item.n] || 0, running);

        await Async.sleepAsync(0);

        running--;
      });

      await Async.forEachAsync(array, fn, { concurrency: concurrency, weighted: true });

      expect(jobToMaxConcurrentJobsRunning[1]).toEqual(1); // runs 0 weight
      expect(jobToMaxConcurrentJobsRunning[2]).toEqual(2); // runs 0 weight + 3 weight
      expect(jobToMaxConcurrentJobsRunning[3]).toEqual(1); // runs 0 weight after 3 weight completes
    });

    it('allows zero weight tasks to run alongside weight > concurrency task', async () => {
      const concurrency = 3;
      const array: INumberWithWeight[] = [
        { n: 1, weight: 0 },
        { n: 2, weight: concurrency + 1 },
        { n: 3, weight: 0 }
      ];

      let running: number = 0;
      const jobToMaxConcurrentJobsRunning: Record<number, number> = {};

      const fn: (item: INumberWithWeight) => Promise<void> = jest.fn(async (item) => {
        running++;
        jobToMaxConcurrentJobsRunning[item.n] = Math.max(jobToMaxConcurrentJobsRunning[item.n] || 0, running);

        await Async.sleepAsync(0);

        running--;
      });

      await Async.forEachAsync(array, fn, { concurrency, weighted: true });

      expect(jobToMaxConcurrentJobsRunning[1]).toEqual(1); // runs 0 weight
      expect(jobToMaxConcurrentJobsRunning[2]).toEqual(2); // runs 0 weight + 4 weight
      expect(jobToMaxConcurrentJobsRunning[3]).toEqual(1); // runs 0 weight after 3 weight completes
    });

    it('does not exceed the maxiumum concurrency for an async iterator when weighted', async () => {
      let waitingIterators: number = 0;

      let resolve2!: (value: { done: true; value: undefined }) => void;
      const signal2: Promise<{ done: true; value: undefined }> = new Promise((resolve, reject) => {
        resolve2 = resolve;
      });

      let iteratorIndex: number = 0;
      const asyncIterator: AsyncIterator<{ element: number; weight: number }> = {
        next: () => {
          iteratorIndex++;
          if (iteratorIndex < 20) {
            return Promise.resolve({ done: false, value: { element: iteratorIndex, weight: 2 } });
          } else {
            ++waitingIterators;
            return signal2;
          }
        }
      };
      const asyncIterable: AsyncIterable<{ element: number; weight: number }> = {
        [Symbol.asyncIterator]: () => asyncIterator
      };

      const finalPromise: Promise<void> = Async.forEachAsync(
        asyncIterable,
        async (item) => {
          // Do nothing
        },
        {
          concurrency: 4,
          weighted: true
        }
      );

      // Wait for all the instant resolutions to be done
      await Async.sleepAsync(0);

      // The final iteration cycle is locked, so only 1 iterator is waiting.
      expect(waitingIterators).toEqual(1);
      resolve2({ done: true, value: undefined });
      await finalPromise;
    });
  });

  describe(Async.runWithRetriesAsync.name, () => {
    it('Correctly handles a sync function that succeeds the first time', async () => {
      const expectedResult: string = 'RESULT';
      const result: string = await Async.runWithRetriesAsync({ action: () => expectedResult, maxRetries: 0 });
      expect(result).toEqual(expectedResult);
    });

    it('Correctly handles an async function that succeeds the first time', async () => {
      const expectedResult: string = 'RESULT';
      const result: string = await Async.runWithRetriesAsync({
        // eslint-disable-next-line @typescript-eslint/naming-convention
        action: async () => expectedResult,
        maxRetries: 0
      });
      expect(result).toEqual(expectedResult);
    });

    it('Correctly handles a sync function that throws and does not allow retries', async () => {
      await expect(
        async () =>
          await Async.runWithRetriesAsync({
            action: () => {
              throw new Error('error');
            },
            maxRetries: 0
          })
      ).rejects.toThrowErrorMatchingSnapshot();
    });

    it('Correctly handles an async function that throws and does not allow retries', async () => {
      await expect(
        async () =>
          await Async.runWithRetriesAsync({
            // eslint-disable-next-line @typescript-eslint/naming-convention
            action: async () => {
              throw new Error('error');
            },
            maxRetries: 0
          })
      ).rejects.toThrowErrorMatchingSnapshot();
    });

    it('Correctly handles a sync function that always throws and allows several retries', async () => {
      await expect(
        async () =>
          await Async.runWithRetriesAsync({
            action: () => {
              throw new Error('error');
            },
            maxRetries: 5
          })
      ).rejects.toThrowErrorMatchingSnapshot();
    });

    it('Correctly handles an async function that always throws and allows several retries', async () => {
      await expect(
        async () =>
          await Async.runWithRetriesAsync({
            // eslint-disable-next-line @typescript-eslint/naming-convention
            action: async () => {
              throw new Error('error');
            },
            maxRetries: 5
          })
      ).rejects.toThrowErrorMatchingSnapshot();
    });

    it('Correctly handles a sync function that throws once and then succeeds', async () => {
      const expectedResult: string = 'RESULT';
      let callCount: number = 0;
      const result: string = await Async.runWithRetriesAsync({
        action: () => {
          if (callCount++ === 0) {
            throw new Error('error');
          } else {
            return expectedResult;
          }
        },
        maxRetries: 1
      });
      expect(result).toEqual(expectedResult);
    });

    it('Correctly handles an async function that throws once and then succeeds', async () => {
      const expectedResult: string = 'RESULT';
      let callCount: number = 0;
      const result: string = await Async.runWithRetriesAsync({
        action: () => {
          if (callCount++ === 0) {
            throw new Error('error');
          } else {
            return expectedResult;
          }
        },
        maxRetries: 1
      });
      expect(result).toEqual(expectedResult);
    });

    it('Correctly handles a sync function that throws once and then succeeds with a timeout', async () => {
      const expectedResult: string = 'RESULT';
      let callCount: number = 0;
      const sleepSpy: jest.SpyInstance = jest
        .spyOn(Async, 'sleepAsync')
        .mockImplementation(() => Promise.resolve());

      const resultPromise: Promise<string> = Async.runWithRetriesAsync({
        action: () => {
          if (callCount++ === 0) {
            throw new Error('error');
          } else {
            return expectedResult;
          }
        },
        maxRetries: 1,
        retryDelayMs: 5
      });

      expect(await resultPromise).toEqual(expectedResult);
      expect(sleepSpy).toHaveBeenCalledTimes(1);
      expect(sleepSpy).toHaveBeenLastCalledWith(5);
    });

    it('Correctly handles an async function that throws once and then succeeds with a timeout', async () => {
      const expectedResult: string = 'RESULT';
      let callCount: number = 0;
      const sleepSpy: jest.SpyInstance = jest
        .spyOn(Async, 'sleepAsync')
        .mockImplementation(() => Promise.resolve());

      const resultPromise: Promise<string> = Async.runWithRetriesAsync({
        // eslint-disable-next-line @typescript-eslint/naming-convention
        action: async () => {
          if (callCount++ === 0) {
            throw new Error('error');
          } else {
            return expectedResult;
          }
        },
        maxRetries: 1,
        retryDelayMs: 5
      });

      expect(await resultPromise).toEqual(expectedResult);
      expect(sleepSpy).toHaveBeenCalledTimes(1);
      expect(sleepSpy).toHaveBeenLastCalledWith(5);
    });
  });
});

describe(AsyncQueue.name, () => {
  it('Can enqueue and dequeue items', async () => {
    const expectedItems: Set<number> = new Set([1, 2, 3]);
    const expectedSeenItems: number = 3;

    let seenItems: number = 0;
    const queue: AsyncQueue<number> = new AsyncQueue<number>(expectedItems);

    for await (const [item, callback] of queue) {
      seenItems++;
      expect(expectedItems.has(item)).toBe(true);
      expectedItems.delete(item);
      callback();
    }

    expect(seenItems).toEqual(expectedSeenItems);
    expect(expectedItems.size).toEqual(0);
  });

  it('Can dynamically enqueue and dequeue items', async () => {
    const expectedItems: Set<number> = new Set([1, 2, 3]);
    const expectedAdditionalItems = new Set([4, 5, 6]);
    const expectedSeenItems: number = 6;

    let seenItems: number = 0;
    const queue: AsyncQueue<number> = new AsyncQueue<number>(expectedItems);

    for await (const [item, callback] of queue) {
      seenItems++;
      if (item < 4) {
        expect(expectedItems.has(item)).toBe(true);
        expectedItems.delete(item);
        queue.push(item + 3);
      } else {
        expect(expectedAdditionalItems.has(item)).toBe(true);
        expectedAdditionalItems.delete(item);
      }
      callback();
    }

    expect(seenItems).toEqual(expectedSeenItems);
    expect(expectedItems.size).toEqual(0);
    expect(expectedAdditionalItems.size).toEqual(0);
  });

  it('Can enqueue and dequeue items concurrently', async () => {
    const expectedItems: Set<number> = new Set([1, 2, 3]);
    const expectedSeenItems: number = 3;

    let seenItems: number = 0;
    const queue: AsyncQueue<number> = new AsyncQueue<number>(expectedItems);

    await Async.forEachAsync(
      queue,
      async ([item, callback]) => {
        // Add an async tick to ensure that the queue is actually running concurrently
        await Async.sleepAsync(0);
        seenItems++;
        expect(expectedItems.has(item)).toBe(true);
        expectedItems.delete(item);
        callback();
      },
      {
        concurrency: 10
      }
    );

    expect(seenItems).toEqual(expectedSeenItems);
    expect(expectedItems.size).toEqual(0);
  });

  it('Can dynamically enqueue and dequeue items concurrently', async () => {
    const expectedItems: Set<number> = new Set([1, 2, 3]);
    const expectedAdditionalItems = new Set([4, 5, 6]);
    const expectedSeenItems: number = 6;

    let seenItems: number = 0;
    const queue: AsyncQueue<number> = new AsyncQueue<number>(expectedItems);

    await Async.forEachAsync(
      queue,
      async ([item, callback]) => {
        // Add an async tick to ensure that the queue is actually running concurrently
        await Async.sleepAsync(0);
        seenItems++;
        if (item < 4) {
          expect(expectedItems.has(item)).toBe(true);
          expectedItems.delete(item);
          queue.push(item + 3);
        } else {
          expect(expectedAdditionalItems.has(item)).toBe(true);
          expectedAdditionalItems.delete(item);
        }
        callback();
      },
      {
        concurrency: 10
      }
    );

    expect(seenItems).toEqual(expectedSeenItems);
    expect(expectedItems.size).toEqual(0);
    expect(expectedAdditionalItems.size).toEqual(0);
  });

  it('Can dynamically enqueue and dequeue items concurrently after reaching last item', async () => {
    const expectedItems: Set<number> = new Set([1, 2, 3]);
    const expectedAdditionalItems = new Set([4, 5, 6]);
    const expectedSeenItems: number = 6;

    let seenItems: number = 0;
    const queue: AsyncQueue<number> = new AsyncQueue<number>(expectedItems);

    await Async.forEachAsync(
      queue,
      async ([item, callback]) => {
        // Add an async tick to ensure that the queue is actually running concurrently
        await Async.sleepAsync(0);
        seenItems++;
        if (item < 4) {
          expect(expectedItems.has(item)).toBe(true);
          expectedItems.delete(item);
          if (item === 3) {
            for (const additionalItem of expectedAdditionalItems) {
              queue.push(additionalItem);
            }
          }
        } else {
          expect(expectedAdditionalItems.has(item)).toBe(true);
          expectedAdditionalItems.delete(item);
        }
        callback();
      },
      {
        concurrency: 10
      }
    );

    expect(seenItems).toEqual(expectedSeenItems);
    expect(expectedItems.size).toEqual(0);
    expect(expectedAdditionalItems.size).toEqual(0);
  });
});
