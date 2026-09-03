// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  createRushDiagnostic,
  type IRushDiagnostic,
  type LifecycleEmitter,
  type OperationStreamEmitter,
  type OperationStatus as ReporterOperationStatus
} from '@rushstack/rush-reporter';
import { TerminalChunkKind, type ITerminalChunk } from '@rushstack/terminal';

import type { RushSession } from '../../pluginFramework/RushSession';
import {
  _correlateRushSessionError,
  _getRushSessionLifecycleEmitter,
  _getRushSessionOperationStreamEmitter
} from '../../pluginFramework/RushSession';
import type { IOperationExecutionResult } from './IOperationExecutionResult';
import type { IOperationGraphEventSink, IOperationActivityOptions } from './OperationEventSink';
import type { Operation } from './Operation';
import { OperationStatus } from './OperationStatus';
import type { OperationGraph } from './OperationGraph';

interface IReporterOperation {
  readonly emitter: LifecycleEmitter;
  readonly legacyOperationIds: Set<string>;
  readonly operationId: string;
  readonly phaseName: string;
  readonly projectName: string;
  readonly streamEmitter: OperationStreamEmitter | undefined;
  registrationCycle: IReporterOperationCycle | undefined;
}

interface IReporterOperationCycle {
  readonly registeredOperationIds: Set<string>;
  readonly statuses: Map<string, OperationStatus>;
  readonly closedOperationIds: Set<string>;
  readonly completedResults: Map<string, IOperationExecutionResult>;
  diagnosed: boolean;
  lastEmittedStatus: ReporterOperationStatus | undefined;
  silent: boolean;
  streamClosed: boolean;
}

class ReporterOperationEventSink implements IOperationGraphEventSink {
  public readonly onOperationChunk:
    | ((result: IOperationExecutionResult, chunk: ITerminalChunk) => void)
    | undefined;
  public readonly onOperationStreamClosed: ((result: IOperationExecutionResult) => void) | undefined;
  public readonly onOperationCompleted: ((result: IOperationExecutionResult) => void) | undefined;

  private readonly _operationsByLegacyId: Map<string, IReporterOperation> = new Map();
  private readonly _cyclesByResult: WeakMap<IOperationExecutionResult, IReporterOperationCycle> =
    new WeakMap();
  private readonly _rushSession: RushSession;

  public constructor(rushSession: RushSession, commandName: string, operations: Iterable<Operation>) {
    this._rushSession = rushSession;
    const operationsByReporterId: Map<string, IReporterOperation> = new Map();

    for (const operation of operations) {
      const projectName: string = operation.associatedProject.packageName;
      const phaseName: string = operation.associatedPhase.name;
      const operationId: string = `${projectName}#${phaseName}`;
      let reporterOperation: IReporterOperation | undefined = operationsByReporterId.get(operationId);
      if (!reporterOperation) {
        const emitter: LifecycleEmitter | undefined = _getRushSessionLifecycleEmitter(rushSession, {
          commandName,
          operationId,
          projectName,
          phaseName
        });
        if (!emitter) {
          continue;
        }
        const streamEmitter: OperationStreamEmitter | undefined = _getRushSessionOperationStreamEmitter(
          rushSession,
          {
            commandName,
            operationId,
            projectName,
            phaseName
          }
        );
        reporterOperation = {
          emitter,
          legacyOperationIds: new Set(),
          operationId,
          phaseName,
          projectName,
          streamEmitter,
          registrationCycle: undefined
        };
        operationsByReporterId.set(operationId, reporterOperation);
      }
      reporterOperation.legacyOperationIds.add(operation.name);
      this._operationsByLegacyId.set(operation.name, reporterOperation);
    }

    if (Array.from(this._operationsByLegacyId.values()).some(({ streamEmitter }) => !!streamEmitter)) {
      this.onOperationChunk = (result, chunk) => this._onOperationChunk(result, chunk);
      this.onOperationStreamClosed = (result) => this._onOperationStreamClosed(result);
      this.onOperationCompleted = (result) => this._onOperationCompleted(result);
    } else {
      this.onOperationChunk = undefined;
      this.onOperationStreamClosed = undefined;
      this.onOperationCompleted = undefined;
    }
  }

  public get isEnabled(): boolean {
    return this._operationsByLegacyId.size > 0;
  }

