import * as path from 'path';
import {
  CommandLineParameterKind,
  type CommandLineParameter,
  type CommandLineParameterProvider,
  type CommandLineChoiceParameter
} from '@rushstack/ts-command-line';
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
  parameterKind: 'flag' | 'choice' | 'string';
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
   * A list of custom commands and/or built-in Rush commands that this parameter may be used with, by name.
   */
  associatedCommands?: string[];
  /**
   * A list of the names of the phases that this command-line parameter should be provided to.
   */
  associatedPhases?: string[];
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
  private _parameters: Set<CommandLineParameter> | undefined;

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
   * The parameters belonging to the plugin that have been applied to the Heft action. These will only
   * be available after HeftPluginDefinition.defineParameters() has been called.
   */
  public get parameters(): Set<CommandLineParameter> {
    if (!this._parameters) {
      throw new InternalError('HeftPluginDefinition.defineParameters() has not been called.');
    }
    return this._parameters;
  }

  public defineParameters(commandLineParameterProvider: CommandLineParameterProvider): void {
    if (!this._parameters) {
      this._parameters = new Set();
      const existingParameters: Map<string, CommandLineParameter> = new Map(
        commandLineParameterProvider.parameters.map((v: CommandLineParameter) => [v.longName, v])
      );

      for (const parameter of this._heftPluginDefinitionJson.parameters || []) {
        let definedParameter: CommandLineParameter | undefined;
        const existingParameter: CommandLineParameter | undefined = existingParameters.get(
          parameter.longName
        );
        if (existingParameter) {
          // Will throw if incompatible, otherwise continue since the parameter is already defined.
          this._validateParameterCompatibility(parameter, existingParameter);
          definedParameter = existingParameter;
        } else {
          switch (parameter.parameterKind) {
            case 'flag': {
              definedParameter = commandLineParameterProvider.defineFlagParameter({
                parameterShortName: parameter.shortName,
                parameterLongName: parameter.longName,
                description: parameter.description,
                required: parameter.required
              });
              break;
            }
            case 'choice': {
              definedParameter = commandLineParameterProvider.defineChoiceParameter({
                parameterShortName: parameter.shortName,
                parameterLongName: parameter.longName,
                description: parameter.description,
                required: parameter.required,
                alternatives: parameter.alternatives.map((p: IChoiceParameterAlternativeJson) => p.name),
                defaultValue: parameter.defaultValue
              });
              break;
            }
            case 'string': {
              definedParameter = commandLineParameterProvider.defineStringParameter({
                parameterShortName: parameter.shortName,
                parameterLongName: parameter.longName,
                description: parameter.description,
                required: parameter.required,
                argumentName: parameter.argumentName
              });
              break;
            }
          }
          if (!definedParameter) {
            // Shouldn't be possible, but throw just in case
            throw new InternalError(`Unrecognized parameter kind: ${parameter.parameterKind}`);
          }
        }

        this._parameters.add(definedParameter);
      }
    }
  }

  public async loadPluginAsync(logger: ScopedLogger): Promise<IHeftPlugin> {
    // Do not memoize the plugin here, since we want a new instance of the plugin each time it is loaded
    // from the definition
    let heftPlugin: IHeftPlugin | undefined;
    const entryPointPath: string = this.entryPoint;
    try {
      const loadedPluginModule: IHeftPlugin | { default: IHeftPlugin } = await import(entryPointPath);
      heftPlugin = (loadedPluginModule as { default: IHeftPlugin }).default || loadedPluginModule;
    } catch (error) {
      throw new InternalError(`Error loading plugin package from "${entryPointPath}": ${error}`);
    }

    if (!heftPlugin) {
      throw new InternalError(
        `Plugin "${this.pluginName}" loaded from "${entryPointPath}" is null or undefined.`
      );
    }

    logger.terminal.writeVerboseLine(`Loaded plugin package from "${entryPointPath}"`);

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

  private _validateParameterCompatibility(
    newParameter: IParameterJson,
    existingParameter: CommandLineParameter
  ): void {
    // Throw in various conflict scenarios:
    // - Conflicting parameterKind
    // - Conflicting shortName
    // - Conflicting alternatives when the parameterKind is "choice"
    // Most other conflicts are superficial and can be ignored.
    // TODO: This is not ideal. Create a formal mapping that can be provided by the plugin specifier in
    // heft.json to allow for manual re-mapping of conflicting parameters.
    let existingKind: 'flag' | 'choice' | 'string' | undefined;
    switch (existingParameter.kind) {
      case CommandLineParameterKind.Flag: {
        existingKind = 'flag';
        break;
      }
      case CommandLineParameterKind.Choice: {
        existingKind = 'choice';
        break;
      }
      case CommandLineParameterKind.String: {
        existingKind = 'string';
        break;
      }
    }

    const errorMessage: string = `An existing parameter "${existingParameter.longName}" was already defined with a different`;
    if (newParameter.parameterKind !== existingKind) {
      throw new Error(`${errorMessage} "parameterKind" value.`);
    } else if (
      newParameter.shortName &&
      newParameter.shortName &&
      newParameter.shortName !== existingParameter.shortName
    ) {
      // Only throw when both the new parameter and the existing parameter have a shortName that differ.
      // Ignore if one or the other does not have a shortName.
      throw new Error(`${errorMessage} "shortName" value.`);
    } else if (existingParameter.kind === CommandLineParameterKind.Choice) {
      // Only throw if the alternatives differ.
      const choiceParameterJson: IChoiceParameterJson = newParameter as IChoiceParameterJson;
      const existingChoiceParameter: CommandLineChoiceParameter =
        existingParameter as CommandLineChoiceParameter;
      const existingChoices: Set<string> = new Set(existingChoiceParameter.alternatives);
      for (const newChoice of choiceParameterJson.alternatives) {
        if (!existingChoices.has(newChoice.name)) {
          throw new Error(`${errorMessage} "alternatives" value.`);
        }
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
