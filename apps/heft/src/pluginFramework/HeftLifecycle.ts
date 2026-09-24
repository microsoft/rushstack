// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

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
import type {
  HeftLifecycleSession,
  IHeftLifecycleCleanHookOptions,
  IHeftLifecycleHooks,
  IHeftLifecycleToolStartHookOptions,
  IHeftLifecycleToolFinishHookOptions,
  IHeftLifecycleSession,
  IHeftTaskStartHookOptions,
  IHeftTaskFinishHookOptions,
  IHeftPhaseStartHookOptions,
  IHeftPhaseFinishHookOptions
} from './HeftLifecycleSession';
import type { ScopedLogger } from './logging/ScopedLogger';
import { createAsyncParallelHook, createSyncHook, defineLazyProperty } from './TapableHooks';

export interface IHeftLifecycleContext {
  lifecycleSession?: HeftLifecycleSession;
  pluginOptions?: object;
}

export class HeftLifecycle extends HeftPluginHost {
  readonly #internalHeftSession: InternalHeftSession;
  readonly #lifecyclePluginSpecifiers: IHeftConfigurationJsonPluginSpecifier[];
  readonly #lifecycleHooks: IHeftLifecycleHooks;
  readonly #lifecycleContextByDefinition: Map<HeftLifecyclePluginDefinition, IHeftLifecycleContext> =
    new Map();
  readonly #lifecyclePluginsByDefinition: Map<
    HeftLifecyclePluginDefinition,
    IHeftLifecyclePlugin<object | void>
  > = new Map();
  #lifecycleLogger: ScopedLogger | undefined;

  #isInitialized: boolean = false;

  public get hooks(): IHeftLifecycleHooks {
    return this.#lifecycleHooks;
  }

  public get pluginDefinitions(): Iterable<HeftLifecyclePluginDefinition> {
    if (!this.#isInitialized) {
      throw new InternalError(
        'HeftLifecycle.ensureInitializedAsync() must be called before accessing HeftLifecycle.pluginDefinitions.'
      );
    }
    return this.#lifecycleContextByDefinition.keys();
  }

  public constructor(
    internalHeftSession: InternalHeftSession,
    lifecyclePluginSpecifiers: IHeftConfigurationJsonPluginSpecifier[]
  ) {
    super();
    this.#internalHeftSession = internalHeftSession;
    this.#lifecyclePluginSpecifiers = lifecyclePluginSpecifiers;

    // The hooks are created on first access, since creating them requires loading tapable, which is not
    // needed if Heft exits without running the lifecycle (e.g. when printing help). The properties are
    // defined in the same order, with the same constructor arguments, as a plain object literal would have.
    const lifecycleHooks: IHeftLifecycleHooks = {} as IHeftLifecycleHooks;
    defineLazyProperty(lifecycleHooks, 'clean', () =>
      createAsyncParallelHook<IHeftLifecycleCleanHookOptions>()
    );
    defineLazyProperty(lifecycleHooks, 'toolStart', () =>
      createAsyncParallelHook<IHeftLifecycleToolStartHookOptions>()
    );
    defineLazyProperty(lifecycleHooks, 'toolFinish', () =>
      createAsyncParallelHook<IHeftLifecycleToolFinishHookOptions>()
    );
    defineLazyProperty(
      lifecycleHooks,
      'recordMetrics',
      () => internalHeftSession.metricsCollector.recordMetricsHook
    );
    defineLazyProperty(lifecycleHooks, 'taskStart', () =>
      createSyncHook<IHeftTaskStartHookOptions>(['task'])
    );
    defineLazyProperty(lifecycleHooks, 'taskFinish', () =>
      createSyncHook<IHeftTaskFinishHookOptions>(['task'])
    );
    defineLazyProperty(lifecycleHooks, 'phaseStart', () =>
      createSyncHook<IHeftPhaseStartHookOptions>(['phase'])
    );
    defineLazyProperty(lifecycleHooks, 'phaseFinish', () =>
      createSyncHook<IHeftPhaseFinishHookOptions>(['phase'])
    );
    this.#lifecycleHooks = lifecycleHooks;
  }

  protected async applyPluginsInternalAsync(): Promise<void> {
    await this.ensureInitializedAsync();

    // Load up all plugins concurrently
    const loadPluginPromises: Promise<IHeftLifecyclePlugin<object | void>>[] = [];
    for (const [pluginDefinition, lifecycleContext] of this.#lifecycleContextByDefinition) {
      if (!lifecycleContext.lifecycleSession) {
        // Generate the plugin-specific session. The session implementation is only loaded if there are
        // lifecycle plugins to apply.
        const { HeftLifecycleSession: HeftLifecycleSessionClass } = require('./HeftLifecycleSession') as {
          HeftLifecycleSession: typeof HeftLifecycleSession;
        };
        lifecycleContext.lifecycleSession = new HeftLifecycleSessionClass({
          debug: this.#internalHeftSession.debug,
          heftConfiguration: this.#internalHeftSession.heftConfiguration,
          loggingManager: this.#internalHeftSession.loggingManager,
          metricsCollector: this.#internalHeftSession.metricsCollector,
          logger: this.#internalHeftSession.loggingManager.requestScopedLogger(
            `lifecycle:${pluginDefinition.pluginName}`
          ),
          lifecycleHooks: this.hooks,
          lifecycleParameters:
            this.#internalHeftSession.parameterManager.getParametersForPlugin(pluginDefinition),
          pluginDefinition: pluginDefinition,
          pluginHost: this
        });
      }
      loadPluginPromises.push(
        this.#getLifecyclePluginForPluginDefinitionAsync(pluginDefinition, lifecycleContext.lifecycleSession)
      );
    }

