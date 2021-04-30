// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Async } from '../Async';

describe('Async', () => {
  describe('mapLimitAsync', () => {
    it('returns the same result as built-in Promise.all', async () => {
      const array: number[] = [1, 2, 3, 4, 5, 6, 7, 8];
      const fn: (item: number) => Promise<string> = async (item) => `result ${item}`;

      expect(await Async.mapLimitAsync(array, 1, fn)).toEqual(await Promise.all(array.map(fn)));
    });

    it('ensures no more than N operations occur in parallel', async () => {
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

      expect(await Async.mapLimitAsync(array, 3, fn)).toEqual([
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
  });

  describe('forEachLimitAsync', () => {
    it('ensures no more than N operations occur in parallel', async () => {
      let running: number = 0;
      let maxRunning: number = 0;

      const array: number[] = [1, 2, 3, 4, 5, 6, 7, 8];

      const fn: (item: number) => Promise<void> = jest.fn(async (item) => {
        running++;
        await Async.sleep(1);
        maxRunning = Math.max(maxRunning, running);
        running--;
      });

      await Async.forEachLimitAsync(array, 3, fn);
      expect(fn).toHaveBeenCalledTimes(8);
      expect(maxRunning).toEqual(3);
    });
  });
});
