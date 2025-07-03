// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { PerformanceEntry } from 'node:perf_hooks';

/**
 * Starts a performance measurement that can be disposed later to record the elapsed time.
 * @param name - The name of the performance measurement. This should be unique for each measurement.
 * @returns A Disposable object that, when disposed, will end and record the performance measurement.
 */
export function measureUntilDisposed(name: string): Disposable {
  const start: number = performance.now();

  return {
    [Symbol.dispose]() {
      performance.measure(name, {
        start
      });
    }
  };
}

/**
 * Measures the execution time of a Promise-returning function.
 * @param name - The name of the performance measurement. This should be unique for each measurement.
 * @param fn - A function that returns a Promise. This function will be executed, and its execution time will be measured.
 * @returns A Promise that resolves with the result of the function.
 */
export function measureAsyncFn<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start: number = performance.now();
  return fn().finally(() => {
    performance.measure(name, {
      start
    });
  });
}

/**
 * Measures the execution time of a synchronous function.
 * @param name - The name of the performance measurement. This should be unique for each measurement.
 * @param fn - A function that returns a value. This function will be executed, and its execution time will be measured.
 * @returns The result of the function.
 */
export function measureFn<T>(name: string, fn: () => T): T {
  const start: number = performance.now();
  try {
    return fn();
  } finally {
    performance.measure(name, {
      start
    });
  }
}

/**
 * Collects performance measurements that were created after a specified start time.
 * @param startTime - The start time in milliseconds from which to collect performance measurements.
 * @returns An array of `PerformanceEntry` objects with start times greater than or equal to the specified start time.
 */
export function collectPerformanceEntries(startTime: number): PerformanceEntry[] {
  const entries: PerformanceEntry[] = performance.getEntries();
  const startIndex: number = entries.findIndex((entry) => entry.startTime >= startTime);
  if (startIndex === -1) {
    return []; // No entries found after the specified start time
  }
  return entries.slice(startIndex);
}
