// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal, TerminalWritable } from '@rushstack/terminal';

import type { Operation } from './Operation';
import type { IExecutionResult, IOperationExecutionResult } from './IOperationExecutionResult';
import type { Parallelism } from './ParseParallelism';
import type { OperationStatus } from './OperationStatus';
import type { IInputsSnapshot } from '../incremental/InputsSnapshot';
import type { OperationGraphHooks } from '../../pluginFramework/OperationGraphHooks';

/**
 * Options for a single iteration of operation execution.
 * @alpha
 */
export interface IOperationGraphIterationOptions {
  inputsSnapshot?: IInputsSnapshot;

  /**
   * The time when the iteration was scheduled, if available, as returned by `performance.now()`.
   */
  startTime?: number;

  /**
   * Returns the environment that an operation of this iteration starts from, before any
   * `createEnvironmentForOperation` tap. The operation's `dependsOnEnvVars` are hashed from the same environment.
   * When omitted, every operation starts from `process.env` and hashes the environment of the inputs snapshot.
   *
   * @remarks
   * A long-lived host serves requests from clients whose environments differ from its own, and one iteration can
   * serve several requests. The host gives each operation the environment of a request that selected it
   * (see `getWorkspaceRequestOperationEnvironment`).
   */
  getOperationEnvironment?: (operation: Operation) => Readonly<Record<string, string | undefined>>;

  /**
   * False to run every enabled operation of this iteration as a fresh process of a non-incremental command such as
   * `rush rebuild` would: without skipping unchanged operations, without reading the build cache, and without
   * passing the last result to the runner (so no runner uses its incremental command). Cache writes are unaffected.
   * When omitted or true, the graph's own setting (`ICreateOperationsContext.isIncrementalBuildAllowed`) applies.
   *
   * @remarks
   * A long-lived graph created by an incremental command serves a non-incremental request this way. The results
   * of operations that the iteration does not enable are kept.
   */
  isIncrementalBuildAllowed?: boolean;

  /**
   * Returns the identifier of the request whose environment `getOperationEnvironment` returns for an operation of
   * this iteration, or `undefined` if there is no such request. When omitted, the iteration serves no identified
   * request.
   *
   * @remarks
   * A long-lived host can serve several requests in one iteration. A plugin can use this identifier to attribute
   * each operation to the request that selected it, for example to join per-operation telemetry with that
   * request's own telemetry entry.
   */
  getOperationRequestId?: (operation: Operation) => string | undefined;
}

/**
 * The results of one request for an operation graph's work, passed to
 * {@link OperationGraphHooks.afterExecuteRequestAsync}.
 *
 * @remarks
 * A native command makes one request for each iteration, so its request has the iteration's results. A long-lived
 * host such as the Rush daemon can serve several requests with one iteration, and it serves a request whose
 * operations are all up to date without any iteration. Each of those requests has only its own results.
 *
 * @alpha
 */
export interface IOperationGraphRequestResult extends IExecutionResult {
  /**
   * The results of the operations that the request selected. An operation that was already up to date, so that
   * the request did not need to run it, has the `Skipped` status, a zero-length stopwatch and no problems.
   * A request that returned before its iteration finished omits the operations that had not finished.
   * The map can include silent operations; check `silent` before reporting an operation.
   */
  readonly operationResults: ReadonlyMap<Operation, IOperationExecutionResult>;

  /**
   * The request's overall status, as its caller reports it.
   */
  readonly status: OperationStatus;

  /**
   * The name of the Rush command that made the request, for example `build`.
   */
  readonly commandName: string;

  /**
   * The environment of the request's caller. For a native command, this is `process.env`. A long-lived host passes
   * the environment of the client that sent the request, which can differ from the host's own `process.env`.
   */
  readonly environment: Readonly<Record<string, string | undefined>>;

  /**
   * The id that a long-lived host gave the request, or `undefined` for a native command.
   */
  readonly requestId: string | undefined;

  /**
   * Writes to the output of the request's caller. A long-lived host shows this output only to the client that sent
   * the request.
   */
  readonly terminal: ITerminal;
}

/**
 * Public API for the operation graph.
 * @alpha
 */
export interface IOperationGraph {
  /**
   * Hooks into the execution process for operations
   */
  readonly hooks: OperationGraphHooks;

  /**
   * The set of operations in the graph.
   */
  readonly operations: ReadonlySet<Operation>;

  /**
   * A map from each `Operation` in the graph to its current result record.
   * The map is updated in real time as operations execute during an iteration.
   * Only statuses representing a completed execution (e.g. `Success`, `Failure`,
   * `SuccessWithWarning`) write to this map, as does `Skipped` for an operation that was
   * selected to execute and whose outputs a plugin (e.g. change detection) found up to date.
   * Statuses such as `Aborted`, or `Skipped` for an operation that was not selected —
   * which indicate that an operation did not actually run — do not update it.
   * For operations that have not yet run in the current iteration, the map retains the
   * result from whichever prior iteration the operation last ran in.
   * An entry with status `Ready` indicates that the operation is considered stale and
   * has been queued to run again.
   * Empty until at least one operation has completed execution.
   */
  readonly resultByOperation: ReadonlyMap<Operation, IOperationExecutionResult>;

