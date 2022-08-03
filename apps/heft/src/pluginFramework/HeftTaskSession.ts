// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import type { AsyncParallelHook } from 'tapable';

import type { MetricsCollector } from '../metrics/MetricsCollector';
import type { ScopedLogger, IScopedLogger } from './logging/ScopedLogger';
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
   * The hooks available to the task.
   *
   * @public
   */
  readonly hooks: IHeftTaskHooks;

  /**
   * The parameters that were passed to the task.
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
   * the phase and task name.
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
   * The `run` hook is called after all dependency task executions have completed. It is
   * where the plugin can perform its work. To use it, call `run.tapPromise(<pluginName>, <callback>)`.
   *
   * @public
   */
  run: AsyncParallelHook<IHeftTaskRunHookOptions>;
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

export interface IHeftTaskSessionOptions extends IHeftPhaseSessionOptions {
  logger: ScopedLogger;
  task: HeftTask;
  taskHooks: IHeftTaskHooks;
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
    this.logger = options.logger;
    this.metricsCollector = options.metricsCollector;
    this.taskName = options.task.taskName;
    this.hooks = options.taskHooks;
    this.parameters = options.taskParameters;

    // Guranteed to be unique since phases are uniquely named, tasks are uniquely named within
    // phases, and neither can have '.' in their names. We will also use the phase name and
    // task name as the folder name (instead of the plugin name) since we want to enable re-use
    // of plugins in multiple phases and tasks while maintaining unique temp/cache folders for
    // each task.
    const uniqueTaskFolderName: string = `${options.phase.phaseName}.${options.task.taskName}`;

    // <projectFolder>/.cache/<phaseName>.<taskName>
    this.cacheFolder = path.join(options.heftConfiguration.cacheFolder, uniqueTaskFolderName);

    // <projectFolder>/temp/<phaseName>.<taskName>
    this.tempFolder = path.join(options.heftConfiguration.tempFolder, uniqueTaskFolderName);

    this._pluginHost = options.pluginHost;
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
