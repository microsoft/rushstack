// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AsyncParallelHook, AsyncSeriesWaterfallHook } from 'tapable';

import { InternalError } from '@rushstack/node-core-library';

import type { MetricsCollector } from '../metrics/MetricsCollector';
import type { IScopedLogger } from './logging/ScopedLogger';
import type { HeftTask } from './HeftTask';
import type { IHeftPhaseSessionOptions } from './HeftPhaseSession';
import type { HeftParameterManager, IHeftParameters } from './HeftParameterManager';
import type { IDeleteOperation } from '../plugins/DeleteFilesPlugin';
import type { ICopyOperation } from '../plugins/CopyFilesPlugin';
import type { HeftPluginHost } from './HeftPluginHost';
import type { GlobFn, WatchGlobFn } from '../plugins/FileGlobSpecifier';
import type { IWatchFileSystem } from '../utilities/WatchFileSystemAdapter';

/**
 * The type of {@link IHeftTaskSession.parsedCommandLine}, which exposes details about the
 * command line that was used to invoke Heft.
 * @public
 */
export interface IHeftParsedCommandLine {
  /**
   * Returns the subcommand passed on the Heft command line, before any aliases have been expanded.
   * This can be useful when printing error messages that need to refer to the invoked command line.
   *
   * @remarks
   * For example, if the invoked command was `heft test --verbose`, then `commandName`
   * would be `test`.
   *
   * Suppose the invoked command was `heft start` which is an alias for `heft build-watch --serve`.
   * In this case, the `commandName` would be `start`.  To get the expanded name `build-watch`,
   * use {@link IHeftParsedCommandLine.unaliasedCommandName} instead.
   *
   * When invoking phases directly using `heft run`, the `commandName` is `run`.
   *
   * @see {@link IHeftParsedCommandLine.unaliasedCommandName}
   */
  readonly commandName: string;

  /**
   * Returns the subcommand passed on the Heft command line, after any aliases have been expanded.
   * This can be useful when printing error messages that need to refer to the invoked command line.
   *
   * @remarks
   * For example, if the invoked command was `heft test --verbose`, then `unaliasedCommandName`
   * would be `test`.
   *
   * Suppose the invoked command was `heft start` which is an alias for `heft build-watch --serve`.
   * In this case, the `unaliasedCommandName` would be `build-watch`.  To get the alias name
   * `start`, use @see {@link IHeftParsedCommandLine.commandName} instead.
   *
   * When invoking phases directly using `heft run`, the `unaliasedCommandName` is `run`.
   *
   * @see {@link IHeftParsedCommandLine.commandName}
   */
  readonly unaliasedCommandName: string;
}

/**
 * The task session is responsible for providing session-specific information to Heft task plugins.
 * The session provides access to the hooks that Heft will run as part of task execution, as well as
 * access to parameters provided via the CLI. The session is also how you request access to other task
 * plugins.
 *
 * @public
 */
export interface IHeftTaskSession {
  /**
   * The name of the task. This is defined in "heft.json".
   *
   * @public
   */
  readonly taskName: string;

  /**
   * The hooks available to the task plugin.
   *
   * @public
   */
  readonly hooks: IHeftTaskHooks;

  /**
   * Contains default parameters provided by Heft, as well as CLI parameters requested by the task
   * plugin.
   *
   * @public
   */
  readonly parameters: IHeftParameters;

  /**
   * Exposes details about the command line that was used to invoke Heft.
   * This value is initially `undefined` and later filled in after the command line has been parsed.
   */
  readonly parsedCommandLine: IHeftParsedCommandLine;

  /**
   * The temp folder for the task. This folder is unique for each task, and will be cleaned
   * when Heft is run with `--clean`.
   *
   * @public
   */
  readonly tempFolderPath: string;

  /**
   * The scoped logger for the task. Messages logged with this logger will be prefixed with
   * the phase and task name, in the format `[<phaseName>:<taskName>]`. It is highly recommended
   * that writing to the console be performed via the logger, as it will ensure that logging messages
   * are labeled with the source of the message.
   *
   * @public
   */
  readonly logger: IScopedLogger;

  /**
   * Set a a callback which will be called if and after the specified plugin has been applied.
   * This can be used to tap hooks on another plugin that exists within the same phase.
   *
   * @public
   */
  requestAccessToPluginByName<T extends object>(
    pluginToAccessPackage: string,
    pluginToAccessName: string,
    pluginApply: (pluginAccessor: T) => void
  ): void;
}

/**
 * Hooks that are available to the task plugin.
 *
 * @public
 */
export interface IHeftTaskHooks {
  /**
   * The `run` hook is called after all dependency task executions have completed during a normal
   * run, or during a watch mode run when no `runIncremental` hook is provided. It is where the
   * plugin can perform its work. To use it, call `run.tapPromise(<pluginName>, <callback>)`.
   *
   * @public
   */
  readonly run: AsyncParallelHook<IHeftTaskRunHookOptions>;

  /**
   * If provided, the `runIncremental` hook is called after all dependency task executions have completed
   * during a watch mode run. It is where the plugin can perform incremental work. To use it, call
   * `run.tapPromise(<pluginName>, <callback>)`.
   */
  readonly runIncremental: AsyncParallelHook<IHeftTaskRunIncrementalHookOptions>;

