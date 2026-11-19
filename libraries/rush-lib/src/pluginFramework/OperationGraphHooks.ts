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
import type {
  IOperationGraph,
  IOperationGraphIterationOptions,
  IOperationGraphRequestResult
} from '../logic/operations/IOperationGraph';

/**
 * Hooks into the execution process for operations within the graph.
 *
 * Per-iteration lifecycle:
 * 1. `configureIteration` - Synchronously decide which operations to enable for the next iteration.
 * 2. `onIterationScheduled` - Fires after the iteration is prepared but before execution begins, if it has any enabled operations.
 * 3. `beforeExecuteIterationAsync` - Async hook that can bail out the iteration entirely.
 * 4. Operations execute (status changes reported via `onExecutionStatesUpdated`). If another request joins the
 *    iteration, `configureIteration` plans the iteration again, with `startedOperations` naming the operations that
 *    were already dispatched. If the graph accepts the new plan, `extendIteration` prepares the operations that
 *    changed.
 * 5. `afterExecuteIterationAsync` - Fires after all operations in the iteration have settled.
 * 6. `afterExecuteRequestAsync` - Fires once for each request that the iteration served.
 * 7. `onIdle` - Fires when the graph enters idle state awaiting changes (watch mode only).
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
   * Set `enabled` and `shouldRunnerPersist` on the values in `initialRecords` to control which operations
   * execute and which runners remain active after their operation completes.
   *
   * @remarks
   * This hook is synchronous to guarantee that the `lastExecutedRecords` map remains stable for the
   * duration of configuration. This hook often executes while an execution iteration is currently running, so
   * operations could complete if there were async ticks during the configuration phase.
   *
   * If no operations are marked for execution, the iteration will not be scheduled.
   * If there is an existing scheduled iteration, it will remain.
   *
   * When `context.startedOperations` is set, the call plans an iteration that is already executing again, for the
   * work of a request that joins it (see {@link IOperationGraph.tryExtendCurrentIteration}). The graph can still
   * refuse that plan after this hook returns, and then discards it. A plugin that keeps state across iterations
   * applies the effects of such a plan in `extendIteration`, which is called only for an accepted plan.
   */
  public readonly configureIteration: SyncHook<
    [
      ReadonlyMap<Operation, IConfigurableOperation>,
      ReadonlyMap<Operation, IOperationExecutionResult>,
      IOperationGraphIterationOptions
    ]
  > = new SyncHook(['initialRecords', 'lastExecutedRecords', 'context'], 'configureIteration');

  /**
   * Hook invoked when the work of another request is added to an iteration that is already executing (see
   * {@link IOperationGraph.tryExtendCurrentIteration}), before any of the given records is dispatched. It receives the
   * records whose `enabled` state, runner policy or state hash changed, and the options of the extension, whose
   * `inputsSnapshot` is the newer snapshot that the state hashes of these records were calculated from. A plugin that
   * prepares state for each operation in `beforeExecuteIterationAsync` prepares it again here for these records.
   *
   * The options are the same object that the `configureIteration` call of the accepted plan received. A tap that
   * throws aborts the iteration.
   */
  public readonly extendIteration: SyncHook<
    [ReadonlyMap<Operation, IOperationExecutionResult>, IOperationGraphIterationOptions]
  > = new SyncHook(['records', 'context'], 'extendIteration');

  /**
   * Hook invoked before operation start for an iteration. Allows a plugin to perform side-effects or
   * short-circuit the entire iteration.
   *
   * If any tap returns an {@link OperationStatus}, the remaining taps are skipped and the iteration will
   * end immediately with that status. Operations which have not yet executed are marked Skipped if the
   * returned status is successful (e.g. `Success`, `FromCache`, `NoOp`); otherwise they are marked Aborted.
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
   * Releases plugin-held completed-iteration state before idle result deletion.
   * The graph rejects active/prepared iterations before invoking this hook. A thrown cleanup error
   * prevents result deletion. Only invoked by hosts explicitly using `deleteResults()`.
   */
  public readonly beforeDeleteResults: SyncHook<[ReadonlySet<Operation>]> = new SyncHook(
    ['operations'],
    'beforeDeleteResults'
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
   * Hook invoked once for each request for this graph's work, after the operations that the request selected have
   * settled and before the request's result is reported. Use it instead of `afterExecuteIterationAsync` for work that
   * describes one command's results, such as a build summary.
   *
   * @remarks
   * A native command makes one request for each iteration, and invokes this hook after
   * `afterExecuteIterationAsync`, with the iteration's final status and results.
   *
   * A long-lived host such as the Rush daemon can serve several requests with one iteration, and it serves a request
   * whose operations are all up to date without any iteration, so the iteration hooks never fire for that request.
   * The host invokes this hook once for each request it serves, including those, with only that request's
   * results. Several requests can be in this hook at the same time.
   *
   * A host can also return a failed request as soon as nothing that still runs can change its result. It then
   * invokes this hook while the iteration runs, and the request's results omit the operations that have not
   * finished.
   *
   * The hook is not invoked for a request that ends without results: one whose iteration throws, or one that a
   * long-lived host stops serving because its client cancelled the request or disconnected.
   *
   * If a tap throws, the request fails with that error.
   */
  public readonly afterExecuteRequestAsync: AsyncSeriesHook<[IOperationGraphRequestResult]> =
    new AsyncSeriesHook(['request'], 'afterExecuteRequestAsync');

  /**
   * Hook invoked after executing an iteration, before the telemetry entry is written.
   * Allows the caller to augment or modify the log entry.
   *
   * @remarks
   * Taps describe the iteration that just ran. A long-lived host such as the Rush daemon logs one entry for each
   * request, and skips this hook for a request that it served without an iteration. Use `beforeLogRequest` for data
   * that every entry needs.
   */
  public readonly beforeLog: SyncHook<ITelemetryData, void> = new SyncHook(['telemetryData'], 'beforeLog');

  /**
   * Hook invoked before any telemetry entry for this graph's work is written, including the entry of a request that
   * a long-lived host such as the Rush daemon served without an iteration. Use it instead of `beforeLog` for data
   * that does not describe an iteration, such as a flag that says that a plugin is active.
   *
   * @remarks
   * A native command invokes this hook for each iteration's entry, before `beforeLog`. A long-lived host invokes it
   * once for each request that it logs, and invokes `beforeLog` after it only if an iteration served the request.
   */
  public readonly beforeLogRequest: SyncHook<ITelemetryData, void> = new SyncHook(
    ['telemetryData'],
    'beforeLogRequest'
  );

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
