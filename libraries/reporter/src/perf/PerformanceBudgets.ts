// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The blocking performance and capacity budgets that the reporter subsystem must
 * respect. These are the P0 acceptance thresholds from the Rush Reporter
 * Overhaul specification (§7.3 "Performance and Capacity").
 *
 * @remarks
 * The budgets are expressed as hard ceilings: a candidate build satisfies the
 * budget when its measured value is less than or equal to the corresponding
 * ceiling. They are surfaced as data (rather than hard-coded at each call site)
 * so benchmark harnesses, capacity tests, and reporters can share a single
 * source of truth.
 *
 * @beta
 */
export interface IReporterPerformanceBudgets {
  /**
   * The maximum acceptable representative-build wall-time regression, expressed
   * as a percentage of the pre-reporter baseline. Defaults to `3`.
   */
  readonly maxWallTimeRegressionPercent: number;

  /**
   * The maximum acceptable additional peak resident memory attributable to the
   * reporter subsystem, in bytes. Defaults to 32 MiB.
   */
  readonly maxAdditionalPeakMemoryBytes: number;

  /**
   * The maximum interactive live-region refresh rate, in hertz. Defaults to
   * `10` (a 100 ms minimum repaint interval).
   */
  readonly maxInteractiveRefreshHz: number;

  /**
   * The maximum size of a single AI reporter payload, in bytes. Defaults to
   * 64 KiB.
   */
  readonly maxAiOutputBytes: number;

  /**
   * The maximum number of fully-detailed diagnostics an AI reporter emits
   * before summarizing the remainder. Defaults to `20`.
   */
  readonly maxAiDetailedDiagnostics: number;
}

/**
 * One mebibyte, in bytes.
 */
const BYTES_PER_MIB: number = 1024 * 1024;

/**
 * One kibibyte, in bytes.
 */
const BYTES_PER_KIB: number = 1024;

/**
 * The default reporter performance and capacity budgets from specification
 * §7.3.
 *
 * @beta
 */
export const REPORTER_PERFORMANCE_BUDGETS: IReporterPerformanceBudgets = {
  maxWallTimeRegressionPercent: 3,
  maxAdditionalPeakMemoryBytes: 32 * BYTES_PER_MIB,
  maxInteractiveRefreshHz: 10,
  maxAiOutputBytes: 64 * BYTES_PER_KIB,
  maxAiDetailedDiagnostics: 20
};

/**
 * Computes the wall-time regression of a candidate measurement relative to a
 * baseline, expressed as a percentage.
 *
 * @remarks
 * A positive result denotes a slowdown; a negative result denotes a speedup.
 *
 * @param baselineMs - the baseline wall-time in milliseconds; must be greater
 * than zero
 * @param candidateMs - the candidate wall-time in milliseconds
 * @returns the regression as a percentage of the baseline
 *
 * @beta
 */
export function computeWallTimeRegressionPercent(baselineMs: number, candidateMs: number): number {
  if (!(baselineMs > 0)) {
    throw new Error('baselineMs must be greater than zero');
  }
  return ((candidateMs - baselineMs) / baselineMs) * 100;
}

/**
 * Determines whether a candidate wall-time stays within the wall-time
 * regression budget.
 *
 * @param baselineMs - the baseline wall-time in milliseconds
 * @param candidateMs - the candidate wall-time in milliseconds
 * @param budgets - the budgets to check against; defaults to
 * {@link REPORTER_PERFORMANCE_BUDGETS}
 *
 * @beta
 */
export function isWithinWallTimeBudget(
  baselineMs: number,
  candidateMs: number,
  budgets: IReporterPerformanceBudgets = REPORTER_PERFORMANCE_BUDGETS
): boolean {
  return computeWallTimeRegressionPercent(baselineMs, candidateMs) <= budgets.maxWallTimeRegressionPercent;
}

/**
 * Determines whether an additional peak-memory measurement stays within the
 * memory budget.
 *
 * @param additionalPeakBytes - the additional peak memory attributable to the
 * reporter subsystem, in bytes
 * @param budgets - the budgets to check against; defaults to
 * {@link REPORTER_PERFORMANCE_BUDGETS}
 *
 * @beta
 */
export function isWithinMemoryBudget(
  additionalPeakBytes: number,
  budgets: IReporterPerformanceBudgets = REPORTER_PERFORMANCE_BUDGETS
): boolean {
  return additionalPeakBytes <= budgets.maxAdditionalPeakMemoryBytes;
}
