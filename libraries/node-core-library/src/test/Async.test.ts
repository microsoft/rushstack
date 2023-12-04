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

    it('returns the same result as built-in Promise.all', async () => {
      const array: number[] = [1, 2, 3, 4, 5, 6, 7, 8];
      const fn: (item: number) => Promise<string> = async (item) => `result ${item}`;

      expect(await Async.mapAsync(array, fn)).toEqual(await Promise.all(array.map(fn)));
    });

    it('if concurrency is set, ensures no more than N operations occur in parallel', async () => {
      let running: number = 0;
      let maxRunning: number = 0;

      const array: number[] = [1, 2, 3, 4, 5, 6, 7, 8];

      const fn: (item: number) => Promise<string> = async (item) => {
        running++;
        await Async.sleep(1);
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
        await Async.sleep(1);
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
        await Async.sleep(1);
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

      await Async.forEachAsync(array, async () => await Async.sleep(1), { concurrency: 3 });
    });

    it('rejects if any operation rejects', async () => {
      const array: number[] = [1, 2, 3];

      const fn: (item: number) => Promise<void> = jest.fn(async (item) => {
        await Async.sleep(1);
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
        Async.forEachAsync(syncIterable, async (item) => await Async.sleep(1))
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
        Async.forEachAsync(syncIterable, async (item) => await Async.sleep(1))
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

      const expectedConcurrency: 4 = 4;
      const finalPromise: Promise<void> = Async.forEachAsync(
        asyncIterable,
        async (item) => {
          // Do nothing
        },
        {
          concurrency: expectedConcurrency
        }
      );

      // Wait for all the instant resolutions to be done
      await Async.sleep(1);
      expect(waitingIterators).toEqual(expectedConcurrency);
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
        Async.forEachAsync(syncIterable, async (item) => await Async.sleep(1))
      ).rejects.toThrow(expectedError);
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
        .spyOn(Async, 'sleep')
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
        .spyOn(Async, 'sleep')
        .mockImplementation(() => Promise.resolve());

      const resultPromise: Promise<string> = Async.runWithRetriesAsync({
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
        await Async.sleep(1);
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
        await Async.sleep(1);
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
        await Async.sleep(1);
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
