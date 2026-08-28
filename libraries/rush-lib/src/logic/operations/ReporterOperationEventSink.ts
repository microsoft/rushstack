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
import { OperationStatus, SUCCESS_STATUSES } from './OperationStatus';
import type { OperationGraph } from './OperationGraph';

interface IReporterOperation {
  readonly emitter: LifecycleEmitter;
  readonly legacyOperationIds: Set<string>;
  readonly operationId: string;
  readonly phaseName: string;
  readonly projectName: string;
  readonly streamEmitter: OperationStreamEmitter | undefined;
  readonly cycles: Map<number, IReporterOperationCycle>;
  latestCompletedIterationId: number | undefined;
}

interface IReporterOperationCycle {
  readonly registeredOperationIds: Set<string>;
  readonly statuses: Map<string, OperationStatus>;
  readonly closedOperationIds: Set<string>;
  readonly completedResults: Map<string, IOperationExecutionResult>;
  lastEmittedStatus: ReporterOperationStatus | undefined;
  silent: boolean;
  streamClosed: boolean;
}

class ReporterOperationEventSink implements IOperationGraphEventSink {
  public readonly onOperationChunk:
    | ((operationId: string, chunk: ITerminalChunk, iterationId: number) => void)
    | undefined;
  public readonly onOperationStreamClosed: ((operationId: string, iterationId: number) => void) | undefined;
  public readonly onOperationCompleted: ((result: IOperationExecutionResult) => void) | undefined;

  private readonly _operationsByLegacyId: Map<string, IReporterOperation> = new Map();
  private readonly _diagnosedOperations: Set<string> = new Set();
  private readonly _commandName: string;
  private readonly _rushSession: RushSession;
  private readonly _operationStreamEnabled: boolean;

  public constructor(rushSession: RushSession, commandName: string, operations: Iterable<Operation>) {
    this._rushSession = rushSession;
    this._commandName = commandName;
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
          cycles: new Map(),
          latestCompletedIterationId: undefined
        };
        operationsByReporterId.set(operationId, reporterOperation);
      }
      reporterOperation.legacyOperationIds.add(operation.name);
      this._operationsByLegacyId.set(operation.name, reporterOperation);
    }

    this._operationStreamEnabled = Array.from(this._operationsByLegacyId.values()).some(
      ({ streamEmitter }) => !!streamEmitter
    );
    if (this._operationStreamEnabled) {
      this.onOperationChunk = (operationId, chunk, iterationId) =>
        this._onOperationChunk(operationId, chunk, iterationId);
      this.onOperationStreamClosed = (operationId, iterationId) =>
        this._onOperationStreamClosed(operationId, iterationId);
    } else {
      this.onOperationChunk = undefined;
      this.onOperationStreamClosed = undefined;
    }
    this.onOperationCompleted = this.isEnabled ? (result) => this._onOperationCompleted(result) : undefined;
  }

  public get isEnabled(): boolean {
    return this._operationsByLegacyId.size > 0;
  }

  public get operationStreamEnabled(): boolean {
    return this._operationStreamEnabled;
  }

  public onOperationRegistered(operationId: string, silent: boolean, iterationId: number): void {
    const operation: IReporterOperation | undefined = this._operationsByLegacyId.get(operationId);
    if (!operation) {
      return;
    }

    const cycle: IReporterOperationCycle = this._getCycle(operation, iterationId);

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
        cycle.silent,
        iterationId
      );
    } else if (!cycle.silent) {
      operation.emitter.emitOperationRegistered({
        iterationId,
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
    if (
      operation.latestCompletedIterationId !== undefined &&
      result.iterationId <= operation.latestCompletedIterationId
    ) {
      return;
    }

    const cycle: IReporterOperationCycle = this._getCycle(operation, result.iterationId);
    if (
      result.status === OperationStatus.Ready &&
      cycle.registeredOperationIds.size === operation.legacyOperationIds.size
    ) {
      return;
    }

    cycle.statuses.set(result.operation.name, result.status);
    const diagnosticKey: string = `${result.iterationId}:${operation.operationId}`;
    if (result.status === OperationStatus.Failure && !this._diagnosedOperations.has(diagnosticKey)) {
      this._diagnosedOperations.add(diagnosticKey);
      const diagnostic: IRushDiagnostic = createRushDiagnostic('RUSH_OPERATION_FAILED', {
        parameters: {
          projectName: { value: operation.projectName, privacy: 'public' }
        }
      });
      operation.emitter.emitDiagnostic({ ...diagnostic, iterationId: result.iterationId });
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
        aggregatePreviousStatus,
        result.iterationId
      );
    } else if (!cycle.silent) {
      operation.emitter.emitOperationStatusChanged({
        iterationId: result.iterationId,
        operationId: operation.operationId,
        status,
        ...(durationMs === undefined ? {} : { durationMs })
      });
    }
  }

  public onActivity(text: string, options: IOperationActivityOptions = {}): void {
    if (!this.operationStreamEnabled) {
      return;
    }
    const operation: IReporterOperation | undefined = options.operationId
      ? this._operationsByLegacyId.get(options.operationId)
      : undefined;
    this._rushSession
      .getReporter({
        commandName: this._commandName,
        operationId: operation?.operationId,
        projectName: operation?.projectName,
        phaseName: operation?.phaseName
      })
      ?.emitMessage({
        severity: options.stderr ? 'warning' : 'info',
        text,
        privacy: 'local-sensitive'
      });
  }

  private _onOperationChunk(operationId: string, chunk: ITerminalChunk, iterationId: number): void {
    const operation: IReporterOperation | undefined = this._operationsByLegacyId.get(operationId);
    if (!operation?.streamEmitter) {
      return;
    }

    if (chunk.kind === TerminalChunkKind.Stdout) {
      operation.streamEmitter.writeOutput(operation.operationId, 'stdout', chunk.text, iterationId);
    } else if (chunk.kind === TerminalChunkKind.Stderr) {
      operation.streamEmitter.writeOutput(operation.operationId, 'stderr', chunk.text, iterationId);
    }
  }

  private _onOperationStreamClosed(operationId: string, iterationId: number): void {
    const operation: IReporterOperation | undefined = this._operationsByLegacyId.get(operationId);
    if (!operation?.streamEmitter) {
      return;
    }
    const cycle: IReporterOperationCycle = this._getCycle(operation, iterationId);
    if (cycle.streamClosed) {
      return;
    }
    cycle.closedOperationIds.add(operationId);
    if (cycle.closedOperationIds.size === operation.legacyOperationIds.size) {
      cycle.streamClosed = true;
      operation.streamEmitter.closeOperationStream(operation.operationId, iterationId);
    }
  }

  private _onOperationCompleted(result: IOperationExecutionResult): void {
    const operation: IReporterOperation | undefined = this._operationsByLegacyId.get(result.operation.name);
    if (!operation) {
      return;
    }

    const cycle: IReporterOperationCycle = this._getCycle(operation, result.iterationId);
    cycle.completedResults.set(result.operation.name, result);
    if (cycle.completedResults.size !== operation.legacyOperationIds.size) {
      return;
    }
    const status: ReporterOperationStatus = _getAggregateTerminalStatus(
      Array.from(cycle.completedResults.values(), ({ status: resultStatus }) => resultStatus)
    );
    const durationMs: number | undefined = _getAggregateDurationMs(cycle.completedResults);
    operation.streamEmitter?.completeOperation(operation.operationId, status, durationMs, result.iterationId);
    operation.latestCompletedIterationId = Math.max(
      operation.latestCompletedIterationId ?? result.iterationId,
      result.iterationId
    );
    operation.cycles.delete(result.iterationId);
    this._diagnosedOperations.delete(`${result.iterationId}:${operation.operationId}`);
  }

  private _getCycle(operation: IReporterOperation, iterationId: number): IReporterOperationCycle {
    let cycle: IReporterOperationCycle | undefined = operation.cycles.get(iterationId);
    if (!cycle) {
      cycle = {
        registeredOperationIds: new Set(),
        statuses: new Map(),
        closedOperationIds: new Set(),
        completedResults: new Map(),
        lastEmittedStatus: undefined,
        silent: true,
        streamClosed: false
      };
      operation.cycles.set(iterationId, cycle);
    }
    return cycle;
  }
}

