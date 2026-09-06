// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';

/**
 * The command result recorded by telemetry.
 *
 * @beta
 */
export type TelemetryResult = 'succeeded' | 'failed';

/**
 * The allowlisted telemetry aggregate produced at command completion.
 *
 * @remarks
 * Only these fields ever leave the machine. Messages, templates, paths, raw
 * stdout/stderr, command arguments, remediation parameters, stack traces, and
 * any local-sensitive or secret values are excluded by construction.
 *
 * @beta
 */
export interface ITelemetryAggregate {
  /**
   * The command name.
   */
  readonly commandName?: string;

  /**
   * Whether the command succeeded or failed.
   */
  readonly result?: TelemetryResult;

  /**
   * The process exit code.
   */
  readonly exitCode?: number;

  /**
   * The command or session duration in milliseconds.
   */
  readonly durationMs?: number;

  /**
   * The number of operations that reached each status.
   */
  readonly operationStatusCounts: { readonly [status: string]: number };

  /**
   * The distinct diagnostic codes emitted, sorted.
   */
  readonly diagnosticCodes: readonly string[];

  /**
   * The number of diagnostics emitted in each category.
   */
  readonly diagnosticCategoryCounts: { readonly [category: string]: number };

  /**
   * The selected reporter mode.
   */
  readonly reporterMode?: string;

  /**
   * The reporter protocol version.
   */
  readonly protocolVersion?: IReporterProtocolVersion;

  /**
   * The distinct `packageName@packageVersion` producers observed, sorted.
   */
  readonly producerVersions: readonly string[];
}

/**
 * The complete set of allowlisted telemetry aggregate keys.
 *
 * @remarks
 * Used to assert that no non-allowlisted field ever appears in the aggregate.
 *
 * @beta
 */
export const TELEMETRY_AGGREGATE_KEYS: readonly string[] = [
  'commandName',
  'result',
  'exitCode',
  'durationMs',
  'operationStatusCounts',
  'diagnosticCodes',
  'diagnosticCategoryCounts',
  'reporterMode',
  'protocolVersion',
  'producerVersions'
];