    // Promise.all maintains the order of the input array
    const plugins: IHeftLifecyclePlugin<object | void>[] = await Promise.all(loadPluginPromises);

    // Iterate through and apply the plugins
    let pluginIndex: number = 0;
    for (const [pluginDefinition, lifecycleContext] of this.#lifecycleContextByDefinition) {
      const lifecyclePlugin: IHeftLifecyclePlugin<object | void> = plugins[pluginIndex++];
      try {
        // Apply the plugin. We know the session should exist because we generated it above.
        lifecyclePlugin.apply(
          lifecycleContext.lifecycleSession!,
          this.#internalHeftSession.heftConfiguration,
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
    for (const [pluginDefinition] of this.#lifecycleContextByDefinition) {
      const lifecyclePlugin: IHeftLifecyclePlugin<object | void> = plugins[pluginIndex++];
      this.resolvePluginAccessRequests(lifecyclePlugin, pluginDefinition);
    }
  }

  public async ensureInitializedAsync(pluginOptionsAreValidated: boolean = false): Promise<void> {
    if (!this.#isInitialized) {
      this.#isInitialized = true;

      // Load up all plugin configurations concurrently
      const pluginConfigurationPromises: Promise<HeftPluginConfiguration>[] = [];
      for (const pluginSpecifier of this.#lifecyclePluginSpecifiers) {
        const { pluginPackageRoot, pluginPackage } = pluginSpecifier;
        pluginConfigurationPromises.push(
          HeftPluginConfiguration.loadFromPackageAsync(pluginPackageRoot, pluginPackage)
        );
      }

      // Promise.all maintains the order of the input array
      const pluginConfigurations: HeftPluginConfiguration[] = await Promise.all(pluginConfigurationPromises);

      // Iterate through and generate the lifecycle context for each plugin
      let pluginConfigurationIndex: number = 0;
      for (const pluginSpecifier of this.#lifecyclePluginSpecifiers) {
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
        if (this.#lifecycleContextByDefinition.has(pluginDefinition)) {
          throw new Error(
            `Lifecycle plugin ${JSON.stringify(pluginDefinition.pluginName)} from package ` +
              `${JSON.stringify(pluginSpecifier.pluginPackage)} cannot be specified more than once.`
          );
        }

        // Validate the plugin options
        const pluginOptions: object | undefined = pluginSpecifier.options;
        if (!pluginOptionsAreValidated) {
          pluginDefinition.validateOptions(pluginOptions);
        }

        // Partially populate the context. The session will be populated while applying the plugins.
        const lifecycleContext: IHeftLifecycleContext = { pluginOptions };
        this.#lifecycleContextByDefinition.set(pluginDefinition, lifecycleContext);
      }
    }
  }

  public get lifecycleLogger(): ScopedLogger {
    let logger: ScopedLogger | undefined = this.#lifecycleLogger;
    if (!logger) {
      logger = this.#internalHeftSession.loggingManager.requestScopedLogger(`lifecycle`);
      this.#lifecycleLogger = logger;
    }
    return logger;
  }

  public async getSessionForPluginDefinitionAsync(
    pluginDefinition: HeftLifecyclePluginDefinition
  ): Promise<IHeftLifecycleSession> {
    await this.ensureInitializedAsync();
    const lifecycleContext: IHeftLifecycleContext | undefined =
      this.#lifecycleContextByDefinition.get(pluginDefinition);
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

  async #getLifecyclePluginForPluginDefinitionAsync(
    pluginDefinition: HeftLifecyclePluginDefinition,
    lifecycleSession: IHeftLifecycleSession
  ): Promise<IHeftLifecyclePlugin<object | void>> {
    let lifecyclePlugin: IHeftPlugin<HeftLifecycleSession, object | void> | undefined =
      this.#lifecyclePluginsByDefinition.get(pluginDefinition);
    if (!lifecyclePlugin) {
      lifecyclePlugin = await pluginDefinition.loadPluginAsync(lifecycleSession.logger);
      this.#lifecyclePluginsByDefinition.set(pluginDefinition, lifecyclePlugin);
    }
    return lifecyclePlugin;
  }
}
