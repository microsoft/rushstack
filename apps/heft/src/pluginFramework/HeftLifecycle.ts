// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AsyncParallelHook } from 'tapable';
import { Async, InternalError } from '@rushstack/node-core-library';

import { Constants } from '../utilities/Constants';
import { HeftPluginConfiguration } from '../configuration/HeftPluginConfiguration';
import { HeftPluginHost } from './HeftPluginHost';
import type { InternalHeftSession } from './InternalHeftSession';
import type { IHeftConfigurationJsonPluginSpecifier } from '../utilities/CoreConfigFiles';
import type { HeftLifecyclePluginDefinition } from '../configuration/HeftPluginDefinition';
import type { IHeftLifecyclePlugin, IHeftPlugin } from './IHeftPlugin';
import {
  HeftLifecycleSession,
  type IHeftLifecycleCleanHookOptions,
  type IHeftLifecycleHooks,
  type IHeftLifecycleToolStartHookOptions,
  type IHeftLifecycleToolStopHookOptions
} from './HeftLifecycleSession';

/**
 * @internal
 */
export class HeftLifecycle extends HeftPluginHost {
  private _internalHeftSession: InternalHeftSession;
  private _lifecyclePluginSpecifiers: IHeftConfigurationJsonPluginSpecifier[];
  private _lifecycleHooks: IHeftLifecycleHooks;

  private _lifecyclePluginDefinitions: Set<HeftLifecyclePluginDefinition> | undefined;
  private _lifecyclePluginOptionsByDefinition: Map<HeftLifecyclePluginDefinition, object | undefined> =
    new Map();
  private _lifecyclePluginsByDefinition: Map<
    HeftLifecyclePluginDefinition,
    IHeftLifecyclePlugin<object | void>
  > = new Map();
  private _lifecycleSessionsByDefinition: Map<HeftLifecyclePluginDefinition, HeftLifecycleSession> =
    new Map();

  /**
   * @beta
   */
  public get hooks(): IHeftLifecycleHooks {
    return this._lifecycleHooks;
  }

  /**
   * @beta
   */
  public get pluginDefinitions(): Set<HeftLifecyclePluginDefinition> {
    if (!this._lifecyclePluginDefinitions) {
      throw new InternalError(
        'HeftLifecycle.ensureInitializedAsync() must be called before accessing HeftLifecycle.pluginDefinitions.'
      );
    }
    return this._lifecyclePluginDefinitions;
  }

  /**
   * @internal
   */
  public constructor(
    internalHeftSession: InternalHeftSession,
    lifecyclePluginSpecifiers: IHeftConfigurationJsonPluginSpecifier[]
  ) {
    super();
    this._internalHeftSession = internalHeftSession;
    this._lifecyclePluginSpecifiers = lifecyclePluginSpecifiers;

    this._lifecycleHooks = {
      clean: new AsyncParallelHook<IHeftLifecycleCleanHookOptions>(),
      toolStart: new AsyncParallelHook<IHeftLifecycleToolStartHookOptions>(),
      toolStop: new AsyncParallelHook<IHeftLifecycleToolStopHookOptions>(),
      recordMetrics: internalHeftSession.metricsCollector.recordMetricsHook
    };
  }

  /**
   * @beta
   */
  public async ensureInitializedAsync(): Promise<void> {
    if (!this._lifecyclePluginDefinitions) {
      this._lifecyclePluginDefinitions = new Set();
      await Async.forEachAsync(
        this._lifecyclePluginSpecifiers,
        async (pluginSpecifier: IHeftConfigurationJsonPluginSpecifier) => {
          const pluginConfiguration: HeftPluginConfiguration =
            await HeftPluginConfiguration.loadFromPackageAsync(
              pluginSpecifier.pluginPackageRoot,
              pluginSpecifier.pluginPackage
            );
          const pluginDefinition: HeftLifecyclePluginDefinition =
            pluginConfiguration.getPluginDefinitionBySpecifier(pluginSpecifier);
          if (!pluginConfiguration.lifecyclePluginDefinitions.has(pluginDefinition)) {
            throw new Error(
              `Plugin "${pluginDefinition.pluginName}" from package "${pluginSpecifier.pluginPackage}" ` +
                'is not a lifecycle plugin.'
            );
          }
          if (this._lifecyclePluginDefinitions!.has(pluginDefinition)) {
            throw new Error(
              `Plugin "${pluginDefinition.pluginName}" from package "${pluginSpecifier.pluginPackage}" ` +
                'cannot be specified more than once.'
            );
          }
          this._lifecyclePluginDefinitions!.add(pluginDefinition);
          this._lifecyclePluginOptionsByDefinition.set(pluginDefinition, pluginSpecifier.options);
        },
        { concurrency: Constants.maxParallelism }
      );
    }
  }

