// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { InternalError, JsonSchema } from '@rushstack/node-core-library';

import type { IHeftPlugin } from '../pluginFramework/IHeftPlugin';
import type { IScopedLogger } from '../pluginFramework/logging/ScopedLogger';
import type { HeftLifecycleSession } from '../pluginFramework/HeftLifecycleSession';
import type { HeftTaskSession } from '../pluginFramework/HeftTaskSession';

/**
 * "baseParameter" from heft-plugin.schema.json
 * @public
 */
export interface IBaseParameterJson {
  /**
   * Indicates the kind of syntax for this command-line parameter.
   */
  parameterKind: 'choice' | 'choiceList' | 'flag' | 'integer' | 'integerList' | 'string' | 'stringList';
  /**
   * The name of the parameter (e.g. \"--verbose\").  This is a required field.
   */
  longName: string;
  /**
   * An optional short form of the parameter (e.g. \"-v\" instead of \"--verbose\").
   */
  shortName?: string;
  /**
   * A detailed description of the parameter, which appears when requesting help for the command (e.g. \"rush --help my-command\").
   */
  description: string;
  /**
   * If true, then this parameter must be included on the command line.
   */
  required?: boolean;
}

/**
 * Part of "choiceParameter" from command-line.schema.json
 * @public
 */
export interface IChoiceParameterAlternativeJson {
  /**
   * A token that is one of the alternatives that can be used with the choice parameter, e.g. \"vanilla\" in \"--flavor vanilla\".
   */
  name: string;
  /**
   * A detailed description for the alternative that will be shown in the command-line help.
   */
  description: string;
}

/**
 * A custom command-line parameter whose list of arguments must be chosen from a list of allowable alternatives.
 * @public
 */
export interface IChoiceListParameterJson extends IBaseParameterJson {
  /**
   * Denotes that this is a choice list parameter.
   */
  parameterKind: 'choiceList';
  /**
   * A list of alternative argument values that can be chosen for this parameter.
   */
  alternatives: IChoiceParameterAlternativeJson[];
}

/**
 * A custom command-line parameter whose argument must be chosen from a list of allowable alternatives.
 * @public
 */
export interface IChoiceParameterJson extends IBaseParameterJson {
  /**
   * Denotes that this is a choice parameter.
   */
  parameterKind: 'choice';
  /**
   * A list of alternative argument values that can be chosen for this parameter.
   */
  alternatives: IChoiceParameterAlternativeJson[];
  /**
   * If the parameter is omitted from the command line, this value will be inserted by default.
   */
  defaultValue?: string;
}

/**
 * A custom command-line parameter whose presence acts as an on/off switch.
 * @public
 */
export interface IFlagParameterJson extends IBaseParameterJson {
  /**
   * Denotes that this is a flag (boolean) parameter.
   */
  parameterKind: 'flag';
}

/**
 * A custom command-line parameter whose list of values are interpreted as integers.
 * @public
 */
export interface IIntegerListParameterJson extends IBaseParameterJson {
  /**
   * Denotes that this is an integer list parameter.
   */
  parameterKind: 'integerList';
  /**
   * The name of the argument for this parameter.
   */
  argumentName: string;
}

/**
 * A custom command-line parameter whose value is interpreted as an integer.
 * @public
 */
export interface IIntegerParameterJson extends IBaseParameterJson {
  /**
   * Denotes that this is an integer parameter.
   */
  parameterKind: 'integer';
  /**
   * The name of the argument for this parameter.
   */
  argumentName: string;
  /**
   * If the parameter is omitted from the command line, this value will be inserted by default.
   */
  defaultValue?: number;
}

/**
 * A custom command-line parameter whose list of values are interpreted as strings.
 * @public
 */
export interface IStringListParameterJson extends IBaseParameterJson {
  /**
   * Denotes that this is a string list parameter.
   */
  parameterKind: 'stringList';
  /**
   * The name of the argument for this parameter.
   */
  argumentName: string;
}

/**
 * A custom command-line parameter whose value is interpreted as a string.
 * @public
 */
export interface IStringParameterJson extends IBaseParameterJson {
  /**
   * Denotes that this is a string parameter.
   */
  parameterKind: 'string';
  /**
   * The name of the argument for this parameter.
   */
  argumentName: string;
  /**
   * If the parameter is omitted from the command line, this value will be inserted by default.
   */
  defaultValue?: string;
}

export type IParameterJson =
  | IChoiceListParameterJson
  | IChoiceParameterJson
  | IFlagParameterJson
  | IIntegerListParameterJson
  | IIntegerParameterJson
  | IStringListParameterJson
  | IStringParameterJson;

export interface IHeftPluginDefinitionJson {
  pluginName: string;
  entryPoint: string;
  optionsSchema?: string;
  parameterScope?: string;
  parameters?: IParameterJson[];
}

export interface IHeftLifecyclePluginDefinitionJson extends IHeftPluginDefinitionJson {}

export interface IHeftTaskPluginDefinitionJson extends IHeftPluginDefinitionJson {}

export interface IHeftPluginDefinitionOptions {
  heftPluginDefinitionJson: IHeftPluginDefinitionJson;
  packageName: string;
  packageRoot: string;
}

export abstract class HeftPluginDefinitionBase {
  private _heftPluginDefinitionJson: IHeftPluginDefinitionJson;
  private _pluginPackageName: string;
  private _resolvedEntryPoint: string;
  private _optionsSchema: JsonSchema | undefined;

