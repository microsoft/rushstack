// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Async } from '../Async';

describe('Async', () => {
  describe('mapAsync', () => {
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

  describe('forEachAsync', () => {
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
});
