// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import type { AsyncParallelHook } from 'tapable';
import type { CommandLineParameter } from '@rushstack/ts-command-line';

import type { IHeftRecordMetricsHookOptions, MetricsCollector } from '../metrics/MetricsCollector';
import type { ScopedLogger } from './logging/ScopedLogger';
import type { IInternalHeftSessionOptions } from './InternalHeftSession';
import type { RequestAccessToPluginByNameCallback } from './HeftPluginHost';
import type { IDeleteOperation } from '../plugins/DeleteFilesPlugin';
import type { HeftPluginDefinitionBase } from '../configuration/HeftPluginDefinition';

/**
 * @public
 */
export interface IHeftLifecycleHookOptions {
  production: boolean;
}

/**
 * @public
 */
export interface IHeftLifecycleCleanHookOptions extends IHeftLifecycleHookOptions {
  addDeleteOperations: (...deleteOperations: IDeleteOperation[]) => void;
}

/**
 * @public
 */
export interface IHeftLifecycleToolStartHookOptions extends IHeftLifecycleHookOptions {}

/**
 * @public
 */
export interface IHeftLifecycleToolStopHookOptions extends IHeftLifecycleHookOptions {}

/**
 * @public
 */
export interface IHeftLifecycleHooks {
  clean: AsyncParallelHook<IHeftLifecycleCleanHookOptions>;
  toolStart: AsyncParallelHook<IHeftLifecycleToolStartHookOptions>;
  toolStop: AsyncParallelHook<IHeftLifecycleToolStopHookOptions>;
  recordMetrics: AsyncParallelHook<IHeftRecordMetricsHookOptions>;
}

/**
 * @internal
 */
export interface IHeftLifecycleSessionOptions extends IInternalHeftSessionOptions {
  logger: ScopedLogger;
  lifecycleHooks: IHeftLifecycleHooks;
  pluginDefinition: HeftPluginDefinitionBase;
  parametersByLongName: ReadonlyMap<string, CommandLineParameter>;
  requestAccessToPluginByName: RequestAccessToPluginByNameCallback;
}

/**
 * @public
 */
export class HeftLifecycleSession {
  private _options: IHeftLifecycleSessionOptions;

  /**
   * @public
   */
  public readonly hooks: IHeftLifecycleHooks;

  /**
   * @public
   */
  public readonly parametersByLongName: ReadonlyMap<string, CommandLineParameter>;

  /**
   * @public
   */
  public readonly cacheFolder: string;

  /**
   * @public
   */
  public readonly tempFolder: string;

  /**
   * @public
   */
  public readonly logger: ScopedLogger;

  /**
   * @internal
   */
  public readonly metricsCollector: MetricsCollector;

  /**
   * Call this function to receive a callback with the plugin if and after the specified plugin
   * has been applied. This is used to tap hooks on another plugin.
   *
   * @public
   */
  public readonly requestAccessToPluginByName: RequestAccessToPluginByNameCallback;

  /**
   * If set to true, the build is running with the --debug flag
   *
   * @public
   */
  public get debugMode(): boolean {
    return this._options.getIsDebugMode();
  }

  /**
   * @internal
   */
  public constructor(options: IHeftLifecycleSessionOptions) {
    this._options = options;
    this.logger = options.logger;
    this.metricsCollector = options.metricsCollector;
    this.hooks = options.lifecycleHooks;
    this.parametersByLongName = options.parametersByLongName;

    // Guranteed to be unique since phases are forbidden from using the name 'lifecycle'
    // and lifecycle plugin names are enforced to be unique.
    const uniquePluginFolderName: string = `lifecycle.${options.pluginDefinition.pluginName}`;

    // <projectFolder>/.cache/<phaseName>.<taskName>
    this.cacheFolder = path.join(options.heftConfiguration.cacheFolder, uniquePluginFolderName);

    // <projectFolder>/temp/<phaseName>.<taskName>
    this.tempFolder = path.join(options.heftConfiguration.tempFolder, uniquePluginFolderName);

    this.requestAccessToPluginByName = options.requestAccessToPluginByName;
  }
}
