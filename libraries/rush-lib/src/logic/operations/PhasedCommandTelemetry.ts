// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITelemetryData, ITelemetryOperationResult } from '../Telemetry';
import type { IStopwatchResult } from '../../utilities/Stopwatch';
import type { Operation } from './Operation';
import { OperationStatus } from './OperationStatus';

/**
 * Telemetry data for a phased execution
 */
export interface IPhasedExecutionTelemetry {
  [key: string]: string | number | boolean;
  isInitial: boolean;
  isWatch: boolean;

  countAll: number;
  countSuccess: number;
  countSuccessWithWarnings: number;
  countFailure: number;
  countBlocked: number;
  countFromCache: number;
  countSkipped: number;
  countNoOp: number;
  countAborted: number;
}

/**
 * The fields of an operation's execution record that phased command telemetry reports.
 */
export interface IPhasedTelemetryOperationRecord {
  readonly status: OperationStatus;
  readonly silent: boolean;
  readonly stopwatch: Pick<IStopwatchResult, 'startTime' | 'endTime'>;
  readonly nonCachedDurationMs: number | undefined;
  readonly _operationMetadataManager?: { readonly wasCobuilt: boolean } | undefined;
}

/**
 * The command-scoped fields of a phased command's telemetry entries.
 */
export interface IPhasedCommandTelemetryFields {
  readonly nameForLog: string;
  readonly initialExtraData: Record<string, unknown>;
  readonly changedProjectsOnlyKey: string | undefined;
  readonly changedProjectsOnly: boolean;
}

export interface ICreatePhasedTelemetryDataOptions extends IPhasedCommandTelemetryFields {
  readonly isWatch: boolean;
  readonly isInitial: boolean;
  readonly durationInSeconds: number;
  readonly succeeded: boolean;
  readonly records: ReadonlyMap<Operation, IPhasedTelemetryOperationRecord>;
  /**
   * A `performance.now()` value subtracted from every operation timestamp. Long-lived hosts use it to report
   * timestamps relative to the request, as a native process reports them relative to its own start.
   */
  readonly timeOriginMs?: number;
}

/**
 * Builds the telemetry entry that a phased command logs for one set of operation results.
 */
export function createPhasedTelemetryData(options: ICreatePhasedTelemetryDataOptions): ITelemetryData {
  const { records, timeOriginMs = 0 } = options;
  const jsonOperationResults: Record<string, ITelemetryOperationResult> = {};

  const extraData: IPhasedExecutionTelemetry = {
    ...options.initialExtraData,
    isWatch: options.isWatch,
    // Fields specific to the current operation set
    isInitial: options.isInitial,

    countAll: 0,
    countSuccess: 0,
    countSuccessWithWarnings: 0,
    countFailure: 0,
    countBlocked: 0,
    countFromCache: 0,
    countSkipped: 0,
    countNoOp: 0,
    countAborted: 0
  };

  if (options.changedProjectsOnlyKey) {
    // Overwrite this value since we allow changing it at runtime.
    extraData[options.changedProjectsOnlyKey] = options.changedProjectsOnly;
  }

  const nonSilentDependenciesByOperation: Map<Operation, Set<string>> = new Map();
  function getNonSilentDependencies(operation: Operation): ReadonlySet<string> {
    let realDependencies: Set<string> | undefined = nonSilentDependenciesByOperation.get(operation);
    if (!realDependencies) {
      realDependencies = new Set();
      nonSilentDependenciesByOperation.set(operation, realDependencies);
      for (const dependency of operation.dependencies) {
        const dependencyRecord: IPhasedTelemetryOperationRecord | undefined = records.get(dependency);
        if (dependencyRecord?.silent) {
          for (const deepDependency of getNonSilentDependencies(dependency)) {
            realDependencies.add(deepDependency);
          }
        } else {
          realDependencies.add(dependency.name!);
        }
      }
    }
    return realDependencies;
  }

  for (const [operation, operationResult] of records) {
    if (operationResult.silent) {
      // Architectural operation. Ignore.
      continue;
    }

    const { _operationMetadataManager: operationMetadataManager } = operationResult;

    const { startTime, endTime } = operationResult.stopwatch;
    jsonOperationResults[operation.name!] = {
      startTimestampMs: startTime === undefined ? undefined : startTime - timeOriginMs,
      endTimestampMs: endTime === undefined ? undefined : endTime - timeOriginMs,
      nonCachedDurationMs: operationResult.nonCachedDurationMs,
      wasExecutedOnThisMachine: operationMetadataManager?.wasCobuilt !== true,
      result: operationResult.status,
      dependencies: Array.from(getNonSilentDependencies(operation)).sort()
    };

    extraData.countAll++;
    switch (operationResult.status) {
      case OperationStatus.Success:
        extraData.countSuccess++;
        break;
      case OperationStatus.SuccessWithWarning:
        extraData.countSuccessWithWarnings++;
        break;
      case OperationStatus.Failure:
        extraData.countFailure++;
        break;
      case OperationStatus.Blocked:
        extraData.countBlocked++;
        break;
      case OperationStatus.FromCache:
        extraData.countFromCache++;
        break;
      case OperationStatus.Skipped:
        extraData.countSkipped++;
        break;
      case OperationStatus.NoOp:
        extraData.countNoOp++;
        break;
      case OperationStatus.Aborted:
        extraData.countAborted++;
        break;
      default:
        // Do nothing.
        break;
    }
  }

  return {
    name: options.nameForLog,
    durationInSeconds: options.durationInSeconds,
    result: options.succeeded ? 'Succeeded' : 'Failed',
    extraData,
    operationResults: jsonOperationResults
  };
}
