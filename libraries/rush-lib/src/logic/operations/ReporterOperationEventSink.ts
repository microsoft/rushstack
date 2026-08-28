// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  createRushDiagnostic,
  ProblemMatcherRegistry,
  ProblemMatcherRunner,
  type IRushDiagnostic,
  type IProblemMatch,
  type IProblemMatcher,
  type LifecycleEmitter,
  type OperationStreamEmitter,
  type OperationStatus as ReporterOperationStatus
} from '@rushstack/rush-reporter';
import { FileError } from '@rushstack/node-core-library';
import { TerminalChunkKind, type ITerminalChunk } from '@rushstack/terminal';

import {
  _correlateRushSessionError,
  _getRushSessionChildProcessReporter,
  _getRushSessionLifecycleEmitter,
  _getRushSessionOperationStreamEmitter,
  type IRushSessionChildProcessReporter,
  type RushSession
} from '../../pluginFramework/RushSession';
import { IS_WINDOWS } from '../../utilities/executionUtilities';
import type { IOperationExecutionResult } from './IOperationExecutionResult';
import type {
  IOperationChildProcessReporter,
  IOperationGraphEventSink,
  IOperationActivityOptions
} from './OperationEventSink';
import type { Operation } from './Operation';
import { OperationStatus, SUCCESS_STATUSES } from './OperationStatus';
import type { OperationGraph } from './OperationGraph';
import { HeftChildProcessReporter } from './HeftChildProcessReporter';

interface IReporterOperation {
  readonly emitter: LifecycleEmitter;
  readonly legacyOperationIds: Set<string>;
  readonly operationId: string;
  readonly phaseName: string;
  readonly projectName: string;
  readonly problemMatcherRunnersByLegacyId: Map<string, ProblemMatcherRunner | undefined>;
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

function createFileErrorMatcher(
  name: string,
  format: 'Unix' | 'VisualStudio',
  severity: 'error' | 'warning'
): IProblemMatcher {
  const definition: { readonly regexp: string } = FileError.getProblemMatcher({ format });
  const severityWord: string = severity === 'error' ? 'Error' : 'Warning';
  return {
    name,
    tool: 'heft',
    severity,
    enabledByDefault: true,
    pattern: new RegExp(definition.regexp.replace('(Error|Warning)', `(${severityWord})`)),
    extract(match: RegExpMatchArray): IProblemMatch {
      return {
        file: match[2],
        line: Number(match[3]),
        column: Number(match[4]),
        code: match[5],
        message: match[6]
      };
    }
  };
}

function createProblemMatcherRunner(): ProblemMatcherRunner {
  const registry: ProblemMatcherRegistry = new ProblemMatcherRegistry();
  registry.register(createFileErrorMatcher('heft-file-error-unix', 'Unix', 'error'));
  registry.register(createFileErrorMatcher('heft-file-warning-unix', 'Unix', 'warning'));
  registry.register(createFileErrorMatcher('heft-file-error-visualstudio', 'VisualStudio', 'error'));
  registry.register(createFileErrorMatcher('heft-file-warning-visualstudio', 'VisualStudio', 'warning'));
  return new ProblemMatcherRunner(registry.getMatchers('heft'));
}

class ReporterOperationEventSink implements IOperationGraphEventSink {
  public readonly onOperationChunk:
    | ((
        operationId: string,
        chunk: ITerminalChunk,
        result?: IOperationExecutionResult,
        iterationId?: number
      ) => void)
    | undefined;
  public readonly onOperationStreamClosed:
    | ((operationId: string, result?: IOperationExecutionResult, iterationId?: number) => void)
    | undefined;
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
          problemMatcherRunnersByLegacyId: new Map(),
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
      this.onOperationChunk = (operationId, chunk, result, iterationId) =>
        this._onOperationChunk(operationId, chunk, result, iterationId);
      this.onOperationStreamClosed = (operationId, result, iterationId) =>
        this._onOperationStreamClosed(operationId, result, iterationId);
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

