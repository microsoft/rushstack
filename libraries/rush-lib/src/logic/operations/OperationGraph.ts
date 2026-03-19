// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  type TerminalWritable,
  TextRewriterTransform,
  Colorize,
  ConsoleTerminalProvider,
  TerminalChunkKind,
  SplitterTransform
} from '@rushstack/terminal';
import { StreamCollator, CollatedTerminal, type CollatedWriter } from '@rushstack/stream-collator';
import { NewlineKind, Async, InternalError, AlreadyReportedError } from '@rushstack/node-core-library';

import { AsyncOperationQueue, type IOperationSortFunction } from './AsyncOperationQueue';
import type { Operation } from './Operation';
import { OperationStatus, TERMINAL_STATUSES } from './OperationStatus';
import {
  type IOperationExecutionContext,
  type IOperationExecutionRecordContext,
  OperationExecutionRecord
} from './OperationExecutionRecord';
import type { IExecutionResult } from './IOperationExecutionResult';
import type { IInputsSnapshot } from '../incremental/InputsSnapshot';
import type { IEnvironment } from '../../utilities/Utilities';
import type { IStopwatchResult } from '../../utilities/Stopwatch';
import {
  type IOperationGraph,
  type IOperationGraphIterationOptions,
  OperationGraphHooks
} from '../../pluginFramework/PhasedCommandHooks';
import { type Parallelism, coerceParallelism, getNumberOfCores } from './ParseParallelism';
import { measureAsyncFn, measureFn } from '../../utilities/performance';
import type { ITelemetryData, ITelemetryOperationResult } from '../Telemetry';

export interface IOperationGraphTelemetry {
  initialExtraData: Record<string, unknown>;
  changedProjectsOnlyKey: string | undefined;
  nameForLog: string;
  log: (telemetry: ITelemetryData) => void;
}

export interface IOperationGraphOptions {
  quietMode: boolean;
  debugMode: boolean;
  parallelism: Parallelism;
  allowOversubscription: boolean;
  destinations: Iterable<TerminalWritable>;
  /** Optional maximum allowed parallelism. Defaults to `getNumberOfCores()`. */
  maxParallelism?: number;

  /**
   * Controller used to signal abortion of the entire execution session (e.g. terminating watch mode).
   * Consumers (e.g. ProjectWatcher) can subscribe to this to perform cleanup.
   */
  abortController: AbortController;

  isWatch?: boolean;
  pauseNextIteration?: boolean;

  telemetry?: IOperationGraphTelemetry;
  getInputsSnapshotAsync?: () => Promise<IInputsSnapshot | undefined>;
}

/**
 * Internal context state used during an execution iteration.
 */
interface IStatefulExecutionContext {
  hasAnyFailures: boolean;
  hasAnyNonAllowedWarnings: boolean;
  hasAnyAborted: boolean;

  executionQueue: AsyncOperationQueue;
  resultByOperation: Map<Operation, OperationExecutionRecord>;

  get completedOperations(): number;
  set completedOperations(value: number);
}

/**
 * Context for a single execution iteration.
 */
interface IExecutionIterationContext extends IOperationExecutionRecordContext {
  abortController: AbortController;
  terminal: CollatedTerminal;

  records: Map<Operation, OperationExecutionRecord>;
  promise: Promise<OperationStatus> | undefined;

  startTime?: number;

  completedOperations: number;
  totalOperations: number;
}

/**
 * Telemetry data for a phased execution
 */
interface IPhasedExecutionTelemetry {
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

const PERF_PREFIX: 'rush:executionManager' = 'rush:executionManager';

/**
 * Format "======" lines for a shell window with classic 80 columns
 */
const ASCII_HEADER_WIDTH: number = 79;

const prioritySort: IOperationSortFunction = (
  a: OperationExecutionRecord,
  b: OperationExecutionRecord
): number => {
  return a.criticalPathLength! - b.criticalPathLength!;
};

/**
 * Sorts operations lexicographically by their name.
 * @param a - The first operation to compare
 * @param b - The second operation to compare
 * @returns A comparison result: -1 if a < b, 0 if a === b, 1 if a > b
 */
function sortOperationsByName(a: Operation, b: Operation): number {
  const aName: string = a.name;
  const bName: string = b.name;
  return aName === bName ? 0 : aName < bName ? -1 : 1;
}

/**
 * A class which manages the execution of a set of tasks with interdependencies.
 */
export class OperationGraph implements IOperationGraph {
  public readonly hooks: OperationGraphHooks = new OperationGraphHooks();
  public readonly operations: Set<Operation>;
  public readonly abortController: AbortController;

  public resultByOperation: Map<Operation, OperationExecutionRecord>;

  // Mutable properties extracted from options
  private _parallelism: number;
  private _maxParallelism: number;
  private _debugMode: boolean;
  private _quietMode: boolean;
  private _allowOversubscription: boolean;
  private _pauseNextIteration: boolean;

