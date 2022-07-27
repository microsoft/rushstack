// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import type { AsyncParallelHook } from 'tapable';
import {
  CommandLineParameterKind,
  type CommandLineChoiceListParameter,
  type CommandLineChoiceParameter,
  type CommandLineFlagParameter,
  type CommandLineIntegerListParameter,
  type CommandLineIntegerParameter,
  type CommandLineParameter,
  type CommandLineStringListParameter,
  type CommandLineStringParameter
} from '@rushstack/ts-command-line';

import type { MetricsCollector } from '../metrics/MetricsCollector';
import type { ScopedLogger, IScopedLogger } from './logging/ScopedLogger';
import type { HeftTask } from './HeftTask';
import type { IHeftPhaseSessionOptions } from './HeftPhaseSession';
import type { IDeleteOperation } from '../plugins/DeleteFilesPlugin';
import type { ICopyOperation } from '../plugins/CopyFilesPlugin';
import type { HeftPluginHost } from './HeftPluginHost';

/**
 * @public
 */
export interface IHeftTaskSession {
  /**
   * @public
   */
  readonly taskName: string;

  /**
   * @public
   */
  readonly hooks: IHeftTaskHooks;

  /**
   * If set to true, the build is running with the --debug flag
   *
   * @public
   */
  readonly debugMode: boolean;

  /**
   * @public
   */
  readonly cacheFolder: string;

  /**
   * @public
   */
  readonly tempFolder: string;

  /**
   * @public
   */
  readonly logger: IScopedLogger;

  /**
   * Set a a callback which will be called if and after the specified plugin has been applied.
   * This can be used to tap hooks on another plugin that exists within the same phase.
   *
   * @public
   */
  requestAccessToPluginByName<T extends object>(
    pluginToAccessPackage: string,
    pluginToAccessName: string,
    pluginApply: (pluginAccessor: T) => void
  ): void;

  /**
   * Get a choice parameter that has been defined in heft-plugin.json.
   *
   * @public
   */
  getChoiceParameter(parameterLongName: string): CommandLineChoiceParameter;

  /**
   * Get a choice list parameter that has been defined in heft-plugin.json.
   *
   * @public
   */
  getChoiceListParameter(parameterLongName: string): CommandLineChoiceListParameter;

  /**
   * Get a flag parameter that has been defined in heft-plugin.json.
   *
   * @public
   */
  getFlagParameter(parameterLongName: string): CommandLineFlagParameter;

  /**
   * Get an integer parameter that has been defined in heft-plugin.json.
   *
   * @public
   */
  getIntegerParameter(parameterLongName: string): CommandLineIntegerParameter;

  /**
   * Get an integer list parameter that has been defined in heft-plugin.json.
   *
   * @public
   */
  getIntegerListParameter(parameterLongName: string): CommandLineIntegerListParameter;

  /**
   * Get a string parameter that has been defined in heft-plugin.json.
   *
   * @public
   */
  getStringParameter(parameterLongName: string): CommandLineStringParameter;

  /**
   * Get a string list parameter that has been defined in heft-plugin.json.
   *
   * @public
   */
  getStringListParameter(parameterLongName: string): CommandLineStringListParameter;
}

/**
 * @public
 */
export interface IHeftTaskHooks {
  clean: AsyncParallelHook<IHeftTaskCleanHookOptions>;
  run: AsyncParallelHook<IHeftTaskRunHookOptions>;
}

/**
 * @public
 */
export interface IHeftTaskHookOptions {
  production: boolean;
  verbose: boolean;
}

/**
 * @public
 */
export interface IHeftTaskCleanHookOptions extends IHeftTaskHookOptions {
  addDeleteOperations: (...deleteOperations: IDeleteOperation[]) => void;
}

/**
 * @public
 */
export interface IHeftTaskRunHookOptions extends IHeftTaskHookOptions {
  addCopyOperations: (...copyOperations: ICopyOperation[]) => void;
}

export interface IHeftTaskSessionOptions extends IHeftPhaseSessionOptions {
  logger: ScopedLogger;
  task: HeftTask;
  taskHooks: IHeftTaskHooks;
  parametersByLongName: ReadonlyMap<string, CommandLineParameter>;
  pluginHost: HeftPluginHost;
}

export class HeftTaskSession implements IHeftTaskSession {
  private _options: IHeftTaskSessionOptions;

  public readonly taskName: string;
  public readonly hooks: IHeftTaskHooks;
  public readonly cacheFolder: string;
  public readonly tempFolder: string;
  public readonly logger: IScopedLogger;
  public readonly pluginHost: HeftPluginHost;

  public get debugMode(): boolean {
    return this._options.getIsDebugMode();
  }

  /**
   * @internal
   */
  public readonly metricsCollector: MetricsCollector;

  public constructor(options: IHeftTaskSessionOptions) {
    this._options = options;
    this.logger = options.logger;
    this.metricsCollector = options.metricsCollector;
    this.taskName = options.task.taskName;
    this.hooks = options.taskHooks;
    this.pluginHost = options.pluginHost;

    // Guranteed to be unique since phases are uniquely named, tasks are uniquely named within
    // phases, and neither can have '.' in their names. We will also use the phase name and
    // task name as the folder name (instead of the plugin name) since we want to enable re-use
    // of plugins in multiple phases and tasks while maintaining unique temp/cache folders for
    // each task.
    const uniqueTaskFolderName: string = `${options.phase.phaseName}.${options.task.taskName}`;

    // <projectFolder>/.cache/<phaseName>.<taskName>
    this.cacheFolder = path.join(options.heftConfiguration.cacheFolder, uniqueTaskFolderName);

    // <projectFolder>/temp/<phaseName>.<taskName>
    this.tempFolder = path.join(options.heftConfiguration.tempFolder, uniqueTaskFolderName);
  }

  public requestAccessToPluginByName<T extends object>(
    pluginToAccessPackage: string,
    pluginToAccessName: string,
    pluginApply: (pluginAccessor: T) => void
  ): void {
    this.pluginHost.requestAccessToPluginByName(
      this.taskName,
      pluginToAccessPackage,
      pluginToAccessName,
      pluginApply
    );
  }

  public getChoiceParameter(parameterLongName: string): CommandLineChoiceParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.Choice);
  }

  public getChoiceListParameter(parameterLongName: string): CommandLineChoiceListParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.ChoiceList);
  }

  public getFlagParameter(parameterLongName: string): CommandLineFlagParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.Flag);
  }

  public getIntegerParameter(parameterLongName: string): CommandLineIntegerParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.Integer);
  }

  public getIntegerListParameter(parameterLongName: string): CommandLineIntegerListParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.IntegerList);
  }

  public getStringParameter(parameterLongName: string): CommandLineStringParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.String);
  }

  public getStringListParameter(parameterLongName: string): CommandLineStringListParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.StringList);
  }

  private _getParameter<T extends CommandLineParameter>(
    parameterLongName: string,
    expectedParameterKind: CommandLineParameterKind
  ): T {
    const parameter: CommandLineParameter | undefined =
      this._options.parametersByLongName.get(parameterLongName);
    if (!parameter) {
      throw new Error(
        `Parameter "${parameterLongName}" not found. Are you sure it was defined in heft-plugin.json?`
      );
    } else if (parameter.kind !== expectedParameterKind) {
      throw new Error(
        `Parameter "${parameterLongName}" is of kind "${
          CommandLineParameterKind[parameter.kind]
        }", not of kind ` + `"${CommandLineParameterKind[expectedParameterKind]}".`
      );
    }
    return parameter as T;
  }
}
