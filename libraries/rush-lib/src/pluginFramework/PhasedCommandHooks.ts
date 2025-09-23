// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  AsyncSeriesBailHook,
  AsyncSeriesHook,
  AsyncSeriesWaterfallHook,
  SyncHook,
  SyncWaterfallHook
} from 'tapable';

import type { TerminalWritable } from '@rushstack/terminal';
import type { CommandLineParameter } from '@rushstack/ts-command-line';

import type { BuildCacheConfiguration } from '../api/BuildCacheConfiguration';
import type { IPhase } from '../api/CommandLineConfiguration';
import type { RushConfiguration } from '../api/RushConfiguration';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import type { Operation } from '../logic/operations/Operation';
import type {
  IOperationExecutionResult,
  IConfigurableOperation
} from '../logic/operations/IOperationExecutionResult';
import type { CobuildConfiguration } from '../api/CobuildConfiguration';
import type { RushProjectConfiguration } from '../api/RushProjectConfiguration';
import type { IOperationRunnerContext } from '../logic/operations/IOperationRunner';
import type { ITelemetryData } from '../logic/Telemetry';
import type { OperationStatus } from '../logic/operations/OperationStatus';
import type { IInputsSnapshot } from '../logic/incremental/InputsSnapshot';
import type { IEnvironment } from '../utilities/Utilities';

/**
 * A plugin that interacts with a phased commands.
 * @alpha
 */
export interface IPhasedCommandPlugin {
  /**
   * Applies this plugin.
   */
  apply(hooks: PhasedCommandHooks): void;
}

/**
 * Context used for creating operations to be executed.
 * @alpha
 */
export interface ICreateOperationsContext {
  /**
   * The configuration for the build cache, if the feature is enabled.
   */
  readonly buildCacheConfiguration: BuildCacheConfiguration | undefined;
  /**
   * If true, for an incremental build, Rush will only include projects with immediate changes or projects with no consumers.
   * @remarks
   * This is an optimization that may produce invalid outputs if some of the intervening projects are impacted by the changes.
   */
  readonly changedProjectsOnly: boolean;
  /**
   * The configuration for the cobuild, if cobuild feature and build cache feature are both enabled.
   */
  readonly cobuildConfiguration: CobuildConfiguration | undefined;
  /**
   * The set of custom parameters for the executing command.
   * Maps from the `longName` field in command-line.json to the parser configuration in ts-command-line.
   */
  readonly customParameters: ReadonlyMap<string, CommandLineParameter>;
  /**
   * If true, dependencies of the selected phases will be automatically enabled in the execution.
   */
  readonly includePhaseDeps: boolean;
  /**
   * If true, projects may read their output from cache or be skipped if already up to date.
   * If false, neither of the above may occur, e.g. "rush rebuild"
   */
  readonly isIncrementalBuildAllowed: boolean;
  /**
   * If true, the command is running in watch mode.
   */
  readonly isWatch: boolean;
  /**
   * The currently configured maximum parallelism for the command.
   */
  readonly parallelism: number;
  /**
   * The set of phases selected for execution.
   */
  readonly phaseSelection: ReadonlySet<IPhase>;
  /**
   * All successfully loaded rush-project.json data for selected projects.
   */
  readonly projectConfigurations: ReadonlyMap<RushConfigurationProject, RushProjectConfiguration>;
  /**
   * The set of Rush projects selected for execution.
   */
  readonly projectSelection: ReadonlySet<RushConfigurationProject>;
  /**
   * If true, the operation graph should include all projects in the repository (watch broad graph mode).
   * Only the projects in projectSelection should start enabled; others are present but disabled.
   */
  readonly generateFullGraph?: boolean;
  /**
   * The Rush configuration
   */
  readonly rushConfiguration: RushConfiguration;
}

/**
 * Context used for configuring the manager.
 * @alpha
 */
export interface IOperationGraphContext extends ICreateOperationsContext {
  /**
   * The current state of the repository, if available.
   * Not part of the creation context to avoid the overhead of Git calls when initializing the graph.
   */
  readonly initialSnapshot?: IInputsSnapshot;
}

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
   * The set of operations that the manager is aware of.
   */
  readonly operations: ReadonlySet<Operation>;

  /**
   * The most recent set of operation execution results, if any.
   */
  readonly lastExecutionResults: ReadonlyMap<Operation, IOperationExecutionResult>;

  /**
   * The maximum allowed parallelism for this execution manager.
   */
  parallelism: number;

  /**
   * If additional debug information should be printed during execution.
   */
  debugMode: boolean;

  /**
   * If true, operations will be executed in "quiet mode" where only errors are reported.
   */
  quietMode: boolean;

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
   * Abort the current execution iteration, if any.
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
   * Call `abortCurrentIterationAsync()` to cancel the execution of any operations that have not yet begun execution.
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
   * @param mode - 'unsafe' to directly mutate only the provided operations, 'safe' to apply dependency-aware logic.
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

/**
 * Hooks into the execution process for phased commands
 * @alpha
 */
export class PhasedCommandHooks {
  /**
   * Hook invoked to create operations for execution.
   */
  public readonly createOperationsAsync: AsyncSeriesWaterfallHook<
    [Set<Operation>, ICreateOperationsContext]
  > = new AsyncSeriesWaterfallHook(['operations', 'context'], 'createOperationsAsync');

  /**
   * Hook invoked when the execution graph (manager) is created, allowing the plugin to tap into it and interact with it.
   */
  public readonly onGraphCreatedAsync: AsyncSeriesHook<[IOperationGraph, IOperationGraphContext]> =
    new AsyncSeriesHook(['operationGraph', 'context'], 'onGraphCreatedAsync');

  /**
   * Hook invoked after executing operations and before waitingForChanges. Allows the caller
   * to augment or modify the log entry about to be written.
   */
  public readonly beforeLog: SyncHook<ITelemetryData, void> = new SyncHook(['telemetryData'], 'beforeLog');
}

/**
 * Hooks into the execution process for operations
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
  public readonly onWaitingForChanges: SyncHook<void> = new SyncHook(undefined, 'onWaitingForChanges');

  /**
   * Hook invoked after executing a set of operations.
   * Hook is series for stable output.
   */
  public readonly afterExecuteIterationAsync: AsyncSeriesWaterfallHook<
    [OperationStatus, ReadonlyMap<Operation, IOperationExecutionResult>, IOperationGraphIterationOptions]
  > = new AsyncSeriesWaterfallHook(['status', 'results', 'context'], 'afterExecuteIterationAsync');

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