  // Immutable properties from options
  private readonly _isWatch: boolean;
  private readonly _telemetry: IOperationGraphTelemetry | undefined;
  private readonly _getInputsSnapshotAsync: (() => Promise<IInputsSnapshot | undefined>) | undefined;

  /**
   * Records invalidated during the current iteration that could not be marked `Ready` immediately
   * because their record object is shared between `resultByOperation` and the active iteration's
   * `records` map (mutating it mid-iteration would corrupt the summarizer's view of results).
   * Maps each record to the invalidation reason; applied once the iteration completes.
   */
  private readonly _deferredInvalidations: Map<OperationExecutionRecord, string | undefined> = new Map();

  private _currentIteration: IExecutionIterationContext | undefined = undefined;
  private _scheduledIteration: IExecutionIterationContext | undefined = undefined;

  private _terminalSplitter: SplitterTransform;
  private _idleTimeout: NodeJS.Timeout | undefined = undefined;
  /** Tracks if a graph state change notification has been scheduled for next tick. */
  private _graphStateChangeScheduled: boolean = false;
  private _status: OperationStatus = OperationStatus.Ready;

  public constructor(operations: Set<Operation>, options: IOperationGraphOptions) {
    const {
      debugMode,
      quietMode,
      parallelism,
      allowOversubscription,
      destinations,
      maxParallelism = getNumberOfCores(),
      abortController,
      isWatch = false,
      pauseNextIteration = false,
      telemetry,
      getInputsSnapshotAsync
    } = options;

    this.operations = operations;

    this._maxParallelism = maxParallelism;
    this._parallelism = coerceParallelism(parallelism, maxParallelism, 1);
    this._debugMode = debugMode;
    this._quietMode = quietMode;
    this._allowOversubscription = allowOversubscription;
    this._pauseNextIteration = pauseNextIteration;
    this._isWatch = isWatch;
    this._telemetry = telemetry;
    this._getInputsSnapshotAsync = getInputsSnapshotAsync;

    this._terminalSplitter = new SplitterTransform({ destinations });
    this.resultByOperation = new Map();
    this.abortController = abortController;

    this.abortController.signal.addEventListener(
      'abort',
      () => {
        if (this._idleTimeout) {
          clearTimeout(this._idleTimeout);
        }
        void this.closeRunnersAsync();
      },
      { once: true }
    );
  }

  /**
   * {@inheritDoc IOperationGraph.setEnabledStates}
   */
  public setEnabledStates(
    operations: Iterable<Operation>,
    targetState: Operation['enabled'],
    mode: 'safe' | 'unsafe'
  ): boolean {
    const changedOperations: Set<Operation> = new Set();
    const requested: Set<Operation> = new Set(operations);
    if (requested.size === 0) {
      return false;
    }

    if (mode === 'unsafe') {
      for (const op of requested) {
        if (op.enabled !== targetState) {
          op.enabled = targetState;
          changedOperations.add(op);
        }
      }
    } else {
      // Safe mode logic
      if (targetState === true) {
        // Expand dependencies of all provided operations (closure)
        for (const op of requested) {
          for (const dep of op.dependencies) {
            requested.add(dep);
          }
        }
        for (const op of requested) {
          if (op.enabled !== true) {
            op.enabled = true;
            changedOperations.add(op);
          }
        }
      } else if (targetState === false) {
        const operationsToDisable: Set<Operation> = new Set(requested);
        for (const op of operationsToDisable) {
          for (const dep of op.dependencies) {
            operationsToDisable.add(dep);
          }
        }

        const enabledOperations: Set<Operation> = new Set();
        for (const op of this.operations) {
          if (op.enabled !== false && !operationsToDisable.has(op)) {
            enabledOperations.add(op);
          }
        }
        for (const op of enabledOperations) {
          for (const dep of op.dependencies) {
            enabledOperations.add(dep);
          }
        }
        for (const op of enabledOperations) {
          operationsToDisable.delete(op);
        }
        for (const op of operationsToDisable) {
          if (op.enabled !== false) {
            op.enabled = false;
            changedOperations.add(op);
          }
        }
      } else if (targetState === 'ignore-dependency-changes') {
        const toEnable: Set<Operation> = new Set(requested);
        for (const op of toEnable) {
          for (const dep of op.dependencies) {
            toEnable.add(dep);
          }
        }
        for (const op of toEnable) {
          const opTargetState: Operation['enabled'] = op.settings?.ignoreChangedProjectsOnlyFlag
            ? true
            : targetState;
          if (op.enabled !== opTargetState) {
            op.enabled = opTargetState;
            changedOperations.add(op);
          }
        }
      }
    }

    if (changedOperations.size > 0) {
      // Notify via dedicated hook (do not schedule generic graph state change)
      this.hooks.onEnableStatesChanged.call(changedOperations);
    }
    return changedOperations.size > 0;
  }

  public get parallelism(): number {
    return this._parallelism;
  }
  public set parallelism(value: Parallelism) {
    const coerced: number = coerceParallelism(value, this._maxParallelism, 1);
    if (coerced !== this._parallelism) {
      this._parallelism = coerced;
      this._scheduleManagerStateChanged();
    }
  }

