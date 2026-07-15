// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TerminalWritable } from '@rushstack/terminal';

import type { Operation } from './Operation';
import type { IOperationExecutionResult } from './IOperationExecutionResult';
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
   * `SuccessWithWarning`) write to this map; statuses such as `Skipped` or `Aborted` —
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
   */
  abortCurrentIterationAsync(): Promise<void>;

  /**
   * Cleans up any resources used by the operation runners, if applicable.
   * @param operations - The operations whose runners should be closed, or undefined to close all runners.
   */
  closeRunnersAsync(operations?: Iterable<Operation>): Promise<void>;

  /**
   * Executes a single iteration of the operations.
   * @param options - Options for this execution iteration.
   * @returns A promise that resolves to true if the iteration has work to be done, or false if the iteration was empty and therefore not scheduled.
   */
  scheduleIterationAsync(options: IOperationGraphIterationOptions): Promise<boolean>;

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
