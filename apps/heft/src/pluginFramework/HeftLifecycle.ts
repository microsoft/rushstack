// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AsyncParallelHook, SyncHook } from 'tapable';
import { InternalError } from '@rushstack/node-core-library';

import { HeftPluginConfiguration } from '../configuration/HeftPluginConfiguration';
import { HeftPluginHost } from './HeftPluginHost';
import type { InternalHeftSession } from './InternalHeftSession';
import type { IHeftConfigurationJsonPluginSpecifier } from '../utilities/CoreConfigFiles';
import type {
  HeftLifecyclePluginDefinition,
  HeftPluginDefinitionBase
} from '../configuration/HeftPluginDefinition';
import type { IHeftLifecyclePlugin, IHeftPlugin } from './IHeftPlugin';
import {
  HeftLifecycleSession,
  type IHeftLifecycleCleanHookOptions,
  type IHeftLifecycleHooks,
  type IHeftLifecycleToolStartHookOptions,
  type IHeftLifecycleToolFinishHookOptions,
  type IHeftLifecycleSession,
  type IHeftTaskStartHookOptions,
  type IHeftTaskFinishHookOptions,
  type IHeftPhaseStartHookOptions,
  type IHeftPhaseFinishHookOptions
} from './HeftLifecycleSession';
import type { ScopedLogger } from './logging/ScopedLogger';

export interface IHeftLifecycleContext {
  lifecycleSession?: HeftLifecycleSession;
  pluginOptions?: object;
}

export class HeftLifecycle extends HeftPluginHost {
  private readonly _internalHeftSession: InternalHeftSession;
  private readonly _lifecyclePluginSpecifiers: IHeftConfigurationJsonPluginSpecifier[];
  private readonly _lifecycleHooks: IHeftLifecycleHooks;
  private readonly _lifecycleContextByDefinition: Map<HeftLifecyclePluginDefinition, IHeftLifecycleContext> =
    new Map();
  private readonly _lifecyclePluginsByDefinition: Map<
    HeftLifecyclePluginDefinition,
    IHeftLifecyclePlugin<object | void>
  > = new Map();
  private _lifecycleLogger: ScopedLogger | undefined;

  private _isInitialized: boolean = false;

  public get hooks(): IHeftLifecycleHooks {
    return this._lifecycleHooks;
  }

