// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { PerformanceEntry, PerformanceMark, PerformanceMeasure } from 'node:perf_hooks';

/**
 * Starts a performance measurement.
 * @param name - The name of the performance measurement. This should be unique for each measurement.
 * @returns The performance mark that indicates the start of a measurement.
 */
export function startPerformanceMeasurement(name: string): PerformanceMark {
  return performance.mark(`${name}:start`);
}

/**
 * Ends a performance measurement.
 * @param name - The name of the performance measurement. This should match the name used in `startPerformanceMeasurement`.
 * @returns The performance measure that contains the start and end marks for the measurement.
 */
export function endPerformanceMeasurement(name: string): PerformanceMeasure {
  return performance.measure(name, `${name}:start`);
}

/**
 * Measures the execution time of a Promise-returning function.
 * @param fn - A function that returns a Promise. This function will be executed, and its execution time will be measured.
 * @param name - The name of the performance measurement. This should be unique for each measurement.
 * @returns A Promise that resolves with the result of the function.
 */
export function measureAsyncFn<T>(fn: () => Promise<T>, name: string): Promise<T> {
  const start: number = performance.now();
  return fn().finally(() => {
    performance.measure(name, {
      start
    });
  });
}

/**
 * Measures the execution time of a synchronous function.
 * @param fn - A function that returns a value. This function will be executed, and its execution time will be measured.
 * @param name - The name of the performance measurement. This should be unique for each measurement.
 * @returns The result of the function.
 */
export function measureFn<T>(fn: () => T, name: string): T {
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