  /**
   * If provided, the `registerFileOperations` hook is called exactly once before the first time either
   * `run` or `runIncremental` would be invoked to provide the plugin an opportunity to request
   * dynamic file copy or deletion operations.
   */
  readonly registerFileOperations: AsyncSeriesWaterfallHook<IHeftTaskFileOperations>;
}

/**
 * Options provided to the `run` hook.
 *
 * @public
 */
export interface IHeftTaskRunHookOptions {
  /**
   * An abort signal that is used to abort the build. This can be used to stop operations early and allow
   * for a new build to be started.
   *
   * @beta
   */
  readonly abortSignal: AbortSignal;

  /**
   * Reads the specified globs and returns the result.
   */
  readonly globAsync: GlobFn;
}

/**
 * Options provided to the 'runIncremental' hook.
 *
 * @public
 */
export interface IHeftTaskRunIncrementalHookOptions extends IHeftTaskRunHookOptions {
  /**
   * A callback that can be invoked to tell the Heft runtime to schedule an incremental run of this
   * task. If a run is already pending, does nothing.
   */
  readonly requestRun: () => void;

  /**
   * Reads the specified globs and returns the result, filtering out files that have not changed since the last execution.
   * All file system calls while reading the glob are tracked and will be watched for changes.
   *
   * If a change to the monitored files is detected, the task will be scheduled for re-execution.
   */
  readonly watchGlobAsync: WatchGlobFn;

  /**
   * Access to the file system view that powers `watchGlobAsync`.
   * This is useful for plugins that do their own file system operations but still want to leverage Heft for watching.
   */
  readonly watchFs: IWatchFileSystem;
}

/**
 * Options provided to the `registerFileOperations` hook.
 *
 * @public
 */
export interface IHeftTaskFileOperations {
  /**
   * Copy operations to be performed following the `run` or `runIncremental` hook. These operations will be
   * performed after the task `run` or `runIncremental` hook has completed.
   *
   * @public
   */
  copyOperations: Set<ICopyOperation>;

  /**
   * Delete operations to be performed following the `run` or `runIncremental` hook. These operations will be
   * performed after the task `run` or `runIncremental` hook has completed.
   *
   * @public
   */
  deleteOperations: Set<IDeleteOperation>;
}

export interface IHeftTaskSessionOptions extends IHeftPhaseSessionOptions {
  task: HeftTask;
  pluginHost: HeftPluginHost;
}

export class HeftTaskSession implements IHeftTaskSession {
  public readonly taskName: string;
  public readonly hooks: IHeftTaskHooks;
  public readonly tempFolderPath: string;
  public readonly logger: IScopedLogger;

  private readonly _options: IHeftTaskSessionOptions;
  private _parameters: IHeftParameters | undefined;
  private _parsedCommandLine: IHeftParsedCommandLine;

  /**
   * @internal
   */
  public readonly metricsCollector: MetricsCollector;

  public get parameters(): IHeftParameters {
    // Delay loading the parameters for the task until they're actually needed
    if (!this._parameters) {
      const parameterManager: HeftParameterManager = this._options.internalHeftSession.parameterManager;
      const task: HeftTask = this._options.task;
      this._parameters = parameterManager.getParametersForPlugin(task.pluginDefinition);
    }
    return this._parameters;
  }

  public get parsedCommandLine(): IHeftParsedCommandLine {
    return this._parsedCommandLine;
  }

  public constructor(options: IHeftTaskSessionOptions) {
    const {
      internalHeftSession: {
        heftConfiguration: { tempFolderPath: tempFolder },
        loggingManager,
        metricsCollector
      },
      phase,
      task
    } = options;

    if (!options.internalHeftSession.parsedCommandLine) {
      // This should not happen
      throw new InternalError('Attempt to construct HeftTaskSession before command line has been parsed');
    }
    this._parsedCommandLine = options.internalHeftSession.parsedCommandLine;

    this.logger = loggingManager.requestScopedLogger(`${phase.phaseName}:${task.taskName}`);
    this.metricsCollector = metricsCollector;
    this.taskName = task.taskName;
    this.hooks = {
      run: new AsyncParallelHook(['runHookOptions']),
      runIncremental: new AsyncParallelHook(['runIncrementalHookOptions']),
      registerFileOperations: new AsyncSeriesWaterfallHook(['fileOperations'])
    };

    // Guaranteed to be unique since phases are uniquely named, tasks are uniquely named within
    // phases, and neither can have '/' in their names. We will also use the phase name and
    // task name as the folder name (instead of the plugin name) since we want to enable re-use
    // of plugins in multiple phases and tasks while maintaining unique temp/cache folders for
    // each task.
    // Having a parent folder for the phase simplifies interaction with the Rush build cache.
    const uniqueTaskFolderName: string = `${phase.phaseName}/${task.taskName}`;

    // <projectFolder>/temp/<phaseName>/<taskName>
    this.tempFolderPath = `${tempFolder}/${uniqueTaskFolderName}`;

    this._options = options;
  }

  public requestAccessToPluginByName<T extends object>(
    pluginToAccessPackage: string,
    pluginToAccessName: string,
    pluginApply: (pluginAccessor: T) => void
  ): void {
    this._options.pluginHost.requestAccessToPluginByName(
      this.taskName,
      pluginToAccessPackage,
      pluginToAccessName,
      pluginApply
    );
  }
}
