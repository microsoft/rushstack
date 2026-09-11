// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  createRushDiagnostic,
  type IRushDiagnostic,
  type LifecycleEmitter,
  type OperationStatus as ReporterOperationStatus
} from '@rushstack/rush-reporter';
import type { ITerminalChunk } from '@rushstack/terminal';

import type { RushSession } from '../../pluginFramework/RushSession';
import {
  _correlateRushSessionError,
  _getRushSessionLifecycleEmitter
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
  registrationCycle: IReporterOperationCycle | undefined;
}

interface IReporterOperationCycle {
  readonly registeredOperationIds: Set<string>;
  readonly statuses: Map<string, OperationStatus>;
  diagnosed: boolean;
  lastEmittedStatus: ReporterOperationStatus | undefined;
  silent: boolean;
}

class ReporterOperationEventSink implements IOperationGraphEventSink {
  readonly #operationsByLegacyId: Map<string, IReporterOperation> = new Map();
  readonly #cyclesByResult: WeakMap<IOperationExecutionResult, IReporterOperationCycle> = new WeakMap();
  readonly #rushSession: RushSession;

  public constructor(rushSession: RushSession, commandName: string, operations: Iterable<Operation>) {
    this.#rushSession = rushSession;
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
        reporterOperation = {
          emitter,
          legacyOperationIds: new Set(),
          operationId,
          phaseName,
          projectName,
          registrationCycle: undefined
        };
        operationsByReporterId.set(operationId, reporterOperation);
      }
      reporterOperation.legacyOperationIds.add(operation.name);
      this.#operationsByLegacyId.set(operation.name, reporterOperation);
    }
  }

  public get isEnabled(): boolean {
    return this.#operationsByLegacyId.size > 0;
  }

  public onOperationRegistered(
    operationId: string,
    silent: boolean,
    result?: IOperationExecutionResult
  ): void {
    const operation: IReporterOperation | undefined = this.#operationsByLegacyId.get(operationId);
    if (!operation || !result) {
      return;
    }

    let cycle: IReporterOperationCycle | undefined = operation.registrationCycle;
    if (!cycle || cycle.registeredOperationIds.size === operation.legacyOperationIds.size) {
      cycle = {
        registeredOperationIds: new Set(),
        statuses: new Map(),
        diagnosed: false,
        lastEmittedStatus: undefined,
        silent: true
      };
      operation.registrationCycle = cycle;
    }

    this.#cyclesByResult.set(result, cycle);
    cycle.registeredOperationIds.add(operationId);
    cycle.silent &&= silent;
    if (cycle.registeredOperationIds.size !== operation.legacyOperationIds.size || cycle.silent) {
      return;
    }

    operation.emitter.emitOperationRegistered({
      operationId: operation.operationId,
      projectName: operation.projectName,
      phaseName: operation.phaseName
    });
  }

  public onOperationStatusChanged(result: IOperationExecutionResult): void {
    const operation: IReporterOperation | undefined = this.#operationsByLegacyId.get(result.operation.name);
    if (!operation) {
      return;
    }
    const cycle: IReporterOperationCycle | undefined = this.#cyclesByResult.get(result);
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
        _correlateRushSessionError(this.#rushSession, result.error, diagnostic.diagnosticId);
      }
    }

    const status: ReporterOperationStatus | undefined = _getAggregateStatus(operation, cycle);
    if (status === undefined || status === cycle.lastEmittedStatus) {
      return;
    }
    cycle.lastEmittedStatus = status;
    if (!cycle.silent) {
      const durationMs: number | undefined =
        operation.legacyOperationIds.size === 1 && result.stopwatch.startTime !== undefined
          ? result.stopwatch.duration * 1000
          : undefined;
      operation.emitter.emitOperationStatusChanged({
        operationId: operation.operationId,
        status,
        ...(durationMs === undefined ? {} : { durationMs })
      });
    }
  }
}

class CompositeOperationGraphEventSink implements IOperationGraphEventSink {
  public readonly onOperationChunk: ((operationId: string, chunk: ITerminalChunk) => void) | undefined;
  public readonly onOperationStreamClosed: ((operationId: string) => void) | undefined;

  readonly #first: IOperationGraphEventSink;
  readonly #second: IOperationGraphEventSink;

  public constructor(first: IOperationGraphEventSink, second: IOperationGraphEventSink) {
    this.#first = first;
    this.#second = second;
    this.onOperationChunk =
      first.onOperationChunk || second.onOperationChunk
        ? (operationId, chunk) => {
            first.onOperationChunk?.(operationId, chunk);
            second.onOperationChunk?.(operationId, chunk);
          }
        : undefined;
    this.onOperationStreamClosed =
      first.onOperationStreamClosed || second.onOperationStreamClosed
        ? (operationId) => {
            first.onOperationStreamClosed?.(operationId);
            second.onOperationStreamClosed?.(operationId);
          }
        : undefined;
  }

  public onOperationRegistered(
    operationId: string,
    silent: boolean,
    result?: IOperationExecutionResult
  ): void {
    this.#first.onOperationRegistered?.(operationId, silent, result);
    this.#second.onOperationRegistered?.(operationId, silent, result);
  }

  public onOperationStatusChanged(result: IOperationExecutionResult, previousStatus: OperationStatus): void {
    this.#first.onOperationStatusChanged?.(result, previousStatus);
    this.#second.onOperationStatusChanged?.(result, previousStatus);
  }

  public onOperationHeader(operationId: string, completedOperations: number, totalOperations: number): void {
    this.#first.onOperationHeader?.(operationId, completedOperations, totalOperations);
    this.#second.onOperationHeader?.(operationId, completedOperations, totalOperations);
  }

  public onActivity(text: string, options?: IOperationActivityOptions): void {
    this.#first.onActivity?.(text, options);
    this.#second.onActivity?.(text, options);
  }
}

/**
 * Adds status-only reporter emission without changing the graph's visible output or raw chunk routing.
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
