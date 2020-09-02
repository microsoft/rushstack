// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SyncHook } from 'tapable';

import { MetricsCollector, MetricsCollectorHooks } from '../metrics/MetricsCollector';
import { ICleanStageContext } from '../stages/CleanStage';
import { IBuildStageContext } from '../stages/BuildStage';
import { ITestStageContext } from '../stages/TestStage';
import { IHeftPlugin } from './IHeftPlugin';
import { IInternalHeftSessionOptions } from './InternalHeftSession';
import { ScopedLogger } from './logging/ScopedLogger';
import { LoggingManager } from './logging/LoggingManager';
import { ICustomActionOptions } from '../cli/actions/CustomAction';

/** @beta */
export type RegisterAction = <TParameters>(action: ICustomActionOptions<TParameters>) => void;

/**
 * @public
 */
export interface IHeftSessionHooks {
  metricsCollector: MetricsCollectorHooks;

  build: SyncHook<IBuildStageContext>;
  clean: SyncHook<ICleanStageContext>;
  test: SyncHook<ITestStageContext>;
}

export interface IHeftSessionOptions {
  plugin: IHeftPlugin;

  /**
   * @beta
   */
  requestAccessToPluginByName: RequestAccessToPluginByNameCallback;
}

/**
 * @beta
 */
export type RequestAccessToPluginByNameCallback = (
  pluginToAccessName: string,
  pluginApply: (pluginAccessor: object) => void
) => void;

/**
 * @public
 */
export class HeftSession {
  private readonly _loggingManager: LoggingManager;
  private readonly _options: IHeftSessionOptions;

  public readonly hooks: IHeftSessionHooks;

  /**
   * @internal
   */
  public readonly metricsCollector: MetricsCollector;

  /**
   * If set to true, the build is running with the --debug flag
   */
  public readonly debugMode: boolean;

  /** @beta */
  public readonly registerAction: RegisterAction;

  /**
   * Call this function to receive a callback with the plugin if and after the specified plugin
   * has been applied. This is used to tap hooks on another plugin.
   *
   * @beta
   */
  public readonly requestAccessToPluginByName: RequestAccessToPluginByNameCallback;

  /**
   * @internal
   */
  public constructor(options: IHeftSessionOptions, internalSessionOptions: IInternalHeftSessionOptions) {
    this._options = options;

    this._loggingManager = internalSessionOptions.loggingManager;
    this.metricsCollector = internalSessionOptions.metricsCollector;
    this.registerAction = internalSessionOptions.registerAction;

    this.hooks = {
      metricsCollector: this.metricsCollector.hooks,

      build: internalSessionOptions.buildStage.stageInitializationHook,
      clean: internalSessionOptions.cleanStage.stageInitializationHook,
      test: internalSessionOptions.testStage.stageInitializationHook
    };

    this.debugMode = internalSessionOptions.getIsDebugMode();

    this.requestAccessToPluginByName = options.requestAccessToPluginByName;
  }

  /**
   * Call this function to request a logger with the specified name.
   */
  public requestScopedLogger(loggerName: string): ScopedLogger {
    return this._loggingManager.requestScopedLogger(this._options.plugin, loggerName);
  }
}