  public onOperationRegistered(
    operationId: string,
    silent: boolean,
    result?: IOperationExecutionResult
  ): void {
    const operation: IReporterOperation | undefined = this._operationsByLegacyId.get(operationId);
    if (!operation || !result) {
      return;
    }

    let cycle: IReporterOperationCycle | undefined = operation.registrationCycle;
    if (!cycle || cycle.registeredOperationIds.size === operation.legacyOperationIds.size) {
      cycle = {
        registeredOperationIds: new Set(),
        statuses: new Map(),
        closedOperationIds: new Set(),
        completedResults: new Map(),
        diagnosed: false,
        lastEmittedStatus: undefined,
        silent: true,
        streamClosed: false
      };
      operation.registrationCycle = cycle;
    }

    this._cyclesByResult.set(result, cycle);
    cycle.registeredOperationIds.add(operationId);
    cycle.silent &&= silent;
    if (cycle.registeredOperationIds.size !== operation.legacyOperationIds.size) {
      return;
    }

    if (operation.streamEmitter) {
      operation.streamEmitter.registerOperation(
        operation.operationId,
        operation.projectName,
        operation.phaseName,
        cycle.silent
      );
    } else if (!cycle.silent) {
      operation.emitter.emitOperationRegistered({
        operationId: operation.operationId,
        projectName: operation.projectName,
        phaseName: operation.phaseName
      });
    }
  }

  public onOperationStatusChanged(result: IOperationExecutionResult, previousStatus: OperationStatus): void {
    const operation: IReporterOperation | undefined = this._operationsByLegacyId.get(result.operation.name);
    if (!operation) {
      return;
    }
    const cycle: IReporterOperationCycle | undefined = this._cyclesByResult.get(result);
    if (!cycle) {
      return;
    }

    if (
      result.status === OperationStatus.Ready &&
      cycle.registeredOperationIds.size === operation.legacyOperationIds.size
    ) {
      return;
    }

    cycle.statuses.set(result.operation.name, result.status);
    if (result.status === OperationStatus.Failure && !cycle.diagnosed) {
      cycle.diagnosed = true;
      const diagnostic: IRushDiagnostic = createRushDiagnostic('RUSH_OPERATION_FAILED', {
        parameters: {
          projectName: { value: operation.projectName, privacy: 'public' }
        }
      });
      operation.emitter.emitDiagnostic(diagnostic);
      if (result.error) {
        _correlateRushSessionError(this._rushSession, result.error, diagnostic.diagnosticId);
      }
    }

    const status: ReporterOperationStatus | undefined = _getAggregateStatus(operation, cycle);
    if (status === undefined || status === cycle.lastEmittedStatus) {
      return;
    }
    const aggregatePreviousStatus: ReporterOperationStatus | undefined =
      cycle.lastEmittedStatus ??
      (operation.legacyOperationIds.size === 1 ? _toReporterStatus(previousStatus) : undefined);
    cycle.lastEmittedStatus = status;
    const durationMs: number | undefined =
      operation.legacyOperationIds.size === 1 && result.stopwatch.startTime !== undefined
        ? result.stopwatch.duration * 1000
        : undefined;
    if (operation.streamEmitter) {
      operation.streamEmitter.changeStatus(
        operation.operationId,
        status,
        durationMs,
        aggregatePreviousStatus
      );
    } else if (!cycle.silent) {
      operation.emitter.emitOperationStatusChanged({
        operationId: operation.operationId,
        status,
        ...(durationMs === undefined ? {} : { durationMs })
      });
    }
  }

  private _onOperationChunk(result: IOperationExecutionResult, chunk: ITerminalChunk): void {
    const operation: IReporterOperation | undefined = this._operationsByLegacyId.get(result.operation.name);
    if (!operation?.streamEmitter || !this._cyclesByResult.has(result)) {
      return;
    }

    if (chunk.kind === TerminalChunkKind.Stdout) {
      operation.streamEmitter.writeOutput(operation.operationId, 'stdout', chunk.text);
    } else if (chunk.kind === TerminalChunkKind.Stderr) {
      operation.streamEmitter.writeOutput(operation.operationId, 'stderr', chunk.text);
    }
  }

