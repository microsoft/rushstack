// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AsyncSeriesHook, AsyncSeriesWaterfallHook } from 'tapable';

import type { CommandLineParameter } from '@rushstack/ts-command-line';

import type { BuildCacheConfiguration } from '../api/BuildCacheConfiguration';
import type { IPhase } from '../api/CommandLineConfiguration';
import type { RushConfiguration } from '../api/RushConfiguration';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import type { Operation } from '../logic/operations/Operation';
import type { CobuildConfiguration } from '../api/CobuildConfiguration';
import type { RushProjectConfiguration } from '../api/RushProjectConfiguration';
import type { Parallelism } from '../logic/operations/ParseParallelism';
import type { IInputsSnapshot } from '../logic/incremental/InputsSnapshot';
import type { IOperationGraph } from '../logic/operations/IOperationGraph';

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
  readonly parallelism: Parallelism;
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
 * Context used for configuring the operation graph.
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
 * Hooks into the execution process for phased commands.
 *
 * Lifecycle:
 * 1. `createOperationsAsync` - Invoked to populate the set of operations for execution.
 * 2. `onGraphCreatedAsync` - Invoked after the operation graph is created, allowing plugins to
 *    tap into graph-level hooks (e.g. `configureIteration`, `onIdle`).
 *    See {@link OperationGraphHooks} for the per-iteration lifecycle.
 *
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
   * Hook invoked when the operation graph is created, allowing the plugin to tap into it and interact with it.
   */
  public readonly onGraphCreatedAsync: AsyncSeriesHook<[IOperationGraph, IOperationGraphContext]> =
    new AsyncSeriesHook(['operationGraph', 'context'], 'onGraphCreatedAsync');
}
