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
 * A parallelism value expressed as a fraction of total available concurrency slots.
 * @beta
 */
export interface IParallelismScalar {
  readonly scalar: number;
}

/**
 * A parallelism value, either as an absolute integer count or a scalar fraction of available parallelism.
 * @beta
 */
export type Parallelism = number | IParallelismScalar;

/**
 * Since the JSON value is a string, it must be a percentage like "50%",
 * which we parse into a scalar in the range (0, 1].
 * The caller is responsible for multiplying by the available parallelism.
 */
export function parseParallelismPercent(weight: string): number {
  const percentageRegExp: RegExp = /^\d+(\.\d+)?%$/;

  if (!percentageRegExp.test(weight)) {
    throw new Error(`Expecting a percentage string like "12%" or "34.56%".`);
  }

  const percentValue: number = parseFloat(weight);

  if (percentValue <= 0) {
    throw new Error(`Invalid percentage value of "${percentValue}": value must be greater than zero`);
  }

  if (percentValue > 100) {
    throw new Error(`Invalid percentage value of "${percentValue}": value must not exceed 100%`);
  }

  return percentValue / 100;
}

/**
 * Coerces a `Parallelism` value to a concrete integer number of concurrency units, given the
 * maximum number of available slots.
 *
 * - Raw numeric values are clamped to `[minimum, maxParallelism]`.
 * - Scalar values are multiplied by `maxParallelism`, floored, and clamped to `[Math.max(1, minimum), maxParallelism]`.
 */
export function coerceParallelism(
  parallelism: Parallelism,
  maxParallelism: number,
  minimum: number = 0
): number {
  if (typeof parallelism === 'number') {
    return Math.max(minimum, Math.min(parallelism, maxParallelism));
  }
  // eslint-disable-next-line no-bitwise
  return Math.max(Math.max(1, minimum), Math.min((parallelism.scalar * maxParallelism) | 0, maxParallelism));
}

/**
 * Parses a command line specification for desired parallelism.
 * Factored out to enable unit tests
 */
export function parseParallelism(rawParallelism: string | undefined): Parallelism {
  if (rawParallelism) {
    rawParallelism = rawParallelism.trim();

    if (rawParallelism === 'max') {
      return { scalar: 1 };
    }

    if (rawParallelism.endsWith('%')) {
      return { scalar: parseParallelismPercent(rawParallelism) };
    }

    const parallelismAsNumber: number = Number(rawParallelism);
    if (!isNaN(parallelismAsNumber)) {
      return parallelismAsNumber;
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
      // Since we use Math.floor when coercing scalars, 0.999 * N = N - 1 for any integer N >= 1.
      return { scalar: 0.999 };
    } else {
      // Unix-like operating systems have more balanced scheduling, so default
      // to the number of CPU cores
      return { scalar: 1 };
    }
  }
}