  private _onOperationStreamClosed(result: IOperationExecutionResult): void {
    const operationId: string = result.operation.name;
    const operation: IReporterOperation | undefined = this._operationsByLegacyId.get(operationId);
    const cycle: IReporterOperationCycle | undefined = this._cyclesByResult.get(result);
    if (!operation?.streamEmitter || !cycle || cycle.streamClosed) {
      return;
    }
    cycle.closedOperationIds.add(operationId);
    if (cycle.closedOperationIds.size === operation.legacyOperationIds.size) {
      cycle.streamClosed = true;
      operation.streamEmitter.closeOperationStream(operation.operationId);
    }
  }

  private _onOperationCompleted(result: IOperationExecutionResult): void {
    const operation: IReporterOperation | undefined = this._operationsByLegacyId.get(result.operation.name);
    if (!operation?.streamEmitter) {
      return;
    }
    const cycle: IReporterOperationCycle | undefined = this._cyclesByResult.get(result);
    if (!cycle) {
      return;
    }

    cycle.completedResults.set(result.operation.name, result);
    if (cycle.completedResults.size !== operation.legacyOperationIds.size) {
      return;
    }
    const status: ReporterOperationStatus = _getAggregateTerminalStatus(
      Array.from(cycle.completedResults.values(), ({ status: resultStatus }) => resultStatus)
    );
    const durationMs: number | undefined = _getAggregateDurationMs(cycle.completedResults);
    operation.streamEmitter.completeOperation(operation.operationId, status, durationMs);
  }
}

class CompositeOperationGraphEventSink implements IOperationGraphEventSink {
  public readonly onOperationChunk:
    | ((result: IOperationExecutionResult, chunk: ITerminalChunk) => void)
    | undefined;
  public readonly onOperationStreamClosed: ((result: IOperationExecutionResult) => void) | undefined;
  public readonly onOperationCompleted: ((result: IOperationExecutionResult) => void) | undefined;

  private readonly _first: IOperationGraphEventSink;
  private readonly _second: IOperationGraphEventSink;

  public constructor(first: IOperationGraphEventSink, second: IOperationGraphEventSink) {
    this._first = first;
    this._second = second;
    this.onOperationChunk =
      first.onOperationChunk || second.onOperationChunk
        ? (result, chunk) => {
            first.onOperationChunk?.(result, chunk);
            second.onOperationChunk?.(result, chunk);
          }
        : undefined;
    this.onOperationStreamClosed =
      first.onOperationStreamClosed || second.onOperationStreamClosed
        ? (result) => {
            first.onOperationStreamClosed?.(result);
            second.onOperationStreamClosed?.(result);
          }
        : undefined;
    this.onOperationCompleted =
      first.onOperationCompleted || second.onOperationCompleted
        ? (result) => {
            first.onOperationCompleted?.(result);
            second.onOperationCompleted?.(result);
          }
        : undefined;
  }

  public onOperationRegistered(
    operationId: string,
    silent: boolean,
    result?: IOperationExecutionResult
  ): void {
    this._first.onOperationRegistered?.(operationId, silent, result);
    this._second.onOperationRegistered?.(operationId, silent, result);
  }

  public onOperationStatusChanged(result: IOperationExecutionResult, previousStatus: OperationStatus): void {
    this._first.onOperationStatusChanged?.(result, previousStatus);
    this._second.onOperationStatusChanged?.(result, previousStatus);
  }

  public onOperationHeader(operationId: string, completedOperations: number, totalOperations: number): void {
    this._first.onOperationHeader?.(operationId, completedOperations, totalOperations);
    this._second.onOperationHeader?.(operationId, completedOperations, totalOperations);
  }

  public onActivity(text: string, options?: IOperationActivityOptions): void {
    this._first.onActivity?.(text, options);
    this._second.onActivity?.(text, options);
  }
}

/**
 * Adds reporter emission without changing the graph's visible output or collator routing.
 *
 * @internal
 */
export function attachReporterOperationEventSink(
  graph: OperationGraph,
  rushSession: RushSession,
  commandName: string
): void {
  const reporterSink: ReporterOperationEventSink = new ReporterOperationEventSink(
    rushSession,
    commandName,
    graph.operations
  );
  if (!reporterSink.isEnabled) {
    return;
  }

  graph.eventSink = graph.eventSink
    ? new CompositeOperationGraphEventSink(graph.eventSink, reporterSink)
    : reporterSink;
}

