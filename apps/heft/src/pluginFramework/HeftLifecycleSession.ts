// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type { AsyncParallelHook, SyncHook } from 'tapable';

import type { Operation, OperationGroupRecord } from '@rushstack/operation-graph';

import type { IHeftRecordMetricsHookOptions, MetricsCollector } from '../metrics/MetricsCollector';
import type { ScopedLogger, IScopedLogger } from './logging/ScopedLogger';
import type { IInternalHeftSessionOptions } from './InternalHeftSession';
import type { IHeftParameters } from './HeftParameterManager';
import type { IDeleteOperation } from '../plugins/DeleteFilesPlugin';
import type { HeftPluginDefinitionBase } from '../configuration/HeftPluginDefinition';
import type { HeftPluginHost } from './HeftPluginHost';
import type { IHeftPhaseOperationMetadata, IHeftTaskOperationMetadata } from '../cli/HeftActionRunner';

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
   * The temp folder for the lifecycle plugin. This folder is unique for each lifecycle plugin,
   * and will be cleaned when Heft is run with `--clean`.
   *
   * @public
   */
  readonly tempFolderPath: string;

  /**
   * The scoped logger for the lifecycle plugin. Messages logged with this logger will be prefixed
   * with the plugin name, in the format `[lifecycle:<pluginName>]`. It is highly recommended that
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
 * @public
 */
export interface IHeftTaskStartHookOptions {
  operation: Operation<IHeftTaskOperationMetadata>;
}

/**
 * @public
 */
export interface IHeftTaskFinishHookOptions {
  operation: Operation<IHeftTaskOperationMetadata>;
}

/**
 * @public
 */
export interface IHeftPhaseStartHookOptions {
  operation: OperationGroupRecord<IHeftPhaseOperationMetadata>;
}

/**
 * @public
 */
export interface IHeftPhaseFinishHookOptions {
  operation: OperationGroupRecord<IHeftPhaseOperationMetadata>;
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
   * The `toolFinish` hook is called at the end of Heft execution. It is called after all phases have
   * completed execution. Plugins that tap this hook are resposible for handling the scenario in which
   * `toolStart` threw an error, since this hook is used to clean up any resources allocated earlier
   * in the lifecycle and therefore runs even in error conditions. To use it, call
   * `toolFinish.tapPromise(<pluginName>, <callback>)`.
   *
   * @public
   */
  toolFinish: AsyncParallelHook<IHeftLifecycleToolFinishHookOptions>;

  /**
   * The `recordMetrics` hook is called at the end of every Heft execution pass. It is called after all
   * phases have completed execution (or been canceled). In a watch run, it will be called several times
   * in between `toolStart` and (if the session is gracefully interrupted via Ctrl+C), `toolFinish`.
   * In a non-watch run, it will be invoked exactly once between `toolStart` and `toolFinish`.
   *  To use it, call `recordMetrics.tapPromise(<pluginName>, <callback>)`.
   * @public
   */
  recordMetrics: AsyncParallelHook<IHeftRecordMetricsHookOptions>;

  /**
   * The `taskStart` hook is called at the beginning of a task. It is called before the task has begun
   * to execute. To use it, call `taskStart.tap(<pluginName>, <callback>)`.
   *
   * @public
   */
  taskStart: SyncHook<IHeftTaskStartHookOptions>;

  /**
   * The `taskFinish` hook is called at the end of a task. It is called after the task has completed
   * execution. To use it, call `taskFinish.tap(<pluginName>, <callback>)`.
   *
   * @public
   */
  taskFinish: SyncHook<IHeftTaskFinishHookOptions>;

  /**
   * The `phaseStart` hook is called at the beginning of a phase. It is called before the phase has
   * begun to execute. To use it, call `phaseStart.tap(<pluginName>, <callback>)`.
   *
   * @public
   */
  phaseStart: SyncHook<IHeftPhaseStartHookOptions>;

  /**
   * The `phaseFinish` hook is called at the end of a phase. It is called after the phase has completed
   * execution. To use it, call `phaseFinish.tap(<pluginName>, <callback>)`.
   *
   * @public
   */
  phaseFinish: SyncHook<IHeftPhaseFinishHookOptions>;
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
 * Options provided to the toolFinish hook.
 *
 * @public
 */
export interface IHeftLifecycleToolFinishHookOptions {}

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
  public readonly tempFolderPath: string;
  public readonly logger: IScopedLogger;
  public readonly debug: boolean;

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
    this.debug = options.debug;

    // Guranteed to be unique since phases are forbidden from using the name 'lifecycle'
    // and lifecycle plugin names are enforced to be unique.
    const uniquePluginFolderName: string = `lifecycle.${options.pluginDefinition.pluginName}`;

    // <projectFolder>/temp/<phaseName>.<taskName>
    this.tempFolderPath = path.join(options.heftConfiguration.tempFolderPath, uniquePluginFolderName);

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
