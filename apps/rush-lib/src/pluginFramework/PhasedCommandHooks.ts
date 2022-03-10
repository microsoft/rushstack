// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AsyncSeriesWaterfallHook, SyncHook } from 'tapable';

import type { CommandLineParameter } from '@rushstack/ts-command-line';
import type { BuildCacheConfiguration } from '../api/BuildCacheConfiguration';
import type { IPhase, Parameter } from '../api/CommandLineConfiguration';
import type { RushConfiguration } from '../api/RushConfiguration';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';

import type { Operation } from '../logic/operations/Operation';
import type { ProjectChangeAnalyzer } from '../logic/ProjectChangeAnalyzer';

/**
 * Context used for creating operations to be executed.
 * @alpha
 */
export interface ICreateOperationsContext {
  /**
   * The configuration for the build cache, if the feature is enabled.
   */
  buildCacheConfiguration: BuildCacheConfiguration | undefined;
  /**
   * The set of custom parameters for the executing command.
   * Maps from the metadata in command-line.json to the parser configuration in ts-command-line.
   */
  customParameters: Map<Parameter, CommandLineParameter>;
  /**
   * If true, projects may read their output from cache or be skipped if already up to date.
   * If false, neither of the above may occur, e.g. "rush rebuild"
   */
  isIncrementalBuildAllowed: boolean;
  /**
   * If true, this is the initial run of the command.
   * If false, this execution is in response to changes.
   */
  isInitial: boolean;
  /**
   * If true, the command is running in watch mode.
   */
  isWatch: boolean;
  /**
   * The set of phases selected for the current command execution.
   */
  phaseSelection: ReadonlySet<IPhase>;
  /**
   * The current state of the repository
   */
  projectChangeAnalyzer: ProjectChangeAnalyzer;
  /**
   * The set of Rush projects selected for the current command execution.
   */
  projectSelection: ReadonlySet<RushConfigurationProject>;
  /**
   * The Rush configuration
   */
  rushConfiguration: RushConfiguration;
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
   * Hook invoked after a run has finished and the command is watching for changes.
   * May be used to display additional relevant data to the user.
   * Only relevant when running in watch mode.
   */
  public readonly waitingForChanges: SyncHook<void> = new SyncHook(undefined, 'waitingForChanges');
}