  public async applyPluginsAsync(): Promise<void> {
    await this.ensureInitializedAsync();
    await Async.forEachAsync(
      this.pluginDefinitions,
      async (pluginDefinition: HeftLifecyclePluginDefinition) => {
        try {
          const lifecycleSession: HeftLifecycleSession = this.getSessionForPluginDefinition(pluginDefinition);
          const lifecyclePlugin: IHeftLifecyclePlugin<object | void> =
            await this._getLifecyclePluginForPluginDefinitionAsync(pluginDefinition);
          const pluginOptions: object | undefined =
            this._lifecyclePluginOptionsByDefinition.get(pluginDefinition);
          lifecyclePlugin.apply(lifecycleSession, this._internalHeftSession.heftConfiguration, pluginOptions);
        } catch (error) {
          throw new Error(
            `Error applying plugin "${pluginDefinition.pluginName}" from package ` +
              `"${pluginDefinition.pluginPackageName}": ${error}`
          );
        }
      },
      { concurrency: Constants.maxParallelism }
    );

    // Do a second pass to apply the plugin hooks that were requested by plugins
    await Async.forEachAsync(
      this.pluginDefinitions,
      async (pluginDefinition: HeftLifecyclePluginDefinition) => {
        const lifecyclePlugin: IHeftLifecyclePlugin<object | void> =
          await this._getLifecyclePluginForPluginDefinitionAsync(pluginDefinition);
        await this.applyPluginHooksAsync(lifecyclePlugin, pluginDefinition);
      },
      { concurrency: Constants.maxParallelism }
    );
  }

  public getSessionForPluginDefinition(
    pluginDefinition: HeftLifecyclePluginDefinition
  ): HeftLifecycleSession {
    let lifecycleSession: HeftLifecycleSession | undefined =
      this._lifecycleSessionsByDefinition.get(pluginDefinition);
    if (!lifecycleSession) {
      lifecycleSession = new HeftLifecycleSession({
        heftConfiguration: this._internalHeftSession.heftConfiguration,
        loggingManager: this._internalHeftSession.loggingManager,
        metricsCollector: this._internalHeftSession.metricsCollector,
        logger: this._internalHeftSession.loggingManager.requestScopedLogger(
          `lifecycle:${pluginDefinition.pluginName}`
        ),
        lifecycleHooks: this.hooks,
        parametersByLongName:
          this._internalHeftSession.parameterManager.getParametersForPlugin(pluginDefinition),
        pluginDefinition: pluginDefinition,
        getIsDebugMode: () => this._internalHeftSession.debugMode,
        requestAccessToPluginByName: this.getRequestAccessToPluginByNameFn(
          this.getPluginHookName(pluginDefinition.pluginPackageName, pluginDefinition.pluginName)
        )
      });
      this._lifecycleSessionsByDefinition.set(pluginDefinition, lifecycleSession);
    }
    return lifecycleSession;
  }

  private async _getLifecyclePluginForPluginDefinitionAsync(
    pluginDefinition: HeftLifecyclePluginDefinition
  ): Promise<IHeftLifecyclePlugin<object | void>> {
    let lifecyclePlugin: IHeftPlugin<HeftLifecycleSession, object | void> | undefined =
      this._lifecyclePluginsByDefinition.get(pluginDefinition);
    if (!lifecyclePlugin) {
      const lifecycleSession: HeftLifecycleSession = this.getSessionForPluginDefinition(pluginDefinition);
      lifecyclePlugin = await pluginDefinition.loadPluginAsync(lifecycleSession.logger);
      this._lifecyclePluginsByDefinition.set(pluginDefinition, lifecyclePlugin);
    }
    return lifecyclePlugin;
  }
}