  public onOperationRegistered(
    operationId: string,
    silent: boolean,
    result?: IOperationExecutionResult,
    iterationId?: number
  ): void {
    const operation: IReporterOperation | undefined = this._operationsByLegacyId.get(operationId);
    const resolvedIterationId: number | undefined = iterationId ?? result?.iterationId;
    if (!operation || resolvedIterationId === undefined) {
      return;
    }
    const cycle: IReporterOperationCycle = this._getCycle(operation, resolvedIterationId);
    const matcherKey: string = `${resolvedIterationId}:${operationId}`;
    operation.problemMatcherRunnersByLegacyId.set(
      matcherKey,
      operation.streamEmitter ? createProblemMatcherRunner() : undefined
    );

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
        resolvedIterationId
      );
    } else if (!cycle.silent) {
      operation.emitter.emitOperationRegistered({
        iterationId: resolvedIterationId,
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

  public createChildProcessReporter(
    operationId: string,
    iterationId: number
  ): IOperationChildProcessReporter | undefined {
    const operation: IReporterOperation | undefined = this._operationsByLegacyId.get(operationId);
    const childProcessReporter: IRushSessionChildProcessReporter | undefined =
      _getRushSessionChildProcessReporter(this._rushSession);
    // Windows lifecycle commands run through a shell that does not preserve Node's fd mapping.
    if (IS_WINDOWS || !operation?.streamEmitter || !childProcessReporter) {
      return undefined;
    }

    const matcherKey: string = `${iterationId}:${operationId}`;
    operation.problemMatcherRunnersByLegacyId.set(matcherKey, createProblemMatcherRunner());
    return new HeftChildProcessReporter({
      parentSessionId: childProcessReporter.parentSessionId,
      parentRequestId: childProcessReporter.parentRequestId,
      parentOperationId: operation.operationId,
      iterationId,
      context: childProcessReporter.context,
      ingestForeignEnvelope: childProcessReporter.ingestForeignEnvelope,
      onDiagnostic: (diagnostic: IRushDiagnostic) =>
        operation.emitter.emitDiagnostic({ ...diagnostic, iterationId }),
      onStructuredNegotiated: () => {
        operation.problemMatcherRunnersByLegacyId.set(matcherKey, undefined);
      }
    });
  }

  private _onOperationChunk(
    operationId: string,
    chunk: ITerminalChunk,
    result?: IOperationExecutionResult,
    iterationId?: number
  ): void {
    const operation: IReporterOperation | undefined = this._operationsByLegacyId.get(operationId);
    const resolvedIterationId: number | undefined = iterationId ?? result?.iterationId;
    if (!operation?.streamEmitter || resolvedIterationId === undefined) {
      return;
    }

    if (chunk.kind === TerminalChunkKind.Stdout) {
      operation.streamEmitter.writeOutput(operation.operationId, 'stdout', chunk.text, resolvedIterationId);
    } else if (chunk.kind === TerminalChunkKind.Stderr) {
      operation.streamEmitter.writeOutput(operation.operationId, 'stderr', chunk.text, resolvedIterationId);
    }

    const stream: 'stdout' | 'stderr' = chunk.kind === TerminalChunkKind.Stderr ? 'stderr' : 'stdout';
    const matcherKey: string = `${resolvedIterationId}:${operationId}`;
    for (const diagnostic of operation.problemMatcherRunnersByLegacyId
      .get(matcherKey)
      ?.writeOutput(chunk.text, operation.operationId, stream) ?? []) {
      operation.emitter.emitDiagnostic({ ...diagnostic, iterationId: resolvedIterationId });
    }
  }

  private _onOperationStreamClosed(
    operationId: string,
    result?: IOperationExecutionResult,
    iterationId?: number
  ): void {
    const operation: IReporterOperation | undefined = this._operationsByLegacyId.get(operationId);
    const resolvedIterationId: number | undefined = iterationId ?? result?.iterationId;
    if (!operation?.streamEmitter || resolvedIterationId === undefined) {
      return;
    }
    const cycle: IReporterOperationCycle = this._getCycle(operation, resolvedIterationId);
    if (cycle.streamClosed) {
      return;
    }
    const matcherKey: string = `${iterationId}:${operationId}`;
    for (const diagnostic of operation.problemMatcherRunnersByLegacyId.get(matcherKey)?.flush() ?? []) {
      operation.emitter.emitDiagnostic({ ...diagnostic, iterationId });
    }
    operation.problemMatcherRunnersByLegacyId.delete(matcherKey);
    cycle.closedOperationIds.add(operationId);
    if (cycle.closedOperationIds.size === operation.legacyOperationIds.size) {
      cycle.streamClosed = true;
      operation.streamEmitter.closeOperationStream(operation.operationId, resolvedIterationId);
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
    | ((
        operationId: string,
        chunk: ITerminalChunk,
        result?: IOperationExecutionResult,
        iterationId?: number
      ) => void)
    | undefined;
  public readonly onOperationStreamClosed:
    | ((operationId: string, result?: IOperationExecutionResult, iterationId?: number) => void)
    | undefined;
  public readonly onOperationCompleted: ((result: IOperationExecutionResult) => void) | undefined;

  private readonly _first: IOperationGraphEventSink;
  private readonly _second: IOperationGraphEventSink;

  public constructor(first: IOperationGraphEventSink, second: IOperationGraphEventSink) {
    this._first = first;
    this._second = second;
    this.onOperationChunk =
      first.onOperationChunk || second.onOperationChunk
        ? (operationId, chunk, result, iterationId) => {
            first.onOperationChunk?.(operationId, chunk, result, iterationId);
            second.onOperationChunk?.(operationId, chunk, result, iterationId);
          }
        : undefined;
    this.onOperationStreamClosed =
      first.onOperationStreamClosed || second.onOperationStreamClosed
        ? (operationId, result, iterationId) => {
            first.onOperationStreamClosed?.(operationId, result, iterationId);
            second.onOperationStreamClosed?.(operationId, result, iterationId);
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
    result?: IOperationExecutionResult,
    iterationId?: number
  ): void {
    this._first.onOperationRegistered?.(operationId, silent, result, iterationId);
    this._second.onOperationRegistered?.(operationId, silent, result, iterationId);
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

  public createChildProcessReporter(
    operationId: string,
    iterationId: number
  ): IOperationChildProcessReporter | undefined {
    return (
      this._second.createChildProcessReporter?.(operationId, iterationId) ??
      this._first.createChildProcessReporter?.(operationId, iterationId)
    );
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
