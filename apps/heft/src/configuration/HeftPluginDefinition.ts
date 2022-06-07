import * as path from 'path';
import { InternalError, JsonSchema } from '@rushstack/node-core-library';

import type { IHeftPlugin } from '../pluginFramework/IHeftPlugin';
import type { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';
import type { HeftLifecycleSession } from '../pluginFramework/HeftLifecycleSession';
import type { HeftTaskSession } from '../pluginFramework/HeftTaskSession';

/**
 * "baseParameter" from heft-plugin.schema.json
 * @public
 */
export interface IBaseParameterJson {
  /**
   * Indicates the kind of syntax for this command-line parameter: \"flag\" or \"choice\" or \"string\".
   */
  parameterKind: 'flag' | 'choice' | '' | 'string';
  /**
   * The name of the parameter (e.g. \"--verbose\").  This is a required field.
   */
  longName: string;
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
}

export type IParameterJson = IFlagParameterJson | IChoiceParameterJson | IStringParameterJson;

export interface IHeftPluginDefinitionJson {
  pluginName: string;
  entryPoint: string;
  optionsSchema?: string;
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
  private static _pluginOptionsSchemas: Map<string, JsonSchema> = new Map();

  private _heftPluginDefinitionJson: IHeftPluginDefinitionJson;
  private _pluginPackageName: string;
  private _resolvedEntryPoint: string;
  private _optionsSchema: JsonSchema | undefined;

  protected constructor(options: IHeftPluginDefinitionOptions) {
    this._heftPluginDefinitionJson = options.heftPluginDefinitionJson;
    this._pluginPackageName = options.packageName;
    this._resolvedEntryPoint = path.resolve(options.packageRoot, this._heftPluginDefinitionJson.entryPoint);

    // Load up and memoize the options schemas. Unfortunately loading the schema is a synchronous process.
    if (options.heftPluginDefinitionJson.optionsSchema) {
      const resolvedSchemaPath: string = path.resolve(
        options.packageRoot,
        options.heftPluginDefinitionJson.optionsSchema
      );
      let schema: JsonSchema | undefined =
        HeftPluginDefinitionBase._pluginOptionsSchemas.get(resolvedSchemaPath);
      if (!schema) {
        schema = JsonSchema.fromFile(resolvedSchemaPath);
        HeftPluginDefinitionBase._pluginOptionsSchemas.set(resolvedSchemaPath, schema);
      }
      this._optionsSchema = schema;
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
   * The parameters that are defined for this plugin.
   */
  public get pluginParameters(): ReadonlyArray<IParameterJson> {
    return this._heftPluginDefinitionJson.parameters || [];
  }

  public async loadPluginAsync(logger: ScopedLogger): Promise<IHeftPlugin> {
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
          `Could not load plugin from "${entryPointPath}": The target module does not export a ` +
            'plugin class with a parameterless constructor.'
        );
      } else {
        throw new InternalError(`Could not load plugin from "${entryPointPath}": ${error}`);
      }
    }

    if (!heftPlugin) {
      throw new InternalError(
        `Plugin "${this.pluginName}" loaded from "${entryPointPath}" is null or undefined.`
      );
    }

    logger.terminal.writeVerboseLine(`Loaded plugin from "${entryPointPath}"`);

    if (!heftPlugin.apply || typeof heftPlugin.apply !== 'function') {
      throw new InternalError(
        `Plugins must define an "apply" function. The plugin "${this.pluginName}" ` +
          `loaded from "${entryPointPath}" either doesn\'t define an "apply" property, or its value ` +
          "isn't a function."
      );
    }

    return heftPlugin;
  }

  public validateOptions(options: unknown): void {
    if (this._optionsSchema) {
      try {
        this._optionsSchema.validateObject(options || {}, '');
      } catch (error) {
        throw new Error(
          `Provided options for plugin "${this.pluginName}" did not match the provided plugin schema.\n${error}`
        );
      }
    }
  }
}

export class HeftLifecyclePluginDefinition extends HeftPluginDefinitionBase {
  public static loadFromObject(options: IHeftPluginDefinitionOptions): HeftLifecyclePluginDefinition {
    return new HeftLifecyclePluginDefinition(options);
  }

  /**
   * @override
   */
  public loadPluginAsync(logger: ScopedLogger): Promise<IHeftPlugin<HeftLifecycleSession, object | void>> {
    return super.loadPluginAsync(logger);
  }
}

export class HeftTaskPluginDefinition extends HeftPluginDefinitionBase {
  public static loadFromObject(options: IHeftPluginDefinitionOptions): HeftTaskPluginDefinition {
    return new HeftTaskPluginDefinition(options);
  }

  /**
   * @override
   */
  public loadPluginAsync(logger: ScopedLogger): Promise<IHeftPlugin<HeftTaskSession, object | void>> {
    return super.loadPluginAsync(logger);
  }
}
