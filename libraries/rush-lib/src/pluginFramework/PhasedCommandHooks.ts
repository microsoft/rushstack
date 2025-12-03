// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  AsyncParallelHook,
  AsyncSeriesBailHook,
  AsyncSeriesHook,
  AsyncSeriesWaterfallHook,
  SyncHook,
  SyncWaterfallHook
} from 'tapable';

import type { CommandLineParameter } from '@rushstack/ts-command-line';

import type { BuildCacheConfiguration } from '../api/BuildCacheConfiguration';
import type { IPhase } from '../api/CommandLineConfiguration';
import type { RushConfiguration } from '../api/RushConfiguration';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import type { Operation } from '../logic/operations/Operation';
import type {
  IExecutionResult,
  IOperationExecutionResult
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
   * If true, projects may read their output from cache or be skipped if already up to date.
   * If false, neither of the above may occur, e.g. "rush rebuild"
   */
  readonly isIncrementalBuildAllowed: boolean;
  /**
   * If true, this is the initial run of the command.
   * If false, this execution is in response to changes.
   */
  readonly isInitial: boolean;
  /**
   * If true, the command is running in watch mode.
   */
  readonly isWatch: boolean;
  /**
   * The currently configured maximum parallelism for the command.
   */
  readonly parallelism: number;
  /**
   * The set of phases original for the current command execution.
   */
  readonly phaseOriginal: ReadonlySet<IPhase>;
  /**
   * The set of phases selected for the current command execution.
   */
  readonly phaseSelection: ReadonlySet<IPhase>;
  /**
   * The set of Rush projects selected for the current command execution.
   */
  readonly projectSelection: ReadonlySet<RushConfigurationProject>;
  /**
   * All successfully loaded rush-project.json data for selected projects.
   */
  readonly projectConfigurations: ReadonlyMap<RushConfigurationProject, RushProjectConfiguration>;
  /**
   * The set of Rush projects that have not been built in the current process since they were last modified.
   * When `isInitial` is true, this will be an exact match of `projectSelection`.
   */
  readonly projectsInUnknownState: ReadonlySet<RushConfigurationProject>;
  /**
   * The Rush configuration
   */
  readonly rushConfiguration: RushConfiguration;
  /**
   * If true, Rush will automatically include the dependent phases for the specified set of phases.
   * @remarks
   * If the selection of projects was "unsafe" (i.e. missing some dependencies), this will add the
   * minimum number of phases required to make it safe.
   */
  readonly includePhaseDeps: boolean;
  /**
   * Marks an operation's result as invalid, potentially triggering a new build. Only applicable in watch mode.
   * @param operation - The operation to invalidate
   * @param reason - The reason for invalidating the operation
   */
  readonly invalidateOperation?: ((operation: Operation, reason: string) => void) | undefined;
}

/**
 * Context used for executing operations.
 * @alpha
 */
export interface IExecuteOperationsContext extends ICreateOperationsContext {
  /**
   * The current state of the repository, if available.
   * Not part of the creation context to avoid the overhead of Git calls when initializing the graph.
   */
  readonly inputsSnapshot?: IInputsSnapshot;

  /**
   * An abort controller that can be used to abort the current set of queued operations.
   */
  readonly abortController: AbortController;
}

/**
 * Hooks into the execution process for phased commands
 * @alpha
 */
export class PhasedCommandHooks {
  /**
   * Hook invoked to create operations for execution.
   * Use the context to distinguish between the initial run and phased runs.
   */
  public readonly createOperations: AsyncSeriesWaterfallHook<[Set<Operation>, ICreateOperationsContext]> =
    new AsyncSeriesWaterfallHook(['operations', 'context'], 'createOperations');

  /**
   * Hook invoked before operation start
   * Hook is series for stable output.
   */
  public readonly beforeExecuteOperations: AsyncSeriesHook<
    [Map<Operation, IOperationExecutionResult>, IExecuteOperationsContext]
  > = new AsyncSeriesHook(['records', 'context']);

  /**
   * Hook invoked when operation status changed
   * Hook is series for stable output.
   */
  public readonly onOperationStatusChanged: SyncHook<[IOperationExecutionResult]> = new SyncHook(['record']);

  /**
   * Hook invoked after executing a set of operations.
   * Use the context to distinguish between the initial run and phased runs.
   * Hook is series for stable output.
   */
  public readonly afterExecuteOperations: AsyncSeriesHook<[IExecutionResult, IExecuteOperationsContext]> =
    new AsyncSeriesHook(['results', 'context']);

  /**
   * Hook invoked before executing a operation.
   */
  public readonly beforeExecuteOperation: AsyncSeriesBailHook<
    [IOperationRunnerContext & IOperationExecutionResult],
    OperationStatus | undefined
  > = new AsyncSeriesBailHook(['runnerContext'], 'beforeExecuteOperation');

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
  public readonly afterExecuteOperation: AsyncSeriesHook<
    [IOperationRunnerContext & IOperationExecutionResult]
  > = new AsyncSeriesHook(['runnerContext'], 'afterExecuteOperation');

  /**
   * Hook invoked to shutdown long-lived work in plugins.
   */
  public readonly shutdownAsync: AsyncParallelHook<void> = new AsyncParallelHook(undefined, 'shutdown');

  /**
   * Hook invoked after a run has finished and the command is watching for changes.
   * May be used to display additional relevant data to the user.
   * Only relevant when running in watch mode.
   */
  public readonly waitingForChanges: SyncHook<void> = new SyncHook(undefined, 'waitingForChanges');

  /**
   * Hook invoked after executing operations and before waitingForChanges. Allows the caller
   * to augment or modify the log entry about to be written.
   */
  public readonly beforeLog: SyncHook<ITelemetryData, void> = new SyncHook(['telemetryData'], 'beforeLog');
}
