// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import type { AsyncParallelHook } from 'tapable';

import type { IHeftRecordMetricsHookOptions, MetricsCollector } from '../metrics/MetricsCollector';
import type { ScopedLogger, IScopedLogger } from './logging/ScopedLogger';
import type { IInternalHeftSessionOptions } from './InternalHeftSession';
import type { IHeftParameters } from './HeftParameterManager';
import type { IDeleteOperation } from '../plugins/DeleteFilesPlugin';
import type { HeftPluginDefinitionBase } from '../configuration/HeftPluginDefinition';
import type { HeftPluginHost } from './HeftPluginHost';

/**
 * The lifecycle session is responsible for providing session-specific information to Heft lifecycle
 * plugins. The session provides access to the hooks that Heft will run as part of lifecycle execution,
 * as well as access to parameters provided via the CLI. The session is also how you request access to
 * other lifecycle plugins.
 *
 * @public
 */
export interface IHeftLifecycleSession {
  /**
   * The hooks available to the lifecycle plugin.
   *
   * @public
   */
  readonly hooks: IHeftLifecycleHooks;

  /**
   * Contains default parameters provided by Heft, as well as CLI parameters requested by the lifecycle
   * plugin.
   *
   * @public
   */
  readonly parameters: IHeftParameters;

  /**
   * The cache folder for the lifecycle plugin. This folder is unique for each lifecycle plugin,
   * and will not be cleaned when Heft is run with `--clean`. However, it will be cleaned when
   * Heft is run with `--clean` and `--clean-cache`.
   *
   * @public
   */
  readonly cacheFolder: string;

  /**
   * The temp folder for the lifecycle plugin. This folder is unique for each lifecycle plugin,
   * and will be cleaned when Heft is run with `--clean`.
   *
   * @public
   */
  readonly tempFolder: string;

  /**
   * The scoped logger for the lifecycle plugin. Messages logged with this logger will be prefixed
   * with the plugin name, in the format "[lifecycle:<pluginName>]". It is highly recommended that
   * writing to the console be performed via the logger, as it will ensure that logging messages
   * are labeled with the source of the message.
   *
   * @public
   */
  readonly logger: IScopedLogger;

  /**
   * Set a a callback which will be called if and after the specified plugin has been applied.
   * This can be used to tap hooks on another lifecycle plugin that exists within the same phase.
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
 * Hooks that are available to the lifecycle plugin.
 *
 * @public
 */
export interface IHeftLifecycleHooks {
  /**
   * The `clean` hook is called at the beginning of Heft execution. It can be used to clean up
   * any files or folders that may be produced by the plugin. To use it, call
   * `clean.tapPromise(<pluginName>, <callback>)`.
   *
   * @public
   */
  clean: AsyncParallelHook<IHeftLifecycleCleanHookOptions>;

  /**
   * The `toolStart` hook is called at the beginning of Heft execution, after the `clean` hook. It is
   * called before any phases have begun to execute. To use it, call
   * `toolStart.tapPromise(<pluginName>, <callback>)`.
   *
   * @public
   */
  toolStart: AsyncParallelHook<IHeftLifecycleToolStartHookOptions>;

  /**
   * The `toolStart` hook is called at the end of Heft execution, after the `clean` hook. It is
   * called before any phases have begun to execute. To use it, call
   * `toolStart.tapPromise(<pluginName>, <callback>)`.
   *
   * @public
   */
  toolStop: AsyncParallelHook<IHeftLifecycleToolStopHookOptions>;

  // TODO: Wire up and document this hook.
  recordMetrics: AsyncParallelHook<IHeftRecordMetricsHookOptions>;
}

/**
 * Options provided to the clean hook.
 *
 * @public
 */
export interface IHeftLifecycleCleanHookOptions {
  /**
   * Add delete operations, which will be performed at the beginning of Heft execution.
   *
   * @public
   */
  addDeleteOperations: (...deleteOperations: IDeleteOperation[]) => void;
}

/**
 * Options provided to the toolStart hook.
 *
 * @public
 */
export interface IHeftLifecycleToolStartHookOptions {}

/**
 * Options provided to the toolStop hook.
 *
 * @public
 */
export interface IHeftLifecycleToolStopHookOptions {}

export interface IHeftLifecycleSessionOptions extends IInternalHeftSessionOptions {
  logger: ScopedLogger;
  lifecycleHooks: IHeftLifecycleHooks;
  lifecycleParameters: IHeftParameters;
  pluginDefinition: HeftPluginDefinitionBase;
  pluginHost: HeftPluginHost;
}

export class HeftLifecycleSession implements IHeftLifecycleSession {
  private _options: IHeftLifecycleSessionOptions;
  private _pluginHost: HeftPluginHost;

  public readonly hooks: IHeftLifecycleHooks;
  public readonly parameters: IHeftParameters;
  public readonly cacheFolder: string;
  public readonly tempFolder: string;
  public readonly logger: IScopedLogger;

  public get debugMode(): boolean {
    return this._options.debug;
  }

  /**
   * @internal
   */
  public readonly metricsCollector: MetricsCollector;

  public constructor(options: IHeftLifecycleSessionOptions) {
    this._options = options;
    this.logger = options.logger;
    this.metricsCollector = options.metricsCollector;
    this.hooks = options.lifecycleHooks;
    this.parameters = options.lifecycleParameters;

    // Guranteed to be unique since phases are forbidden from using the name 'lifecycle'
    // and lifecycle plugin names are enforced to be unique.
    const uniquePluginFolderName: string = `lifecycle.${options.pluginDefinition.pluginName}`;

    // <projectFolder>/.cache/<phaseName>.<taskName>
    this.cacheFolder = path.join(options.heftConfiguration.cacheFolder, uniquePluginFolderName);

    // <projectFolder>/temp/<phaseName>.<taskName>
    this.tempFolder = path.join(options.heftConfiguration.tempFolder, uniquePluginFolderName);

    this._pluginHost = options.pluginHost;
  }

  public requestAccessToPluginByName<T extends object>(
    pluginToAccessPackage: string,
    pluginToAccessName: string,
    pluginApply: (pluginAccessor: T) => void
  ): void {
    const { pluginPackageName, pluginName } = this._options.pluginDefinition;
    const pluginHookName: string = this._pluginHost.getPluginHookName(pluginPackageName, pluginName);
    this._pluginHost.requestAccessToPluginByName(
      pluginHookName,
      pluginToAccessPackage,
      pluginToAccessName,
      pluginApply
    );
  }
}