  public get debugMode(): boolean {
    return this._debugMode;
  }
  public set debugMode(value: boolean) {
    if (value !== this._debugMode) {
      this._debugMode = value;
      this._scheduleManagerStateChanged();
    }
  }

  public get quietMode(): boolean {
    return this._quietMode;
  }
  public set quietMode(value: boolean) {
    if (value !== this._quietMode) {
      this._quietMode = value;
      this._scheduleManagerStateChanged();
    }
  }

  public get allowOversubscription(): boolean {
    return this._allowOversubscription;
  }
  public set allowOversubscription(value: boolean) {
    if (value !== this._allowOversubscription) {
      this._allowOversubscription = value;
      this._scheduleManagerStateChanged();
    }
  }

  public get pauseNextIteration(): boolean {
    return this._pauseNextIteration;
  }
  public set pauseNextIteration(value: boolean) {
    if (value !== this._pauseNextIteration) {
      this._pauseNextIteration = value;
      this._scheduleManagerStateChanged();

      this._setIdleTimeout();
    }
  }

  public get hasScheduledIteration(): boolean {
    return !!this._scheduledIteration;
  }

  public get status(): OperationStatus {
    return this._status;
  }

  public get terminalDestinations(): ReadonlySet<TerminalWritable> {
    return this._terminalSplitter.destinations;
  }

  private _setStatus(newStatus: OperationStatus): void {
    if (this._status !== newStatus) {
      this._status = newStatus;
      this._scheduleManagerStateChanged();
    }
  }

  private _setScheduledIteration(iteration: IExecutionIterationContext | undefined): void {
    const hadScheduled: boolean = !!this._scheduledIteration;
    this._scheduledIteration = iteration;
    if (hadScheduled !== !!this._scheduledIteration) {
      this._scheduleManagerStateChanged();
    }
  }

  public async closeRunnersAsync(operations?: Operation[]): Promise<void> {
    const promises: Promise<void>[] = [];
    const recordMap: ReadonlyMap<Operation, OperationExecutionRecord> =
      this._currentIteration?.records ?? this.resultByOperation;
    const closedRecords: Set<OperationExecutionRecord> = new Set();
    for (const operation of operations ?? this.operations) {
      if (operation.runner?.closeAsync) {
        const record: OperationExecutionRecord | undefined = recordMap.get(operation);
        promises.push(
          operation.runner.closeAsync().then(() => {
            if (record) {
              // Collect for batched notification
              closedRecords.add(record);
            }
          })
        );
      }
    }
    await Promise.all(promises);
    if (this.abortController.signal.aborted) {
      return;
    }
    if (closedRecords.size) {
      this.hooks.onExecutionStatesUpdated.call(closedRecords);
    }
  }

  public invalidateOperations(operations?: Iterable<Operation>, reason?: string): void {
    const invalidated: Set<Operation> = new Set();
    const currentIteration: IExecutionIterationContext | undefined = this._currentIteration;
    const currentIterationRecords: Map<Operation, OperationExecutionRecord> | undefined =
      currentIteration?.records;
    for (const operation of operations ?? this.operations) {
      const existing: OperationExecutionRecord | undefined = this.resultByOperation.get(operation);
      if (existing && TERMINAL_STATUSES.has(existing.status)) {
        if (currentIterationRecords?.get(operation) === existing) {
          // The record has already executed in the current iteration and was written to
          // resultByOperation. Mutating its status now would corrupt the iteration's result
          // snapshot (used by the summarizer). Defer the reset until the iteration ends, and
          // abort so the operation can be re-run in the next iteration.
          this._deferredInvalidations.set(existing, reason);
          currentIteration?.abortController.abort();
        } else {
          existing.status = OperationStatus.Ready;
          invalidated.add(operation);
        }
      }
    }
    if (invalidated.size > 0) {
      this.hooks.onInvalidateOperations.call(invalidated, reason);
    }
    if (!currentIteration) {
      this._setStatus(OperationStatus.Ready);
    }
  }

  /**
   * Shorthand for scheduling an iteration then executing it.
   * Call `abortCurrentIterationAsync()` to cancel the execution of any operations that have not yet begun execution.
   * @param iterationOptions - Options for this execution iteration.
   * @returns A promise which is resolved when all operations have been processed to a final state.
   */
  public async executeAsync(iterationOptions: IOperationGraphIterationOptions): Promise<IExecutionResult> {
    await this.abortCurrentIterationAsync();
    const scheduled: IExecutionIterationContext | undefined =
      await this._scheduleIterationAsync(iterationOptions);
    if (!scheduled) {
      return {
        operationResults: this.resultByOperation,
        status: OperationStatus.NoOp
      };
    }
    await this.executeScheduledIterationAsync();
    return {
      operationResults: scheduled.records,
      status: this.status
    };
  }

