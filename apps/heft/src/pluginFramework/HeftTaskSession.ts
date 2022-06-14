// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import type { AsyncParallelHook } from 'tapable';
import type { CommandLineParameter } from '@rushstack/ts-command-line';

import type { MetricsCollector } from '../metrics/MetricsCollector';
import type { ScopedLogger, IScopedLogger } from './logging/ScopedLogger';
import type { HeftTask } from './HeftTask';
import type { IHeftPhaseSessionOptions } from './HeftPhaseSession';
import type { RequestAccessToPluginByNameCallback } from './HeftPluginHost';
import type { IDeleteOperation } from '../plugins/DeleteFilesPlugin';
import type { ICopyOperation } from '../plugins/CopyFilesPlugin';

/**
 * @public
 */
export interface IHeftTaskSession {
  /**
   * @public
   */
  readonly taskName: string;

  /**
   * @public
   */
  readonly hooks: IHeftTaskHooks;

  /**
   * @public
   */
  readonly parametersByLongName: ReadonlyMap<string, CommandLineParameter>;

  /**
   * If set to true, the build is running with the --debug flag
   *
   * @public
   */
  readonly debugMode: boolean;

  /**
   * @public
   */
  readonly cacheFolder: string;

  /**
   * @public
   */
  readonly tempFolder: string;

  /**
   * @public
   */
  readonly logger: IScopedLogger;

  /**
   * Call this function to receive a callback with the plugin if and after the specified plugin
   * has been applied. This is used to tap hooks on another plugin.
   *
   * @public
   */
  readonly requestAccessToPluginByName: RequestAccessToPluginByNameCallback;
}

/**
 * @public
 */
export interface IHeftTaskHooks {
  clean: AsyncParallelHook<IHeftTaskCleanHookOptions>;
  run: AsyncParallelHook<IHeftTaskRunHookOptions>;
}

/**
 * @public
 */
export interface IHeftTaskHookOptions {
  production: boolean;
  verbose: boolean;
}

/**
 * @public
 */
export interface IHeftTaskCleanHookOptions extends IHeftTaskHookOptions {
  addDeleteOperations: (...deleteOperations: IDeleteOperation[]) => void;
}

/**
 * @public
 */
export interface IHeftTaskRunHookOptions extends IHeftTaskHookOptions {
  addCopyOperations: (...copyOperations: ICopyOperation[]) => void;
}

export interface IHeftTaskSessionOptions extends IHeftPhaseSessionOptions {
  logger: ScopedLogger;
  task: HeftTask;
  taskHooks: IHeftTaskHooks;
  parametersByLongName: ReadonlyMap<string, CommandLineParameter>;
  requestAccessToPluginByName: RequestAccessToPluginByNameCallback;
}

export class HeftTaskSession implements IHeftTaskSession {
  private _options: IHeftTaskSessionOptions;

  public readonly taskName: string;
  public readonly hooks: IHeftTaskHooks;
  public readonly parametersByLongName: ReadonlyMap<string, CommandLineParameter>;
  public readonly cacheFolder: string;
  public readonly tempFolder: string;
  public readonly logger: IScopedLogger;
  public readonly requestAccessToPluginByName: RequestAccessToPluginByNameCallback;

  public get debugMode(): boolean {
    return this._options.getIsDebugMode();
  }

  /**
   * @internal
   */
  public readonly metricsCollector: MetricsCollector;

  public constructor(options: IHeftTaskSessionOptions) {
    this._options = options;
    this.logger = options.logger;
    this.metricsCollector = options.metricsCollector;
    this.taskName = options.task.taskName;
    this.hooks = options.taskHooks;
    this.parametersByLongName = options.parametersByLongName;

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

    this.requestAccessToPluginByName = options.requestAccessToPluginByName;
  }
}
