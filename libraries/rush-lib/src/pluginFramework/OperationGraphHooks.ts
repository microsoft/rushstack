// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  AsyncSeriesBailHook,
  AsyncSeriesHook,
  AsyncSeriesWaterfallHook,
  SyncHook,
  SyncWaterfallHook
} from 'tapable';

import type { Operation } from '../logic/operations/Operation';
import type {
  IOperationExecutionResult,
  IConfigurableOperation
} from '../logic/operations/IOperationExecutionResult';
import type { OperationStatus } from '../logic/operations/OperationStatus';
import type { IOperationRunnerContext } from '../logic/operations/IOperationRunner';
import type { ITelemetryData } from '../logic/Telemetry';
import type { IEnvironment } from '../utilities/Utilities';
import type { IOperationGraph, IOperationGraphIterationOptions } from '../logic/operations/IOperationGraph';

/**
 * Hooks into the execution process for operations within the graph.
 *
 * Per-iteration lifecycle:
 * 1. `configureIteration` - Synchronously decide which operations to enable for the next iteration.
 * 2. `onIterationScheduled` - Fires after the iteration is prepared but before execution begins, if it has any enabled operations.
 * 3. `beforeExecuteIterationAsync` - Async hook that can bail out the iteration entirely.
 * 4. Operations execute (status changes reported via `onExecutionStatesUpdated`).
 * 5. `afterExecuteIterationAsync` - Fires after all operations in the iteration have settled.
 * 6. `onIdle` - Fires when the graph enters idle state awaiting changes (watch mode only).
 *
 * Additional hooks:
 * - `onEnableStatesChanged` - Fires when `setEnabledStates` mutates operation enabled flags.
 * - `onInvalidateOperations` - Fires when operations are invalidated (e.g. by file watchers).
 * - `onGraphStateChanged` - Fires on any observable graph state change.
 *
 * @alpha
 */
export class OperationGraphHooks {
  /**
   * Hook invoked to decide what work a potential new iteration contains.
   * Use the `lastExecutedRecords` to determine which operations are new or have had their inputs changed.
   * Set the `enabled` states on the values in `initialRecords` to control which operations will be executed.
   *
   * @remarks
   * This hook is synchronous to guarantee that the `lastExecutedRecords` map remains stable for the
   * duration of configuration. This hook often executes while an execution iteration is currently running, so
   * operations could complete if there were async ticks during the configuration phase.
   *
   * If no operations are marked for execution, the iteration will not be scheduled.
   * If there is an existing scheduled iteration, it will remain.
   */
  public readonly configureIteration: SyncHook<
    [
      ReadonlyMap<Operation, IConfigurableOperation>,
      ReadonlyMap<Operation, IOperationExecutionResult>,
      IOperationGraphIterationOptions
    ]
  > = new SyncHook(['initialRecords', 'lastExecutedRecords', 'context'], 'configureIteration');

  /**
   * Hook invoked before operation start for an iteration. Allows a plugin to perform side-effects or
   * short-circuit the entire iteration.
   *
   * If any tap returns an {@link OperationStatus}, the remaining taps are skipped and the iteration will
   * end immediately with that status. All operations which have not yet executed will be marked
   * Aborted.
   */
  public readonly beforeExecuteIterationAsync: AsyncSeriesBailHook<
    [ReadonlyMap<Operation, IOperationExecutionResult>, IOperationGraphIterationOptions],
    OperationStatus | undefined | void
  > = new AsyncSeriesBailHook(['records', 'context'], 'beforeExecuteIterationAsync');

  /**
   * Batched hook invoked when one or more operation statuses have changed during the same microtask.
   * The hook receives an array of the operation execution results that changed status.
   * @remarks
   * This hook is batched to reduce noise when updating many operations synchronously in quick succession.
   */
  public readonly onExecutionStatesUpdated: SyncHook<[ReadonlySet<IOperationExecutionResult>]> = new SyncHook(
    ['records'],
    'onExecutionStatesUpdated'
  );

  /**
   * Hook invoked when one or more operations have their enabled state mutated via
   * {@link IOperationGraph.setEnabledStates}. Provides the set of operations whose
   * enabled state actually changed.
   */
  public readonly onEnableStatesChanged: SyncHook<[ReadonlySet<Operation>]> = new SyncHook(
    ['operations'],
    'onEnableStatesChanged'
  );

  /**
   * Hook invoked immediately after a new execution iteration is scheduled (i.e. operations selected and prepared),
   * before any operations in that iteration have started executing. Can be used to snapshot planned work,
   * drive UIs, or pre-compute auxiliary data.
   */
  public readonly onIterationScheduled: SyncHook<[ReadonlyMap<Operation, IOperationExecutionResult>]> =
    new SyncHook(['records'], 'onIterationScheduled');

  /**
   * Hook invoked when any observable state on the operation graph changes.
   * This includes configuration mutations (parallelism, quiet/debug modes, pauseNextIteration)
   * as well as dynamic state (status transitions, scheduled iteration availability, etc.).
   * Hook is series for stable output.
   */
  public readonly onGraphStateChanged: SyncHook<[IOperationGraph]> = new SyncHook(
    ['operationGraph'],
    'onGraphStateChanged'
  );

  /**
   * Hook invoked when operations are invalidated for any reason.
   */
  public readonly onInvalidateOperations: SyncHook<[Iterable<Operation>, string | undefined]> = new SyncHook(
    ['operations', 'reason'],
    'onInvalidateOperations'
  );

  /**
   * Hook invoked after an iteration has finished and the command is watching for changes.
   * May be used to display additional relevant data to the user.
   * Only relevant when running in watch mode.
   */
  public readonly onIdle: SyncHook<void> = new SyncHook(undefined, 'onIdle');

  /**
   * Hook invoked after executing a set of operations.
   * Hook is series for stable output.
   */
  public readonly afterExecuteIterationAsync: AsyncSeriesWaterfallHook<
    [OperationStatus, ReadonlyMap<Operation, IOperationExecutionResult>, IOperationGraphIterationOptions]
  > = new AsyncSeriesWaterfallHook(['status', 'results', 'context'], 'afterExecuteIterationAsync');

  /**
   * Hook invoked after executing an iteration, before the telemetry entry is written.
   * Allows the caller to augment or modify the log entry.
   */
  public readonly beforeLog: SyncHook<ITelemetryData, void> = new SyncHook(['telemetryData'], 'beforeLog');

  /**
   * Hook invoked before executing a operation.
   */
  public readonly beforeExecuteOperationAsync: AsyncSeriesBailHook<
    [IOperationRunnerContext & IOperationExecutionResult],
    OperationStatus | undefined
  > = new AsyncSeriesBailHook(['runnerContext'], 'beforeExecuteOperationAsync');

  /**
   * Hook invoked to define environment variables for an operation.
   * May be invoked by the runner to get the environment for the operation.
   */
  public readonly createEnvironmentForOperation: SyncWaterfallHook<
    [IEnvironment, IOperationRunnerContext & IOperationExecutionResult]
  > = new SyncWaterfallHook(['environment', 'runnerContext'], 'createEnvironmentForOperation');

  /**
   * Hook invoked after executing a operation.
   */
  public readonly afterExecuteOperationAsync: AsyncSeriesHook<
    [IOperationRunnerContext & IOperationExecutionResult]
  > = new AsyncSeriesHook(['runnerContext'], 'afterExecuteOperationAsync');
}