  public get pluginDefinitions(): Iterable<HeftLifecyclePluginDefinition> {
    if (!this._isInitialized) {
      throw new InternalError(
        'HeftLifecycle.ensureInitializedAsync() must be called before accessing HeftLifecycle.pluginDefinitions.'
      );
    }
    return this._lifecycleContextByDefinition.keys();
  }

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
      toolFinish: new AsyncParallelHook<IHeftLifecycleToolFinishHookOptions>(),
      recordMetrics: internalHeftSession.metricsCollector.recordMetricsHook,
      taskStart: new SyncHook<IHeftTaskStartHookOptions>(['task']),
      taskFinish: new SyncHook<IHeftTaskFinishHookOptions>(['task']),
      phaseStart: new SyncHook<IHeftPhaseStartHookOptions>(['phase']),
      phaseFinish: new SyncHook<IHeftPhaseFinishHookOptions>(['phase'])
    };
  }

  protected async applyPluginsInternalAsync(): Promise<void> {
    await this.ensureInitializedAsync();

    // Load up all plugins concurrently
    const loadPluginPromises: Promise<IHeftLifecyclePlugin<object | void>>[] = [];
    for (const [pluginDefinition, lifecycleContext] of this._lifecycleContextByDefinition) {
      if (!lifecycleContext.lifecycleSession) {
        // Generate the plugin-specific session
        lifecycleContext.lifecycleSession = new HeftLifecycleSession({
          debug: this._internalHeftSession.debug,
          heftConfiguration: this._internalHeftSession.heftConfiguration,
          loggingManager: this._internalHeftSession.loggingManager,
          metricsCollector: this._internalHeftSession.metricsCollector,
          logger: this._internalHeftSession.loggingManager.requestScopedLogger(
            `lifecycle:${pluginDefinition.pluginName}`
          ),
          lifecycleHooks: this.hooks,
          lifecycleParameters:
            this._internalHeftSession.parameterManager.getParametersForPlugin(pluginDefinition),
          pluginDefinition: pluginDefinition,
          pluginHost: this
        });
      }
      loadPluginPromises.push(
        this._getLifecyclePluginForPluginDefinitionAsync(pluginDefinition, lifecycleContext.lifecycleSession)
      );
    }

    // Promise.all maintains the order of the input array
    const plugins: IHeftLifecyclePlugin<object | void>[] = await Promise.all(loadPluginPromises);

    // Iterate through and apply the plugins
    let pluginIndex: number = 0;
    for (const [pluginDefinition, lifecycleContext] of this._lifecycleContextByDefinition) {
      const lifecyclePlugin: IHeftLifecyclePlugin<object | void> = plugins[pluginIndex++];
      try {
        // Apply the plugin. We know the session should exist because we generated it above.
        lifecyclePlugin.apply(
          lifecycleContext.lifecycleSession!,
          this._internalHeftSession.heftConfiguration,
          lifecycleContext.pluginOptions
        );
      } catch (error) {
        throw new Error(
          `Error applying plugin ${JSON.stringify(pluginDefinition.pluginName)} from package ` +
            `${JSON.stringify(pluginDefinition.pluginPackageName)}: ${error}`
        );
      }
    }

    // Do a second pass to apply the plugin access requests for each plugin
    pluginIndex = 0;
    for (const [pluginDefinition] of this._lifecycleContextByDefinition) {
      const lifecyclePlugin: IHeftLifecyclePlugin<object | void> = plugins[pluginIndex++];
      this.resolvePluginAccessRequests(lifecyclePlugin, pluginDefinition);
    }
  }

  public async ensureInitializedAsync(): Promise<void> {
    if (!this._isInitialized) {
      this._isInitialized = true;

      // Load up all plugin configurations concurrently
      const pluginConfigurationPromises: Promise<HeftPluginConfiguration>[] = [];
      for (const pluginSpecifier of this._lifecyclePluginSpecifiers) {
        const { pluginPackageRoot, pluginPackage } = pluginSpecifier;
        pluginConfigurationPromises.push(
          HeftPluginConfiguration.loadFromPackageAsync(pluginPackageRoot, pluginPackage)
        );
      }

      // Promise.all maintains the order of the input array
      const pluginConfigurations: HeftPluginConfiguration[] = await Promise.all(pluginConfigurationPromises);

      // Iterate through and generate the lifecycle context for each plugin
      let pluginConfigurationIndex: number = 0;
      for (const pluginSpecifier of this._lifecyclePluginSpecifiers) {
        const pluginConfiguration: HeftPluginConfiguration = pluginConfigurations[pluginConfigurationIndex++];
        const pluginDefinition: HeftPluginDefinitionBase =
          pluginConfiguration.getPluginDefinitionBySpecifier(pluginSpecifier);

        // Ensure the plugin is a lifecycle plugin
        const isLifecyclePlugin: boolean = pluginConfiguration.isLifecyclePluginDefinition(pluginDefinition);
        if (!isLifecyclePlugin) {
          throw new Error(
            `Plugin ${JSON.stringify(pluginDefinition.pluginName)} from package ` +
              `${JSON.stringify(pluginSpecifier.pluginPackage)} is not a lifecycle plugin.`
          );
        }

        // Ensure there are no duplicate plugin names within the same package
        if (this._lifecycleContextByDefinition.has(pluginDefinition)) {
          throw new Error(
            `Lifecycle plugin ${JSON.stringify(pluginDefinition.pluginName)} from package ` +
              `${JSON.stringify(pluginSpecifier.pluginPackage)} cannot be specified more than once.`
          );
        }

        // Validate the plugin options
        const pluginOptions: object | undefined = pluginSpecifier.options;
        pluginDefinition.validateOptions(pluginOptions);

        // Partially populate the context. The session will be populated while applying the plugins.
        const lifecycleContext: IHeftLifecycleContext = { pluginOptions };
        this._lifecycleContextByDefinition.set(pluginDefinition, lifecycleContext);
      }
    }
  }

  public get lifecycleLogger(): ScopedLogger {
    let logger: ScopedLogger | undefined = this._lifecycleLogger;
    if (!logger) {
      logger = this._internalHeftSession.loggingManager.requestScopedLogger(`lifecycle`);
      this._lifecycleLogger = logger;
    }
    return logger;
  }

  public async getSessionForPluginDefinitionAsync(
    pluginDefinition: HeftLifecyclePluginDefinition
  ): Promise<IHeftLifecycleSession> {
    await this.ensureInitializedAsync();
    const lifecycleContext: IHeftLifecycleContext | undefined =
      this._lifecycleContextByDefinition.get(pluginDefinition);
    if (!lifecycleContext) {
      throw new InternalError(
        `Could not find lifecycle context for plugin ${JSON.stringify(pluginDefinition.pluginName)}.`
      );
    }
    if (!lifecycleContext.lifecycleSession) {
      throw new InternalError(
        `Lifecycle session for plugin ${JSON.stringify(
          pluginDefinition.pluginName
        )} has not been created yet.`
      );
    }
    return lifecycleContext.lifecycleSession;
  }

  private async _getLifecyclePluginForPluginDefinitionAsync(
    pluginDefinition: HeftLifecyclePluginDefinition,
    lifecycleSession: IHeftLifecycleSession
  ): Promise<IHeftLifecyclePlugin<object | void>> {
    let lifecyclePlugin: IHeftPlugin<HeftLifecycleSession, object | void> | undefined =
      this._lifecyclePluginsByDefinition.get(pluginDefinition);
    if (!lifecyclePlugin) {
      lifecyclePlugin = await pluginDefinition.loadPluginAsync(lifecycleSession.logger);
      this._lifecyclePluginsByDefinition.set(pluginDefinition, lifecyclePlugin);
    }
    return lifecyclePlugin;
  }
}