  /**
   * Queues a new execution iteration.
   * @param iterationOptions - Options for this execution iteration.
   * @returns A promise that resolves to true if the iteration was successfully queued, or false if it was not.
   */
  public async scheduleIterationAsync(iterationOptions: IOperationGraphIterationOptions): Promise<boolean> {
    return !!(await this._scheduleIterationAsync(iterationOptions));
  }

  /**
   * Executes all operations which have been registered, returning a promise which is resolved when all operations have been processed to a final state.
   * Aborts the current iteration first, if any.
   */
  public async executeScheduledIterationAsync(): Promise<boolean> {
    await this.abortCurrentIterationAsync();

    const iteration: IExecutionIterationContext | undefined = this._scheduledIteration;

    if (!iteration) {
      return false;
    }

    this._currentIteration = iteration;
    this._setScheduledIteration(undefined);

    iteration.promise = this._executeInnerAsync(this._currentIteration).finally(() => {
      this._currentIteration = undefined;

      // Apply any status resets that were deferred because the records were part of the
      // now-completed iteration and could not be mutated mid-iteration.
      // Coalesce by reason so consumers receive one notification per reason group.
      const byReason: Map<string | undefined, Operation[]> = new Map();
      for (const [record, deferredReason] of this._deferredInvalidations) {
        record.status = OperationStatus.Ready;
        let group: Operation[] | undefined = byReason.get(deferredReason);
        if (!group) {
          group = [];
          byReason.set(deferredReason, group);
        }
        group.push(record.operation);
      }
      this._deferredInvalidations.clear();
      for (const [deferredReason, ops] of byReason) {
        this.hooks.onInvalidateOperations.call(ops, deferredReason);
      }

      this._setIdleTimeout();
    });

    await iteration.promise;
    return true;
  }

  public async abortCurrentIterationAsync(): Promise<void> {
    const iteration: IExecutionIterationContext | undefined = this._currentIteration;
    if (iteration) {
      iteration.abortController.abort();
      try {
        await iteration.promise;
      } catch (e) {
        // Swallow errors from aborting
      }
    }

    this._setIdleTimeout();
  }

  public addTerminalDestination(destination: TerminalWritable): void {
    this._terminalSplitter.addDestination(destination);
  }

  public removeTerminalDestination(destination: TerminalWritable, close: boolean = true): boolean {
    return this._terminalSplitter.removeDestination(destination, close);
  }

  private _setIdleTimeout(): void {
    if (this._currentIteration || this.abortController.signal.aborted) {
      return;
    }

    if (!this._idleTimeout) {
      this._idleTimeout = setTimeout(this._onIdle, 0);
    }
  }

  private _onIdle = (): void => {
    this._idleTimeout = undefined;
    if (this._currentIteration || this.abortController.signal.aborted) {
      return;
    }

    if (!this.pauseNextIteration && this._scheduledIteration) {
      void this.executeScheduledIterationAsync();
    } else {
      this.hooks.onIdle.call();
    }
  };

