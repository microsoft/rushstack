// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IOperationExecutionResult,
  IOperationGraph,
  IPhasedCommandEngineTelemetryRecord,
  Operation
} from '@microsoft/rush-lib';
import { OperationStatus } from '@microsoft/rush-lib';
import type { IDaemonPhasedRequest, IDaemonPhasedRequestResult } from '@rushstack/rush-daemon-protocol';

/** One phase of a phased request's handling, with `performance.now()` times. @beta */
export interface IPhasedRequestTelemetryMeasure {
  /** The measure name, such as `rush:daemon:queueWait`. */
  readonly name: string;
  /** A `performance.now()` value. */
  readonly startTimeMs: number;
  /** A `performance.now()` value. */
  readonly endTimeMs: number;
}

/**
 * The outcome and timing of one phased request that took part in a graph iteration or no-op check.
 *
 * @remarks
 * All times are `performance.now()` values of the daemon process.
 *
 * @beta
 */
export interface IPhasedRequestTelemetryReport {
  /** The request as the router executed it. */
  readonly request: IDaemonPhasedRequest;
  /** The result sent to the client. */
  readonly result: IDaemonPhasedRequestResult;
  /**
   * The request's non-silent selected operations. Operations that this request did not need to run, because
   * the warm graph had them up to date, are reported as `Skipped` with a zero-length stopwatch. For a failed
   * result that was published while operations of the request still ran, the records are collected once the
   * iteration ended, so those operations have their final statuses.
   */
  readonly records: ReadonlyMap<Operation, IPhasedCommandEngineTelemetryRecord>;
  /** How many of `records` were already up to date. */
  readonly countRetained: number;
  /** How many requests took part in the same graph iteration or no-op check. */
  readonly batchSize: number;
  /** Whether the graph scheduled an iteration for the batch. */
  readonly scheduled: boolean;
  /**
   * Whether the result was produced while the graph iteration was still running, for other requests or for
   * operations of this request that its failure did not block.
   */
  readonly earlyResult: boolean;
  /** When the router received the request. */
  readonly receivedTimeMs: number;
  /** When this request's batch began handling it. */
  readonly executionStartTimeMs: number;
  /** When the graph iteration began executing operations, if one was scheduled. */
  readonly iterationStartTimeMs: number | undefined;
  /** When the request's result was produced. */
  readonly resultTimeMs: number;
  /** The router's handling phases for this request, in order. */
  readonly measures: ReadonlyArray<IPhasedRequestTelemetryMeasure>;
}

/**
 * Receives one report for each phased request that took part in a graph iteration or no-op check.
 *
 * @remarks
 * The router invokes the sink once it wrote the request's result, or failed to, so that logging never delays a
 * result. A failed result that the router publishes while operations of the request that the failure did not
 * block still run is reported once the iteration ended instead, so that those operations have their final
 * statuses. Either way, the report has the timing of the result that the client received. The sink must not
 * throw; the router ignores its errors so that telemetry never changes a result.
 *
 * @beta
 */
export interface IPhasedRequestTelemetrySink {
  /**
   * Called once for each request, after its result was written to the client or the write failed, or once the
   * iteration ended for a failed result that was published while operations of the request still ran. Errors are
   * ignored.
   */
  logRequest(report: IPhasedRequestTelemetryReport): void;
}

/** The subset of a request event sink used to collect a request's telemetry records. */
export interface IPhasedRequestTelemetryObservations {
  getObservedResult(operation: Operation): { readonly executionResult: IOperationExecutionResult } | undefined;
}

export interface ICollectPhasedRequestTelemetryRecordsOptions {
  readonly activeOperations: ReadonlyArray<Operation>;
  readonly graph: IOperationGraph;
  readonly observations: IPhasedRequestTelemetryObservations;
  /** The timestamp given to operations that the request did not need to run. */
  readonly upToDateTimeMs: number;
}

export interface IPhasedRequestTelemetryRecords {
  readonly records: ReadonlyMap<Operation, IPhasedCommandEngineTelemetryRecord>;
  readonly countRetained: number;
}

const UNFINISHED_STATUSES: ReadonlySet<OperationStatus> = new Set([
  OperationStatus.Waiting,
  OperationStatus.Ready,
  OperationStatus.Queued,
  OperationStatus.Executing
]);

/**
 * Collects the telemetry records of one request's selection, matching the request's own end-of-run summary.
 */
export function collectPhasedRequestTelemetryRecords(
  options: ICollectPhasedRequestTelemetryRecordsOptions
): IPhasedRequestTelemetryRecords {
  const { activeOperations, graph, observations, upToDateTimeMs } = options;
  const active: ReadonlySet<Operation> = new Set(activeOperations);
  const records: Map<Operation, IPhasedCommandEngineTelemetryRecord> = new Map();
  let countRetained: number = 0;
  // Iterate the graph so that entries list operations in the same order as native entries.
  for (const operation of graph.operations) {
    if (!active.has(operation) || operation.runner?.silent !== false) {
      continue;
    }
    const observed: IOperationExecutionResult | undefined =
      observations.getObservedResult(operation)?.executionResult;
    if (observed && !observed.silent) {
      records.set(
        operation,
        UNFINISHED_STATUSES.has(observed.status) ? createAbortedRecord(observed) : observed
      );
    } else if (observed ?? graph.resultByOperation.get(operation)) {
      // A silent observed record belongs to an operation the graph disabled because it was already up to date.
      // Its retained stopwatch describes an earlier request, so it is not reported again.
      records.set(operation, {
        status: OperationStatus.Skipped,
        silent: false,
        stopwatch: { startTime: upToDateTimeMs, endTime: upToDateTimeMs },
        nonCachedDurationMs: undefined
      });
      countRetained++;
    }
  }
  return { records, countRetained };
}

function createAbortedRecord(observed: IOperationExecutionResult): IPhasedCommandEngineTelemetryRecord {
  // The client stopped observing before this operation finished. The operation may still finish before the report
  // is logged, so the report keeps the times it had when it was taken.
  const { startTime, endTime } = observed.stopwatch;
  return {
    status: OperationStatus.Aborted,
    silent: false,
    stopwatch: { startTime, endTime },
    nonCachedDurationMs: undefined
  };
}
