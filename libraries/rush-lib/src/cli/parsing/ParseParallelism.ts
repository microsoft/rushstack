// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';

import { IS_WINDOWS } from '../../utilities/executionUtilities.ts';

/**
 * Parses a command line specification for desired parallelism.
 * Factored out to enable unit tests
 */
export function parseParallelism(
  rawParallelism: string | undefined,
  numberOfCores: number = os.availableParallelism?.() ?? os.cpus().length
): number {
  if (rawParallelism) {
    if (rawParallelism === 'max') {
      return numberOfCores;
    } else {
      const parallelismAsNumber: number = Number(rawParallelism);

      if (typeof rawParallelism === 'string' && rawParallelism.trim().endsWith('%')) {
        const parsedPercentage: number = Number(rawParallelism.trim().replace(/\%$/, ''));

        if (parsedPercentage <= 0 || parsedPercentage > 100) {
          throw new Error(
            `Invalid percentage value of '${rawParallelism}', value cannot be less than '0%' or more than '100%'`
          );
        }

        const workers: number = Math.floor((parsedPercentage / 100) * numberOfCores);
        return Math.max(workers, 1);
      } else if (!isNaN(parallelismAsNumber)) {
        return Math.max(parallelismAsNumber, 1);
      } else {
        throw new Error(
          `Invalid parallelism value of '${rawParallelism}', expected a number, a percentage, or 'max'`
        );
      }
    }
  } else {
    // If an explicit parallelism number wasn't provided, then choose a sensible
    // default.
    if (IS_WINDOWS) {
      // On desktop Windows, some people have complained that their system becomes
      // sluggish if Rush is using all the CPU cores.  Leave one thread for
      // other operations. For CI environments, you can use the "max" argument to use all available cores.
      return Math.max(numberOfCores - 1, 1);
    } else {
      // Unix-like operating systems have more balanced scheduling, so default
      // to the number of CPU cores
      return numberOfCores;
    }
  }
}
