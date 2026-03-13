// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';

import { IS_WINDOWS } from '../../utilities/executionUtilities';

let _maxParallelism: number = 0;

export function getNumberOfCores(): number {
  // Ensure this function caches the result (which is expected not to change while the process is loaded), but is expensive to obtain.
  return _maxParallelism || (_maxParallelism = os.availableParallelism?.() ?? os.cpus().length);
}

/**
 * Since the JSON value is a string, it must be a percentage like "50%",
 * which we convert to a number based on the available parallelism.
 * For example, if the available parallelism (not the -p flag) is 8 and the weight is "50%",
 * then the resulting weight will be 4.
 *
 * @param weight
 * @returns the final weight in integer concurrency units in the range [1, numberOfCores]
 */
export function parseParallelismPercent(weight: string, numberOfCores: number = getNumberOfCores()): number {
  const percentageRegExp: RegExp = /^\d+(\.\d+)?%$/;

  if (!percentageRegExp.test(weight)) {
    throw new Error(`Expecting a percentage string like "12%" or "34.56%".`);
  }

  const percentValue: number = parseFloat(weight.slice(0, -1));

  if (percentValue <= 0) {
    throw new Error(`Invalid percentage value of "${percentValue}": value must be greater than zero`);
  }

  if (percentValue > 100) {
    throw new Error(`Invalid percentage value of "${percentValue}": value must not exceed 100%`);
  }

  // Use as much CPU as possible, so we round down the weight here
  return Math.max(1, Math.floor((percentValue / 100) * numberOfCores));
}

/**
 * Parses a command line specification for desired parallelism.
 * Factored out to enable unit tests
 */
export function parseParallelism(
  rawParallelism: string | undefined,
  numberOfCores: number = getNumberOfCores()
): number {
  if (rawParallelism) {
    rawParallelism = rawParallelism.trim();

    if (rawParallelism === 'max') {
      return numberOfCores;
    }

    if (rawParallelism.endsWith('%')) {
      return parseParallelismPercent(rawParallelism, numberOfCores);
    }

    const parallelismAsNumber: number = Number(rawParallelism);
    if (!isNaN(parallelismAsNumber)) {
      return Math.max(parallelismAsNumber, 1);
    }

    throw new Error(
      `Invalid parallelism value of "${rawParallelism}": expected a number, a percentage string, or "max"`
    );
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