  protected constructor(options: IHeftPluginDefinitionOptions) {
    this._heftPluginDefinitionJson = options.heftPluginDefinitionJson;
    this._pluginPackageName = options.packageName;
    this._resolvedEntryPoint = path.resolve(options.packageRoot, this._heftPluginDefinitionJson.entryPoint);

    // Ensure that the plugin parameters are unique
    const seenParameters: Set<string> = new Set();
    for (const parameter of this.pluginParameters) {
      if (seenParameters.has(parameter.longName)) {
        throw new Error(
          `Parameter ${JSON.stringify(parameter.longName)} is defined multiple times by the providing ` +
            `plugin ${JSON.stringify(this.pluginName)} in package ` +
            `${JSON.stringify(this.pluginPackageName)}.`
        );
      }
      seenParameters.add(parameter.longName);
    }

    // Unfortunately loading the schema is a synchronous process.
    if (options.heftPluginDefinitionJson.optionsSchema) {
      const resolvedSchemaPath: string = path.resolve(
        options.packageRoot,
        options.heftPluginDefinitionJson.optionsSchema
      );
      this._optionsSchema = JsonSchema.fromFile(resolvedSchemaPath);
    }
  }

  /**
   * The package name containing the target plugin.
   */
  public get pluginPackageName(): string {
    return this._pluginPackageName;
  }

  /**
   * The name of the target plugin.
   */
  public get pluginName(): string {
    return this._heftPluginDefinitionJson.pluginName;
  }

  /**
   * The resolved entry point to the plugin.
   */
  public get entryPoint(): string {
    return this._resolvedEntryPoint;
  }

  /**
   * The scope for all parameters defined by this plugin.
   */
  public get pluginParameterScope(): string {
    // Default to the plugin name for the parameter scope. Plugin names should be unique within any run
    // of Heft. Additionally, plugin names have the same naming restrictions as parameter scopes so can
    // be used without modification.
    return this._heftPluginDefinitionJson.parameterScope || this.pluginName;
  }

  /**
   * The parameters that are defined for this plugin.
   */
  public get pluginParameters(): ReadonlyArray<IParameterJson> {
    return this._heftPluginDefinitionJson.parameters || [];
  }

  /**
   * Load the plugin associated with the definition.
   */
  public async loadPluginAsync(logger: IScopedLogger): Promise<IHeftPlugin> {
    // Do not memoize the plugin here, since we want a new instance of the plugin each time it is loaded
    // from the definition
    let heftPlugin: IHeftPlugin | undefined;
    const entryPointPath: string = this.entryPoint;
    try {
      const loadedPluginModule: (new () => IHeftPlugin) | { default: new () => IHeftPlugin } = await import(
        entryPointPath
      );
      const heftPluginConstructor: new () => IHeftPlugin =
        (loadedPluginModule as { default: new () => IHeftPlugin }).default || loadedPluginModule;
      heftPlugin = new heftPluginConstructor();
    } catch (e: unknown) {
      const error: Error = e as Error;
      if (error.message === 'heftPluginConstructor is not a constructor') {
        // Common error scenario, give a more helpful error message
        throw new Error(
          `Could not load plugin from "${entryPointPath}": The target module does not ` +
            'export a plugin class with a parameterless constructor.'
        );
      } else {
        throw new InternalError(`Could not load plugin from "${entryPointPath}": ${error}`);
      }
    }

    if (!heftPlugin) {
      throw new InternalError(
        `Plugin ${JSON.stringify(this.pluginName)} loaded from "${entryPointPath}" is null or undefined.`
      );
    }

    logger.terminal.writeVerboseLine(`Loaded plugin from "${entryPointPath}"`);

    if (typeof heftPlugin.apply !== 'function') {
      throw new InternalError(
        `The plugin ${JSON.stringify(this.pluginName)} loaded from "${entryPointPath}" ` +
          'doesn\'t define an "apply" function.'
      );
    }

    return heftPlugin;
  }

  /**
   * Validate the provided plugin options against the plugin's options schema, if one is provided.
   */
  public validateOptions(options: unknown): void {
    if (this._optionsSchema) {
      try {
        this._optionsSchema.validateObject(options || {}, '');
      } catch (error) {
        throw new Error(
          `Provided options for plugin ${JSON.stringify(this.pluginName)} did not match the provided ` +
            `plugin schema.\n${error}`
        );
      }
    }
  }
}

export class HeftLifecyclePluginDefinition extends HeftPluginDefinitionBase {
  /**
   * Load a lifecycle plugin definition given the provided plugin definition options.
   */
  public static loadFromObject(options: IHeftPluginDefinitionOptions): HeftLifecyclePluginDefinition {
    return new HeftLifecyclePluginDefinition(options);
  }

  /**
   * {@inheritDoc HeftPluginDefinitionBase.loadPluginAsync}
   * @override
   */
  public loadPluginAsync(logger: IScopedLogger): Promise<IHeftPlugin<HeftLifecycleSession, object | void>> {
    return super.loadPluginAsync(logger);
  }
}

export class HeftTaskPluginDefinition extends HeftPluginDefinitionBase {
  /**
   * Load a task plugin definition given the provided plugin definition options.
   */
  public static loadFromObject(options: IHeftPluginDefinitionOptions): HeftTaskPluginDefinition {
    return new HeftTaskPluginDefinition(options);
  }

  /**
   * {@inheritDoc HeftPluginDefinitionBase.loadPluginAsync}
   * @override
   */
  public loadPluginAsync(logger: IScopedLogger): Promise<IHeftPlugin<HeftTaskSession, object | void>> {
    return super.loadPluginAsync(logger);
  }
}