  private async _scheduleIterationAsync(
    iterationOptions: IOperationGraphIterationOptions
  ): Promise<IExecutionIterationContext | undefined> {
    const { _getInputsSnapshotAsync: getInputsSnapshotAsync } = this;

    const { startTime = performance.now(), inputsSnapshot = await getInputsSnapshotAsync?.() } =
      iterationOptions;
    const iterationOptionsForCallbacks: IOperationGraphIterationOptions = { startTime, inputsSnapshot };

    const { hooks } = this;

    const abortController: AbortController = new AbortController();

    // TERMINAL PIPELINE:
    //
    // streamCollator --> colorsNewlinesTransform --> StdioWritable
    //
    const colorsNewlinesTransform: TextRewriterTransform = new TextRewriterTransform({
      destination: this._terminalSplitter,
      normalizeNewlines: NewlineKind.OsDefault,
      removeColors: !ConsoleTerminalProvider.supportsColor
    });
    const terminal: CollatedTerminal = new CollatedTerminal(colorsNewlinesTransform);
    const streamCollator: StreamCollator = new StreamCollator({
      destination: colorsNewlinesTransform,
      onWriterActive
    });

    // Sort the operations by name to ensure consistency and readability.
    const sortedOperations: Operation[] = Array.from(this.operations).sort(sortOperationsByName);

    const graph: OperationGraph = this;

    function createEnvironmentForOperation(record: OperationExecutionRecord): IEnvironment {
      return hooks.createEnvironmentForOperation.call({ ...process.env }, record);
    }

    // Convert the developer graph to the mutable execution graph
    const iterationContext: IExecutionIterationContext = {
      abortController,
      startTime,
      streamCollator,
      terminal,
      inputsSnapshot,
      maxParallelism: this._maxParallelism,
      onOperationStateChanged: undefined,
      createEnvironment: createEnvironmentForOperation,
      invalidate: (operations: Iterable<Operation>, reason: string) => {
        graph.invalidateOperations(operations, reason);
      },
      get debugMode(): boolean {
        return graph.debugMode;
      },
      get quietMode(): boolean {
        return graph.quietMode;
      },
      records: new Map(),
      promise: undefined,
      completedOperations: 0,
      totalOperations: 0
    };

    const executionRecords: Map<Operation, OperationExecutionRecord> = iterationContext.records;
    for (const operation of sortedOperations) {
      const executionRecord: OperationExecutionRecord = new OperationExecutionRecord(
        operation,
        iterationContext
      );

      executionRecords.set(operation, executionRecord);
    }

    for (const [operation, record] of executionRecords) {
      for (const dependency of operation.dependencies) {
        const dependencyRecord: OperationExecutionRecord | undefined = executionRecords.get(dependency);
        if (!dependencyRecord) {
          throw new Error(
            `Operation "${record.name}" declares a dependency on operation "${dependency.name}" that is not in the set of operations to execute.`
          );
        }
        record.dependencies.add(dependencyRecord);
        dependencyRecord.consumers.add(record);
      }
    }

    // Configure operations to execute.
    // Ensure we compute the compute the state hashes for all operations before the runtime graph potentially mutates.
    if (inputsSnapshot) {
      for (const record of executionRecords.values()) {
        record.getStateHash();
      }
    }

    measureFn(`${PERF_PREFIX}:configureIteration`, () => {
      hooks.configureIteration.call(executionRecords, this.resultByOperation, iterationOptionsForCallbacks);
    });

    for (const executionRecord of executionRecords.values()) {
      if (!executionRecord.silent) {
        // Only count non-silent operations
        iterationContext.totalOperations++;
      }
    }

    if (iterationContext.totalOperations === 0) {
      return;
    }

    this._setScheduledIteration(iterationContext);
    // Notify listeners that an iteration has been scheduled with the planned operation records
    try {
      this.hooks.onIterationScheduled.call(iterationContext.records);
    } catch (e) {
      // Surface configuration-time issues clearly
      terminal.writeStderrLine(
        Colorize.red(`An error occurred in onIterationScheduled hook: ${(e as Error).message}`)
      );
      throw e;
    }
    if (!this._currentIteration) {
      this._setIdleTimeout();
    } else if (!this.pauseNextIteration) {
      void this.abortCurrentIterationAsync();
    }
    return iterationContext;

    function onWriterActive(writer: CollatedWriter | undefined): void {
      if (writer) {
        iterationContext.completedOperations++;
        // Format a header like this
        //
        // ==[ @rushstack/the-long-thing ]=================[ 1 of 1000 ]==

        // leftPart: "==[ @rushstack/the-long-thing "
        const leftPart: string = Colorize.gray('==[') + ' ' + Colorize.cyan(writer.taskName) + ' ';
        const leftPartLength: number = 4 + writer.taskName.length + 1;

        // rightPart: " 1 of 1000 ]=="
        const completedOfTotal: string = `${iterationContext.completedOperations} of ${iterationContext.totalOperations}`;
        const rightPart: string = ' ' + Colorize.white(completedOfTotal) + ' ' + Colorize.gray(']==');
        const rightPartLength: number = 1 + completedOfTotal.length + 4;

        // middlePart: "]=================["
        const twoBracketsLength: number = 2;
        const middlePartLengthMinusTwoBrackets: number = Math.max(
          ASCII_HEADER_WIDTH - (leftPartLength + rightPartLength + twoBracketsLength),
          0
        );

        const middlePart: string = Colorize.gray(']' + '='.repeat(middlePartLengthMinusTwoBrackets) + '[');

        terminal.writeStdoutLine('\n' + leftPart + middlePart + rightPart);

        if (!graph.quietMode) {
          terminal.writeStdoutLine('');
        }
      }
    }
  }

  /**
   * Debounce configuration change notifications so that multiple property setters invoked within the same tick
   * only trigger the hook once. This avoids redundant re-computation in listeners (e.g. UI refresh) while preserving
   * ordering guarantees that the notification occurs after the initiating state changes are fully applied.
   */
  private _scheduleManagerStateChanged(): void {
    if (this._graphStateChangeScheduled || this.abortController.signal.aborted) {
      return;
    }
    this._graphStateChangeScheduled = true;
    process.nextTick(() => {
      this._graphStateChangeScheduled = false;
      this.hooks.onGraphStateChanged.call(this);
    });
  }