function _toReporterStatus(status: OperationStatus): ReporterOperationStatus {
  switch (status) {
    case OperationStatus.Ready:
      return 'ready';
    case OperationStatus.Waiting:
      return 'waiting';
    case OperationStatus.Queued:
      return 'queued';
    case OperationStatus.Executing:
      return 'executing';
    case OperationStatus.Success:
      return 'success';
    case OperationStatus.SuccessWithWarning:
      return 'successWithWarnings';
    case OperationStatus.Failure:
      return 'failure';
    case OperationStatus.Blocked:
      return 'blocked';
    case OperationStatus.Skipped:
      return 'skipped';
    case OperationStatus.FromCache:
      return 'fromCache';
    case OperationStatus.NoOp:
      return 'noOp';
    case OperationStatus.Aborted:
      return 'aborted';
  }
}

function _getAggregateStatus(
  operation: IReporterOperation,
  cycle: IReporterOperationCycle
): ReporterOperationStatus | undefined {
  const statuses: readonly OperationStatus[] = [...cycle.statuses.values()];
  if (
    statuses.some((status) => status === OperationStatus.Executing) ||
    cycle.lastEmittedStatus === 'executing'
  ) {
    if (
      cycle.statuses.size !== operation.legacyOperationIds.size ||
      statuses.some((status) => !_isTerminalStatus(status))
    ) {
      return 'executing';
    }
  }
  if (
    cycle.statuses.size === operation.legacyOperationIds.size &&
    statuses.every((status) => _isTerminalStatus(status))
  ) {
    return _getAggregateTerminalStatus(statuses);
  }
  if (statuses.some((status) => status === OperationStatus.Queued)) {
    return 'queued';
  }
  if (statuses.some((status) => status === OperationStatus.Ready)) {
    return 'ready';
  }
  if (statuses.some((status) => status === OperationStatus.Waiting)) {
    return 'waiting';
  }
  return operation.legacyOperationIds.size === 1
    ? _toReporterStatus(statuses[0] ?? OperationStatus.Ready)
    : undefined;
}

function _getAggregateTerminalStatus(operationStatuses: Iterable<OperationStatus>): ReporterOperationStatus {
  const statuses: Set<OperationStatus> = new Set(operationStatuses);
  if (statuses.has(OperationStatus.Failure)) return 'failure';
  if (statuses.has(OperationStatus.Aborted)) return 'aborted';
  if (statuses.has(OperationStatus.Blocked)) return 'blocked';
  if (statuses.has(OperationStatus.SuccessWithWarning)) return 'successWithWarnings';
  if (statuses.has(OperationStatus.Success)) return 'success';
  if (statuses.has(OperationStatus.FromCache)) return 'fromCache';
  if (statuses.has(OperationStatus.Skipped)) return 'skipped';
  return 'noOp';
}

function _isTerminalStatus(status: OperationStatus): boolean {
  switch (status) {
    case OperationStatus.Success:
    case OperationStatus.SuccessWithWarning:
    case OperationStatus.Failure:
    case OperationStatus.Blocked:
    case OperationStatus.Skipped:
    case OperationStatus.FromCache:
    case OperationStatus.NoOp:
    case OperationStatus.Aborted:
      return true;
    default:
      return false;
  }
}

function _getAggregateDurationMs(
  results: ReadonlyMap<string, IOperationExecutionResult>
): number | undefined {
  let startTime: number | undefined;
  let endTime: number | undefined;
  for (const result of results.values()) {
    if (result.stopwatch.startTime !== undefined) {
      startTime =
        startTime === undefined
          ? result.stopwatch.startTime
          : Math.min(startTime, result.stopwatch.startTime);
    }
    if (result.stopwatch.endTime !== undefined) {
      endTime =
        endTime === undefined ? result.stopwatch.endTime : Math.max(endTime, result.stopwatch.endTime);
    }
  }
  if (startTime !== undefined && endTime !== undefined) {
    return Math.max(0, endTime - startTime);
  }
  if (results.size === 1) {
    const result: IOperationExecutionResult | undefined = results.values().next().value;
    return result?.stopwatch.startTime === undefined ? undefined : result.stopwatch.duration * 1000;
  }
  return undefined;
}