  /**
   * The maximum allowed parallelism for this operation graph.
   * Reads as a concrete integer. Accepts a `Parallelism` value and coerces it on write.
   */
  get parallelism(): number;
  set parallelism(value: Parallelism);

  /**
   * If additional debug information should be printed during execution.
   */
  debugMode: boolean;

  /**
   * If true, operations will be executed in "quiet mode" where only errors are reported.
   */
  quietMode: boolean;

  /**
   * If true, allow operations to oversubscribe the CPU. Defaults to true.
   */
  allowOversubscription: boolean;

  /**
   * When true, the operation graph will pause before running the next iteration (manual mode).
   * When false, iterations run automatically when scheduled.
   */
  pauseNextIteration: boolean;

  /**
   * The current overall status of the execution.
   */
  readonly status: OperationStatus;

  /**
   * The current set of terminal destinations.
   */
  readonly terminalDestinations: ReadonlySet<TerminalWritable>;

  /**
   * True if there is a scheduled (but not yet executing) iteration.
   * This will be false while an iteration is actively executing, or when no work is scheduled.
   */
  readonly hasScheduledIteration: boolean;

  /**
   * AbortController controlling the lifetime of the overall session (e.g. watch mode).
   * Aborting this controller should signal all listeners (such as file system watchers) to dispose
   * and prevent further iterations from being scheduled.
   */
  readonly abortController: AbortController;

  /**
   * Abort the current execution iteration, if any. Operations that have already started
   * will run to completion; only operations that have not yet begun will be aborted.
   *
   * If `options.terminateRunning` is true and the graph supports it, operations that are already running are also
   * signaled to terminate (via `IOperationRunnerContext.abortSignal`) and are reported as `Aborted`.
   */
  abortCurrentIterationAsync(options?: { terminateRunning?: boolean }): Promise<void>;

  /**
   * Cleans up any resources used by the operation runners, if applicable.
   *
   * Does not wait for executing operations to finish before closing their runners. Hosts performing
   * idle eviction must coordinate this call with iteration scheduling. Operations, their last results,
   * and host-owned watchers are not removed.
   *
   * @param operations - The operations whose runners should be closed, or undefined to close all runners.
   */
  closeRunnersAsync(operations?: Iterable<Operation>): Promise<void>;

  /**
   * Drops retained results after the host has awaited runner and watcher cleanup.
   * Rejects executing/prepared iterations and runners that still report active resources.
   * Detaches completed iteration contexts so surviving results do not retain evicted records.
   * Does not change enabled states, disk caches, or operation definitions.
   * Optional for compatibility with hosts that do not support idle eviction.
   */
  deleteResults?(operations: Iterable<Operation>): void;

  /**
   * Executes a single iteration of the operations.
   * @param options - Options for this execution iteration.
   * @returns A promise that resolves to true if the iteration has work to be done, or false if the iteration was empty and therefore not scheduled.
   */
  scheduleIterationAsync(options: IOperationGraphIterationOptions): Promise<boolean>;

  /**
   * Discards prepared, unstarted work without executing scripts or closing retained runners.
   * Throws while an iteration is executing. Completed results remain unchanged.
   * @returns Whether a prepared iteration was discarded.
   */
  discardScheduledIteration(): boolean;

  /**
   * Executes all operations in the currently scheduled iteration, if any.
   * @returns A promise which is resolved when all operations have been processed to a final state.
   */
  executeScheduledIterationAsync(): Promise<boolean>;

  /**
   * Invalidates the specified operations, causing them to be re-executed.
   * @param operations - The operations to invalidate, or undefined to invalidate all operations.
   * @param reason - Optional reason for invalidation.
   */
  invalidateOperations(operations?: Iterable<Operation>, reason?: string): void;

  /**
   * Sets the enabled state for a collection of operations.
   *
   * @param operations - The operations whose enabled state should be updated.
   * @param targetState - The target enabled state to apply.
   * @param mode - 'unsafe' to directly mutate only the provided operations, 'safe' to also enable
   * transitive dependencies of enabled operations and disable transitive dependents of disabled operations.
   * @returns true if any operation's enabled state changed, false otherwise.
   */
  setEnabledStates(
    operations: Iterable<Operation>,
    targetState: Operation['enabled'],
    mode: 'safe' | 'unsafe'
  ): boolean;

  /**
   * Adds a terminal destination for output. Only new output will be sent to the destination.
   * @param destination - The destination to add.
   */
  addTerminalDestination(destination: TerminalWritable): void;

  /**
   * Removes a terminal destination for output. Optionally closes the stream.
   * New output will no longer be sent to the destination.
   * @param destination - The destination to remove.
   * @param close - Whether to close the stream. Defaults to `true`.
   */
  removeTerminalDestination(destination: TerminalWritable, close?: boolean): boolean;
}
