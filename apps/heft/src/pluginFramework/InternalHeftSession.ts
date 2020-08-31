// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SyncHook } from 'tapable';

import { IHeftPlugin } from './IHeftPlugin';
import { HeftSession } from './HeftSession';
import { BuildStage } from '../stages/BuildStage';
import { CleanStage } from '../stages/CleanStage';
import { DevDeployStage } from '../stages/DevDeployStage';
import { TestStage } from '../stages/TestStage';
import { MetricsCollector } from '../metrics/MetricsCollector';
import { LoggingManager } from './logging/LoggingManager';

/**
 * @internal
 */
export interface IInternalHeftSessionOptions {
  buildStage: BuildStage;
  cleanStage: CleanStage;
  devDeployStage: DevDeployStage;
  testStage: TestStage;

  metricsCollector: MetricsCollector;
  loggingManager: LoggingManager;
  getIsDebugMode(): boolean;
}

/**
 * @internal
 */
export class InternalHeftSession {
  private readonly _options: IInternalHeftSessionOptions;
  private _pluginHooks: Map<IHeftPlugin, SyncHook<IHeftPlugin>> = new Map<
    IHeftPlugin,
    SyncHook<IHeftPlugin>
  >();

  public constructor(options: IInternalHeftSessionOptions) {
    this._options = options;
  }

  public getSessionForPlugin(thisPlugin: IHeftPlugin): HeftSession {
    return new HeftSession(
      {
        plugin: thisPlugin,
        applyForPluginCallback: <TPlugin extends IHeftPlugin>(
          pluginToTap: TPlugin,
          pluginApplyFn: (plugin: TPlugin) => void
        ) => {
          let pluginHook: SyncHook<TPlugin> | undefined = this._pluginHooks.get(pluginToTap) as
            | SyncHook<TPlugin>
            | undefined;
          if (!pluginHook) {
            pluginHook = new SyncHook(['plugin']);
            this._pluginHooks.set(pluginToTap, pluginHook);
          }

          pluginHook.tap(thisPlugin.displayName, pluginApplyFn);
        }
      },
      this._options
    );
  }

  public applyPluginHooks<THeftPlugin extends IHeftPlugin>(plugin: THeftPlugin): void {
    const pluginHook: SyncHook<THeftPlugin> | undefined = this._pluginHooks.get(plugin) as
      | SyncHook<THeftPlugin>
      | undefined;
    if (pluginHook) {
      pluginHook.call(plugin);
    }
  }
}