class CompositeOperationGraphEventSink implements IOperationGraphEventSink {
  public readonly onOperationChunk:
    | ((operationId: string, chunk: ITerminalChunk, iterationId: number) => void)
    | undefined;
  public readonly onOperationStreamClosed: ((operationId: string, iterationId: number) => void) | undefined;
  public readonly onOperationCompleted: ((result: IOperationExecutionResult) => void) | undefined;

  private readonly _first: IOperationGraphEventSink;
  private readonly _second: IOperationGraphEventSink;

  public constructor(first: IOperationGraphEventSink, second: IOperationGraphEventSink) {
    this._first = first;
    this._second = second;
    this.onOperationChunk =
      first.onOperationChunk || second.onOperationChunk
        ? (operationId, chunk, iterationId) => {
            first.onOperationChunk?.(operationId, chunk, iterationId);
            second.onOperationChunk?.(operationId, chunk, iterationId);
          }
        : undefined;
    this.onOperationStreamClosed =
      first.onOperationStreamClosed || second.onOperationStreamClosed
        ? (operationId, iterationId) => {
            first.onOperationStreamClosed?.(operationId, iterationId);
            second.onOperationStreamClosed?.(operationId, iterationId);
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

  public onOperationRegistered(operationId: string, silent: boolean, iterationId: number): void {
    this._first.onOperationRegistered?.(operationId, silent, iterationId);
    this._second.onOperationRegistered?.(operationId, silent, iterationId);
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
  commandName: string,
  isWatch: boolean = false
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

  if (isWatch && reporterSink.operationStreamEnabled) {
    const lifecycleEmitter: LifecycleEmitter | undefined = _getRushSessionLifecycleEmitter(rushSession, {
      commandName
    });
    lifecycleEmitter &&
      graph.hooks.afterExecuteIterationAsync.tapPromise(
        'RushReporterWatchCycle',
        async (status: OperationStatus, records: ReadonlyMap<Operation, IOperationExecutionResult>) => {
          const iterationId: number | undefined = records.values().next().value?.iterationId;
          lifecycleEmitter.emitWatchCycleCompleted({
            succeeded: SUCCESS_STATUSES.has(status),
            ...(iterationId === undefined ? {} : { iterationId })
          });
          return status;
        }
      );
  }
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
