// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { AsyncParallelHook } from 'tapable';

import type { MetricsCollector } from '../metrics/MetricsCollector';
import type { IScopedLogger } from './logging/ScopedLogger';
import type { HeftTask } from './HeftTask';
import type { IHeftPhaseSessionOptions } from './HeftPhaseSession';
import type { IHeftParameters } from './HeftParameterManager';
import type { IDeleteOperation } from '../plugins/DeleteFilesPlugin';
import type { ICopyOperation } from '../plugins/CopyFilesPlugin';
import type { HeftPluginHost } from './HeftPluginHost';

/**
 * The task session provided to the task.
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
   * The parameters that were passed to the task plugin.
   *
   * @public
   */
  readonly parameters: IHeftParameters;

  /**
   * The cache folder for the task. This folder is unique for each task, and will not be
   * cleaned when Heft is run with `--clean`. However, it will be cleaned when Heft is run
   * with `--clean` and `--clean-cache`.
   *
   * @public
   */
  readonly cacheFolder: string;

  /**
   * The temp folder for the task. This folder is unique for each task, and will be cleaned
   * when Heft is run with `--clean`.
   *
   * @public
   */
  readonly tempFolder: string;

  /**
   * The scoped logger for the task. Messages logged with this logger will be prefixed with
   * the phase and task name, in the format "[<phaseName>:<taskName>]".
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
   * The `clean` hook is called at the beginning of the phase. It can be used to clean up
   * any files or folders that may be produced by the plugin. To use it, call
   * `clean.tapPromise(<pluginName>, <callback>)`.
   *
   * @public
   */
  clean: AsyncParallelHook<IHeftTaskCleanHookOptions>;

  /**
   * The `run` hook is called after all dependency task executions have completed during a normal
   * run, or during a watch mode run when no `runIncremental` hook is provided. It is where the
   * plugin can perform its work. To use it, call `run.tapPromise(<pluginName>, <callback>)`.
   *
   * @public
   */
  run: AsyncParallelHook<IHeftTaskRunHookOptions>;

  /**
   * If provided, the `runIncremental` hook is called after all dependency task executions have completed
   * during a watch mode run. It is where the plugin can perform incremental work. To use it, call
   * `run.tapPromise(<pluginName>, <callback>)`.
   *
   * @public
   */
  runIncremental: AsyncParallelHook<IHeftTaskRunIncrementalHookOptions>;
}

/**
 * Options provided to the `clean` hook.
 *
 * @public
 */
export interface IHeftTaskCleanHookOptions {
  /**
   * Add delete operations to be performed during the `clean` hook. These operations will be
   * performed before any tasks are run within a phase.
   *
   * @public
   */
  addDeleteOperations: (...deleteOperations: IDeleteOperation[]) => void;
}

/**
 * Options provided to the `run` hook.
 *
 * @public
 */
export interface IHeftTaskRunHookOptions {
  /**
   * Add copy operations to be performed during the `run` hook. These operations will be
   * performed after the task `run` hook has completed.
   *
   * @public
   */
  addCopyOperations: (...copyOperations: ICopyOperation[]) => void;
}

/**
 * Options provided to the 'runIncremental' hook.
 *
 * @public
 */
export interface IHeftTaskRunIncrementalHookOptions extends IHeftTaskRunHookOptions {
  /**
   * A map of changed files to the corresponding change state. This can be used to track which
   * files have been changed during an incremental build.
   */
  changedFiles: ReadonlyMap<string, IChangedFileState>;
}

/**
 * The state of a changed file.
 *
 * @public
 */
export interface IChangedFileState {
  /**
   * Whether or not the file is a source file. A source file is determined to be any file
   * that is not ignored by Git.
   *
   * @public
   */
  readonly isSourceFile: boolean;

  /**
   * A version hash of a specific file properties that can be used to determine if a
   * file has changed. The version hash will change when any of the following properties
   * are changed:
   * - path
   * - file size
   * - content last modified date (mtime)
   * - metadata last modified date (ctime)
   *
   * @remarks The initial state of the version hash is "INITIAL_CHANGE_STATE", which
   * should only ever be used on the first incremental run of the task. When a file
   * is deleted, the version hash will be "REMOVED_CHANGE_STATE".
   *
   * @public
   */
  readonly version: string;
}

export interface IHeftTaskSessionOptions extends IHeftPhaseSessionOptions {
  cleanHook: AsyncParallelHook<IHeftTaskCleanHookOptions>;
  task: HeftTask;
  taskParameters: IHeftParameters;
  pluginHost: HeftPluginHost;
}

export class HeftTaskSession implements IHeftTaskSession {
  private _pluginHost: HeftPluginHost;

  public readonly taskName: string;
  public readonly hooks: IHeftTaskHooks;
  public readonly parameters: IHeftParameters;
  public readonly cacheFolder: string;
  public readonly tempFolder: string;
  public readonly logger: IScopedLogger;

  /**
   * @internal
   */
  public readonly metricsCollector: MetricsCollector;

  public constructor(options: IHeftTaskSessionOptions) {
    const {
      cleanHook,
      heftConfiguration: { cacheFolder, tempFolder },
      loggingManager,
      metricsCollector,
      phase,
      task,
      taskParameters,
      pluginHost
    } = options;

    this.logger = loggingManager.requestScopedLogger(`${phase.phaseName}:${task.taskName}`);
    this.metricsCollector = metricsCollector;
    this.taskName = task.taskName;
    this.hooks = {
      clean: cleanHook,
      run: new AsyncParallelHook(['runHookOptions']),
      runIncremental: new AsyncParallelHook(['runIncrementalHookOptions'])
    };

    this.parameters = taskParameters;

    // Guranteed to be unique since phases are uniquely named, tasks are uniquely named within
    // phases, and neither can have '.' in their names. We will also use the phase name and
    // task name as the folder name (instead of the plugin name) since we want to enable re-use
    // of plugins in multiple phases and tasks while maintaining unique temp/cache folders for
    // each task.
    const uniqueTaskFolderName: string = `${phase.phaseName}.${task.taskName}`;

    // <projectFolder>/.cache/<phaseName>.<taskName>
    this.cacheFolder = path.join(cacheFolder, uniqueTaskFolderName);

    // <projectFolder>/temp/<phaseName>.<taskName>
    this.tempFolder = path.join(tempFolder, uniqueTaskFolderName);

    this._pluginHost = pluginHost;
  }

  public requestAccessToPluginByName<T extends object>(
    pluginToAccessPackage: string,
    pluginToAccessName: string,
    pluginApply: (pluginAccessor: T) => void
  ): void {
    this._pluginHost.requestAccessToPluginByName(
      this.taskName,
      pluginToAccessPackage,
      pluginToAccessName,
      pluginApply
    );
  }
}
