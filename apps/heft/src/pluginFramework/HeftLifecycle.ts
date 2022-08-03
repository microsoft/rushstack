// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AsyncParallelHook } from 'tapable';
import { InternalError } from '@rushstack/node-core-library';

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

export interface IHeftLifecycleContext {
  lifecycleSession: HeftLifecycleSession;
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
      toolStop: new AsyncParallelHook<IHeftLifecycleToolStopHookOptions>(),
      recordMetrics: internalHeftSession.metricsCollector.recordMetricsHook
    };
  }

  public async applyPluginsAsync(): Promise<void> {
    await this.ensureInitializedAsync();

    // Load up all plugins concurrently
    const loadPluginPromises: Promise<IHeftLifecyclePlugin<object | void>>[] = [];
    for (const [pluginDefinition] of this._lifecycleContextByDefinition) {
      loadPluginPromises.push(this._getLifecyclePluginForPluginDefinitionAsync(pluginDefinition));
    }

    // Promise.all maintains the order of the input array
    const plugins: IHeftLifecyclePlugin<object | void>[] = await Promise.all(loadPluginPromises);

    // Iterate through and apply the plugins
    let pluginIndex: number = 0;
    for (const [pluginDefinition, lifecycleContext] of this._lifecycleContextByDefinition) {
      const lifecyclePlugin: IHeftLifecyclePlugin<object | void> = plugins[pluginIndex++];
      try {
        lifecyclePlugin.apply(
          lifecycleContext.lifecycleSession,
          this._internalHeftSession.heftConfiguration,
          lifecycleContext.pluginOptions
        );
      } catch (error) {
        throw new Error(
          `Error applying plugin "${pluginDefinition.pluginName}" from package ` +
            `"${pluginDefinition.pluginPackageName}": ${error}`
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
        const pluginDefinition: HeftLifecyclePluginDefinition =
          pluginConfiguration.getPluginDefinitionBySpecifier(pluginSpecifier);

        // Ensure the plugin is a lifecycle plugin
        if (!pluginConfiguration.lifecyclePluginDefinitions.has(pluginDefinition)) {
          throw new Error(
            `Plugin "${pluginDefinition.pluginName}" from package "${pluginSpecifier.pluginPackage}" ` +
              'is not a lifecycle plugin.'
          );
        }

        // Ensure there are no duplicate plugin names within the same package
        if (this._lifecycleContextByDefinition.has(pluginDefinition)) {
          throw new Error(
            `Lifecycle plugin "${pluginDefinition.pluginName}" from package ` +
              `"${pluginSpecifier.pluginPackage}" cannot be specified more than once.`
          );
        }

        // Generate the plugin-specific session
        const lifecycleSession: HeftLifecycleSession = new HeftLifecycleSession({
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
          debug: this._internalHeftSession.debug,
          pluginHost: this
        });
        const pluginOptions: object | undefined = pluginSpecifier.options;

        // Set the context
        const lifecycleContext: IHeftLifecycleContext = { lifecycleSession, pluginOptions };
        this._lifecycleContextByDefinition.set(pluginDefinition, lifecycleContext);
      }
    }
  }

  public async getContextForPluginDefinitionAsync(
    pluginDefinition: HeftLifecyclePluginDefinition
  ): Promise<IHeftLifecycleContext> {
    await this.ensureInitializedAsync();
    const lifecycleContext: IHeftLifecycleContext | undefined =
      this._lifecycleContextByDefinition.get(pluginDefinition);
    if (!lifecycleContext) {
      throw new InternalError(
        `Could not find lifecycle context for plugin "${pluginDefinition.pluginName}".`
      );
    }
    return lifecycleContext;
  }

  private async _getLifecyclePluginForPluginDefinitionAsync(
    pluginDefinition: HeftLifecyclePluginDefinition
  ): Promise<IHeftLifecyclePlugin<object | void>> {
    let lifecyclePlugin: IHeftPlugin<HeftLifecycleSession, object | void> | undefined =
      this._lifecyclePluginsByDefinition.get(pluginDefinition);
    if (!lifecyclePlugin) {
      // Need to obtain the plugin logger from the session
      const lifecycleContext: IHeftLifecycleContext = await this.getContextForPluginDefinitionAsync(
        pluginDefinition
      );
      lifecyclePlugin = await pluginDefinition.loadPluginAsync(lifecycleContext.lifecycleSession.logger);
      this._lifecyclePluginsByDefinition.set(pluginDefinition, lifecyclePlugin);
    }
    return lifecyclePlugin;
  }
}
