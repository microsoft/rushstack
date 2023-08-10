// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AsyncSeriesHook, AsyncSeriesBailHook, AsyncSeriesWaterfallHook, SyncHook } from 'tapable';

import type { IAsyncTaskContext } from '@rushstack/node-core-library';
import type { CommandLineParameter } from '@rushstack/ts-command-line';

import type { BuildCacheConfiguration } from '../api/BuildCacheConfiguration';
import type { IPhase } from '../api/CommandLineConfiguration';
import type { RushConfiguration } from '../api/RushConfiguration';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';

import type { IOperationRunnerContext } from '../logic/operations/IOperationRunner';
import type { Operation } from '../logic/operations/Operation';
import type { OperationStatus } from '../logic/operations/OperationStatus';
import type { ProjectChangeAnalyzer } from '../logic/ProjectChangeAnalyzer';
import type { ITelemetryData } from '../logic/Telemetry';
import type {
  IExecutionResult,
  IOperationExecutionResult
} from '../logic/operations/IOperationExecutionResult';
import { RushProjectConfiguration } from '../api/RushProjectConfiguration';

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
   * The set of phases original for the current command execution.
   */
  readonly phaseOriginal: ReadonlySet<IPhase>;
  /**
   * The set of phases selected for the current command execution.
   */
  readonly phaseSelection: ReadonlySet<IPhase>;
  /**
   * The current state of the repository
   */
  readonly projectChangeAnalyzer: ProjectChangeAnalyzer;
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
   * Hook invoked before executing a set of operations.
   * Hook is series for stable output.
   */
  public readonly beforeExecuteOperations: AsyncSeriesHook<[Map<Operation, IOperationExecutionResult>]> =
    new AsyncSeriesHook(['records']);

  /**
   * Hook invoked immediately prior to invoking the runner for an operation.
   * If any tap returns a status, the runner will not be invoked and the status will be the result of the operation.
   * Hook is series for stable output.
   */
  public readonly beforeExecuteOperation: AsyncSeriesBailHook<
    [IOperationExecutionResult & IOperationRunnerContext, IAsyncTaskContext],
    OperationStatus | undefined
  > = new AsyncSeriesBailHook(['record', 'asyncContext']);

  /**
   * Hook invoked when operation status changed.
   * Hook is series for stable output.
   */
  public readonly onOperationStatusChanged: SyncHook<[IOperationExecutionResult]> = new SyncHook(['record']);

  /**
   * Hook invoked immediately after invoking the runner for an operation.
   * Will not be invoked at all if the runner was skipped.
   * Hook is series for stable output.
   */
  public readonly afterExecuteOperation: AsyncSeriesBailHook<
    [IOperationExecutionResult & IOperationRunnerContext, IAsyncTaskContext],
    OperationStatus | undefined
  > = new AsyncSeriesBailHook(['record', 'asyncContext']);

  /**
   * Hook invoked after executing a set of operations.
   * Use the context to distinguish between the initial run and phased runs.
   * Hook is series for stable output.
   */
  public readonly afterExecuteOperations: AsyncSeriesHook<[IExecutionResult, ICreateOperationsContext]> =
    new AsyncSeriesHook(['results', 'context']);

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

/**
 * The stage in the `createOperations` hook where the build cache creates its read and write operations.
 */
export const STAGE_CREATE_CACHE_OPERATIONS: 1000 = 1000;