  /**
   * Executes all operations which have been registered, returning a promise which is resolved when all operations have been processed to a final state.
   * The abortController can be used to cancel the execution of any operations that have not yet begun execution.
   */
  private async _executeInnerAsync(iterationContext: IExecutionIterationContext): Promise<OperationStatus> {
    this._setStatus(OperationStatus.Executing);

    const { hooks } = this;

    const { abortController, records: executionRecords, terminal, totalOperations } = iterationContext;

    const isInitial: boolean = this.resultByOperation.size === 0;

    const iterationOptions: IOperationGraphIterationOptions = {
      inputsSnapshot: iterationContext.inputsSnapshot,
      startTime: iterationContext.startTime
    };

    const executionQueue: AsyncOperationQueue = new AsyncOperationQueue(
      executionRecords.values(),
      prioritySort
    );

    const abortSignal: AbortSignal = abortController.signal;

    iterationContext.onOperationStateChanged = onOperationStatusChanged;

    // Batched state change tracking using a Set for uniqueness
    let batchedStateChanges: Set<OperationExecutionRecord> = new Set();
    function flushBatchedStateChanges(): void {
      if (!batchedStateChanges.size) return;
      try {
        hooks.onExecutionStatesUpdated.call(batchedStateChanges);
      } finally {
        // Replace the set so that if anything held onto the old one it doesn't get mutated.
        batchedStateChanges = new Set();
      }
    }

    const state: IStatefulExecutionContext = {
      hasAnyFailures: false,
      hasAnyNonAllowedWarnings: false,
      hasAnyAborted: false,
      executionQueue,
      resultByOperation: this.resultByOperation,
      get completedOperations(): number {
        return iterationContext.completedOperations;
      },
      set completedOperations(value: number) {
        iterationContext.completedOperations = value;
      }
    };

    const executionContext: IOperationExecutionContext = {
      onStartAsync: onOperationStartAsync,
      onResultAsync: onOperationCompleteAsync
    };

    if (!this.quietMode) {
      const plural: string = totalOperations === 1 ? '' : 's';
      terminal.writeStdoutLine(`Selected ${totalOperations} operation${plural}:`);
      const nonSilentOperations: string[] = [];
      for (const record of executionRecords.values()) {
        if (!record.silent) {
          nonSilentOperations.push(record.name);
        }
      }
      nonSilentOperations.sort();
      for (const name of nonSilentOperations) {
        terminal.writeStdoutLine(`  ${name}`);
      }
      terminal.writeStdoutLine('');
    }

    const maxSimultaneousProcesses: number = Math.min(totalOperations, this.parallelism);
    // For logging purposes, don't confuse the user by suggesting we might run more operations in parallel than are scheduled.
    terminal.writeStdoutLine(`Executing a maximum of ${maxSimultaneousProcesses} simultaneous processes...`);

    const bailStatus: OperationStatus | undefined | void = abortSignal.aborted
      ? OperationStatus.Aborted
      : await measureAsyncFn(
          `${PERF_PREFIX}:beforeExecuteIterationAsync`,
          async () => await hooks.beforeExecuteIterationAsync.promise(executionRecords, iterationOptions)
        );

    if (bailStatus) {
      // Mark all non-terminal operations as Aborted
      for (const record of executionRecords.values()) {
        if (!record.isTerminal) {
          record.status = OperationStatus.Aborted;
          state.hasAnyAborted = true;
        }
      }
    } else {
      await measureAsyncFn(`${PERF_PREFIX}:executeOperationsAsync`, async () => {
        await Async.forEachAsync(
          executionQueue,
          async (record: OperationExecutionRecord) => {
            if (abortSignal.aborted) {
              record.status = OperationStatus.Aborted;
              // Bypass the normal completion handler, directly mark the operation as aborted and unblock the queue.
              // We do this to ensure that we aren't messing with the stopwatch or terminal.
              state.hasAnyAborted = true;
              executionQueue.complete(record);
            } else {
              const lastState: OperationExecutionRecord | undefined = state.resultByOperation.get(
                record.operation
              );
              await record.executeAsync(lastState, executionContext);
            }
          },
          {
            // In weighted mode, concurrency represents the total "unit budget", not the max number of tasks.
            // Do not cap by totalOperations, since that would incorrectly shrink the unit budget and
            // reduce parallelism for operations with weight > 1.
            concurrency: this.parallelism,
            weighted: true,
            allowOversubscription: this.allowOversubscription
          }
        );
      });
    }

    const status: OperationStatus = (() => {
      if (bailStatus) return bailStatus;
      if (state.hasAnyFailures) return OperationStatus.Failure;
      if (state.hasAnyAborted) return OperationStatus.Aborted;
      if (state.hasAnyNonAllowedWarnings) return OperationStatus.SuccessWithWarning;
      if (iterationContext.totalOperations === 0) return OperationStatus.NoOp;
      return OperationStatus.Success;
    })();

    this._setStatus(
      (await measureAsyncFn(`${PERF_PREFIX}:afterExecuteIterationAsync`, async () => {
        return await hooks.afterExecuteIterationAsync.promise(status, executionRecords, iterationOptions);
      })) ?? status
    );

    const { _telemetry: telemetry } = this;
    if (telemetry) {
      const logEntry: ITelemetryData = measureFn(`${PERF_PREFIX}:prepareTelemetry`, () => {
        const isWatch: boolean = this._isWatch;
        const jsonOperationResults: Record<string, ITelemetryOperationResult> = {};

        const durationInSeconds: number = (performance.now() - (iterationContext.startTime ?? 0)) / 1000;

        const extraData: IPhasedExecutionTelemetry = {
          ...telemetry.initialExtraData,
          isWatch,
          // Fields specific to the current operation set
          isInitial,

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

        let changedProjectsOnly: boolean = false;
        for (const operation of executionRecords.keys()) {
          if (operation.enabled === 'ignore-dependency-changes') {
            changedProjectsOnly = true;
            break;
          }
        }

        if (telemetry.changedProjectsOnlyKey) {
          // Overwrite this value since we allow changing it at runtime.
          extraData[telemetry.changedProjectsOnlyKey] = changedProjectsOnly;
        }

        const nonSilentDependenciesByOperation: Map<Operation, Set<string>> = new Map();
        function getNonSilentDependencies(operation: Operation): ReadonlySet<string> {
          let realDependencies: Set<string> | undefined = nonSilentDependenciesByOperation.get(operation);
          if (!realDependencies) {
            realDependencies = new Set();
            nonSilentDependenciesByOperation.set(operation, realDependencies);
            for (const dependency of operation.dependencies) {
              const dependencyRecord: OperationExecutionRecord | undefined = executionRecords.get(dependency);
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

        for (const [operation, operationResult] of executionRecords) {
          if (operationResult.silent) {
            // Architectural operation. Ignore.
            continue;
          }

          const { _operationMetadataManager: operationMetadataManager } = operationResult;

          const { startTime, endTime } = operationResult.stopwatch;
          jsonOperationResults[operation.name!] = {
            startTimestampMs: startTime,
            endTimestampMs: endTime,
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

        const innerLogEntry: ITelemetryData = {
          name: telemetry.nameForLog,
          durationInSeconds,
          result: status === OperationStatus.Success ? 'Succeeded' : 'Failed',
          extraData,
          operationResults: jsonOperationResults
        };

        return innerLogEntry;
      });

      measureFn(`${PERF_PREFIX}:beforeLog`, () => this.hooks.beforeLog.call(logEntry));
      telemetry.log(logEntry);
    }

    return status;

    // This function is a callback because it may write to the collatedWriter before
    // operation.executeAsync returns (and cleans up the writer)
    async function onOperationCompleteAsync(record: OperationExecutionRecord): Promise<void> {
      // If the operation is not terminal, we should _only_ notify the queue to assign operations.
      if (!record.isTerminal) {
        executionQueue.assignOperations();
      } else {
        try {
          await hooks.afterExecuteOperationAsync.promise(record);
        } catch (e) {
          _reportOperationErrorIfAny(record);
          record.error = e;
          record.status = OperationStatus.Failure;
        }
        _onOperationComplete(record, state);
      }
    }

    async function onOperationStartAsync(
      record: OperationExecutionRecord
    ): Promise<OperationStatus | undefined> {
      return await hooks.beforeExecuteOperationAsync.promise(record);
    }

    function onOperationStatusChanged(record: OperationExecutionRecord): void {
      if (record.status === OperationStatus.Ready) {
        executionQueue.assignOperations();
      }
      const wasEmpty: boolean = batchedStateChanges.size === 0;
      batchedStateChanges.add(record);
      if (wasEmpty) {
        // First change in this microtask; schedule flush
        queueMicrotask(flushBatchedStateChanges);
      }
    }
  }
}

/**
 * Handles the result of the operation and propagates any relevant effects.
 */
function _onOperationComplete(record: OperationExecutionRecord, context: IStatefulExecutionContext): void {
  const { status } = record;

  switch (status) {
    /**
     * This operation failed. Mark it as such and all reachable dependents as blocked.
     */
    case OperationStatus.Failure: {
      _handleOperationFailure(record, context);
      break;
    }

    /**
     * This operation was restored from the build cache.
     */
    case OperationStatus.FromCache: {
      _handleOperationFromCache(record, context);
      break;
    }

    /**
     * This operation was skipped via legacy change detection.
     */
    case OperationStatus.Skipped: {
      _handleOperationSkipped(record, context);
      break;
    }

    /**
     * This operation intentionally didn't do anything.
     */
    case OperationStatus.NoOp: {
      _handleOperationNoOp(record, context);
      break;
    }

    case OperationStatus.Success: {
      _handleOperationSuccess(record, context);
      break;
    }

    case OperationStatus.SuccessWithWarning: {
      _handleOperationSuccessWithWarning(record, context);
      break;
    }

    case OperationStatus.Aborted: {
      _handleOperationAborted(record, context);
      break;
    }

    default: {
      throw new InternalError(`Unexpected operation status: ${status}`);
    }
  }

  context.executionQueue.complete(record);
}

/**
 * Handle a failed operation and propagate the Blocked status to dependent operations.
 */
function _handleOperationFailure(record: OperationExecutionRecord, context: IStatefulExecutionContext): void {
  // Failed operations get reported, even if silent.
  // Generally speaking, silent operations shouldn't be able to fail, so this is a safety measure.
  _reportOperationErrorIfAny(record);

  const { name } = record;
  const { terminal } = record.collatedWriter; // Creates the writer if needed
  terminal.writeStderrLine(Colorize.red(`"${name}" failed to build.`));

  const blockedQueue: Set<OperationExecutionRecord> = new Set(record.consumers);
  for (const blockedRecord of blockedQueue) {
    if (blockedRecord.status === OperationStatus.Waiting) {
      if (!blockedRecord.silent) {
        terminal.writeStdoutLine(`"${blockedRecord.name}" is blocked by "${name}".`);
      }
      blockedRecord.status = OperationStatus.Blocked;
      context.executionQueue.complete(blockedRecord);
      if (!blockedRecord.silent) {
        context.completedOperations++; // Only count non-silent operations
      }
      for (const dependent of blockedRecord.consumers) {
        blockedQueue.add(dependent);
      }
    } else if (blockedRecord.status !== OperationStatus.Blocked) {
      throw new InternalError(
        `Blocked operation ${blockedRecord.name} is in an unexpected state: ${blockedRecord.status}`
      );
    }
  }
  context.resultByOperation.set(record.operation, record);
  context.hasAnyFailures = true;
}

/**
 * Handle operation restored from cache.
 */
function _handleOperationFromCache(
  record: OperationExecutionRecord,
  context: IStatefulExecutionContext
): void {
  if (!record.silent) {
    record.collatedWriter.terminal.writeStdoutLine(
      Colorize.green(`"${record.name}" was restored from the build cache.`)
    );
  }
  context.resultByOperation.set(record.operation, record);
}

/**
 * Handle skipped operation.
 */
function _handleOperationSkipped(record: OperationExecutionRecord, context: IStatefulExecutionContext): void {
  // Do not set resultByOperation here. "Skipped" means the operation was not executed,
  // so it should not be considered the last *execution* result.
  if (!record.silent) {
    record.collatedWriter.terminal.writeStdoutLine(Colorize.green(`"${record.name}" was skipped.`));
  }
}

/**
 * Handle no-op operation.
 */
function _handleOperationNoOp(record: OperationExecutionRecord, context: IStatefulExecutionContext): void {
  if (!record.silent) {
    record.collatedWriter.terminal.writeStdoutLine(
      Colorize.gray(`"${record.name}" did not define any work.`)
    );
  }
  context.resultByOperation.set(record.operation, record);
}

/**
 * Handle successful operation.
 */
function _handleOperationSuccess(record: OperationExecutionRecord, context: IStatefulExecutionContext): void {
  const stopwatch: IStopwatchResult = _getOperationStopwatch(record);
  if (!record.silent) {
    record.collatedWriter.terminal.writeStdoutLine(
      Colorize.green(`"${record.name}" completed successfully in ${stopwatch.toString()}.`)
    );
  }
  context.resultByOperation.set(record.operation, record);
}

/**
 * Handle successful operation with warnings.
 */
function _handleOperationSuccessWithWarning(
  record: OperationExecutionRecord,
  context: IStatefulExecutionContext
): void {
  const stopwatch: IStopwatchResult = _getOperationStopwatch(record);
  if (!record.silent) {
    record.collatedWriter.terminal.writeStderrLine(
      Colorize.yellow(`"${record.name}" completed with warnings in ${stopwatch.toString()}.`)
    );
  }
  context.resultByOperation.set(record.operation, record);
  context.hasAnyNonAllowedWarnings ||= !record.runner.warningsAreAllowed;
}

/**
 * Resolve the appropriate stopwatch for an operation, restoring from metadata if available.
 */
function _getOperationStopwatch(record: OperationExecutionRecord): IStopwatchResult {
  const operationMetadataManager: import('./OperationMetadataManager').OperationMetadataManager =
    record._operationMetadataManager;
  return operationMetadataManager?.tryRestoreStopwatch(record.stopwatch) || record.stopwatch;
}

/**
 * Handle aborted operation.
 */
function _handleOperationAborted(record: OperationExecutionRecord, context: IStatefulExecutionContext): void {
  // Do not set resultByOperation here. "Aborted" means the operation was not executed,
  // so it should not be considered the last *execution* result.
  context.hasAnyAborted = true;
}

function _reportOperationErrorIfAny(record: OperationExecutionRecord): void {
  // Failed operations get reported, even if silent.
  // Generally speaking, silent operations shouldn't be able to fail, so this is a safety measure.
  let message: string | undefined = undefined;
  if (record.error) {
    if (!(record.error instanceof AlreadyReportedError)) {
      message = record.error.message;
    }
  }

  if (message) {
    // This creates the writer, so don't do this until needed
    record.collatedWriter.terminal.writeStderrLine(message);
    // Ensure that the summary isn't blank if we have an error message
    // If the summary already contains max lines of stderr, this will get dropped, so we hope those lines
    // are more useful than the final exit code.
    record.stdioSummarizer.writeChunk({
      text: `${message}\n`,
      kind: TerminalChunkKind.Stdout
    });
  }
}
