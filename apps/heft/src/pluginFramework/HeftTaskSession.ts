// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { AsyncParallelHook } from 'tapable';
import type { CommandLineParameter } from '@rushstack/ts-command-line';

import type { MetricsCollector } from '../metrics/MetricsCollector';
import type { ScopedLogger } from './logging/ScopedLogger';
import type { HeftTask } from './HeftTask';
import type { IHeftPhaseSessionOptions } from './HeftPhaseSession';
import type { RequestAccessToPluginByNameCallback } from './HeftPluginHost';

/**
 * @public
 */
export interface IHeftTaskHookOptions {
  production: boolean;
}

/**
 * @public
 */
export interface IIHeftTaskCleanHookOptions extends IHeftTaskHookOptions {}

/**
 * @public
 */
export interface IHeftTaskRunHookOptions extends IHeftTaskHookOptions {}

/**
 * @public
 */
export interface IHeftTaskHooks {
  clean: AsyncParallelHook<IIHeftTaskCleanHookOptions>;
  run: AsyncParallelHook<IHeftTaskRunHookOptions>;
}

/**
 * @internal
 */
export interface IHeftTaskSessionOptions extends IHeftPhaseSessionOptions {
  logger: ScopedLogger;
  task: HeftTask;
  taskHooks: IHeftTaskHooks;
  parametersByLongName: ReadonlyMap<string, CommandLineParameter>;
  requestAccessToPluginByName: RequestAccessToPluginByNameCallback;
}

/**
 * @public
 */
export class HeftTaskSession {
  private _options: IHeftTaskSessionOptions;

  /**
   * @public
   */
  public readonly taskName: string;

  /**
   * @public
   */
  public readonly hooks: IHeftTaskHooks;

  /**
   * @public
   */
  public readonly parametersByLongName: ReadonlyMap<string, CommandLineParameter>;

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
  public constructor(options: IHeftTaskSessionOptions) {
    this._options = options;
    this.logger = options.logger;
    this.metricsCollector = options.metricsCollector;
    this.taskName = options.task.taskName;
    this.hooks = options.taskHooks;
    this.parametersByLongName = options.parametersByLongName;

    this.requestAccessToPluginByName = options.requestAccessToPluginByName;
  }
}
