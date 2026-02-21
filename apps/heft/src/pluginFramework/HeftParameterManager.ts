// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError } from '@rushstack/node-core-library';
import {
  type CommandLineParameter,
  type CommandLineParameterProvider,
  CommandLineParameterKind,
  type CommandLineChoiceParameter,
  type CommandLineChoiceListParameter,
  type CommandLineFlagParameter,
  type CommandLineIntegerParameter,
  type CommandLineIntegerListParameter,
  type CommandLineStringParameter,
  type CommandLineStringListParameter
} from '@rushstack/ts-command-line';

import type {
  HeftPluginDefinitionBase,
  IChoiceParameterAlternativeJson,
  IParameterJson
} from '../configuration/HeftPluginDefinition.ts';

/**
 * The default parameters provided by Heft.
 *
 * @public
 */
export interface IHeftDefaultParameters {
  /**
   * Whether or not the `--clean` flag was passed to Heft.
   *
   * @public
   */
  readonly clean: boolean;

  /**
   * Whether or not the `--debug` flag was passed to Heft.
   *
   * @public
   */
  readonly debug: boolean;

  /**
   * Whether or not the `--verbose` flag was passed to the Heft action.
   *
   * @public
   */
  readonly verbose: boolean;

  /**
   * Whether or not the `--production` flag was passed to the Heft action.
   *
   * @public
   */
  readonly production: boolean;

  /**
   * The locales provided to the Heft action via the `--locales` parameter.
   *
   * @public
   */
  readonly locales: Iterable<string>;

  /**
   * Whether or not the Heft action is running in watch mode.
   */
  readonly watch: boolean;
}

/**
 * Parameters provided to a Heft plugin.
 *
 * @public
 */
export interface IHeftParameters extends IHeftDefaultParameters {
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

export interface IHeftParameterManagerOptions {
  getIsClean: () => boolean;
  getIsDebug: () => boolean;
  getIsVerbose: () => boolean;
  getIsProduction: () => boolean;
  getIsWatch: () => boolean;
  getLocales: () => Iterable<string>;
}

export class HeftParameterManager {
  private readonly _options: IHeftParameterManagerOptions;
  // plugin definition => parameter accessors and defaults
  private readonly _heftParametersByDefinition: Map<HeftPluginDefinitionBase, IHeftParameters> = new Map();
  // plugin definition => Map< parameter long name => applied parameter >
  private readonly _parametersByDefinition: Map<HeftPluginDefinitionBase, Map<string, CommandLineParameter>> =
    new Map();
  // parameter scope => plugin definition
  private readonly _pluginDefinitionsByScope: Map<string, HeftPluginDefinitionBase> = new Map();

  private _isFinalized: boolean = false;

  private _defaultParameters: IHeftDefaultParameters | undefined;
  public get defaultParameters(): IHeftDefaultParameters {
    if (!this._isFinalized) {
      throw new InternalError('Parameters have not yet been finalized.');
    }

    if (!this._defaultParameters) {
      this._defaultParameters = {
        clean: this._options.getIsClean(),
        debug: this._options.getIsDebug(),
        verbose: this._options.getIsVerbose(),
        production: this._options.getIsProduction(),
        locales: this._options.getLocales(),
        watch: this._options.getIsWatch()
      };
    }
    return this._defaultParameters;
  }

  public constructor(options: IHeftParameterManagerOptions) {
    this._options = options;
  }

  /**
   * Add parameters provided by the specified plugin definition. Parameters will be registered with the
   * command line parameter provider after finalization.
   */
  public addPluginParameters(pluginDefinition: HeftPluginDefinitionBase): void {
    if (this._isFinalized) {
      throw new InternalError('Parameters have already been finalized.');
    }
    if (!this._parametersByDefinition.has(pluginDefinition)) {
      this._parametersByDefinition.set(pluginDefinition, new Map());
    }
  }

  /**
   * Finalize and register parameters with the specified parameter provider. The parameter manager
   * can only be finalized once.
   */
  public finalizeParameters(commandLineParameterProvider: CommandLineParameterProvider): void {
    if (this._isFinalized) {
      throw new InternalError('Parameters have already been finalized.');
    }
    this._isFinalized = true;
    for (const pluginDefinition of this._parametersByDefinition.keys()) {
      this._addParametersToProvider(pluginDefinition, commandLineParameterProvider);
    }
  }

  /**
   * Get the finalized parameters for the specified plugin definition.
   */
  public getParametersForPlugin(pluginDefinition: HeftPluginDefinitionBase): IHeftParameters {
    if (!this._isFinalized) {
      throw new InternalError('Parameters have not yet been finalized.');
    }

    let heftParameters: IHeftParameters | undefined = this._heftParametersByDefinition.get(pluginDefinition);
    if (!heftParameters) {
      const parameters: Map<string, CommandLineParameter> | undefined =
        this._parametersByDefinition.get(pluginDefinition);
      if (!parameters) {
        throw new InternalError(
          `Parameters from plugin ${JSON.stringify(pluginDefinition.pluginName)} in package ` +
            `${JSON.stringify(pluginDefinition.pluginPackageName)} were not added before finalization.`
        );
      }

      heftParameters = {
        ...this.defaultParameters,

        getChoiceParameter: (parameterLongName: string) =>
          this._getParameter(parameters, parameterLongName, CommandLineParameterKind.Choice),
        getChoiceListParameter: (parameterLongName: string) =>
          this._getParameter(parameters, parameterLongName, CommandLineParameterKind.ChoiceList),
        getFlagParameter: (parameterLongName: string) =>
          this._getParameter(parameters, parameterLongName, CommandLineParameterKind.Flag),
        getIntegerParameter: (parameterLongName: string) =>
          this._getParameter(parameters, parameterLongName, CommandLineParameterKind.Integer),
        getIntegerListParameter: (parameterLongName: string) =>
          this._getParameter(parameters, parameterLongName, CommandLineParameterKind.IntegerList),
        getStringParameter: (parameterLongName: string) =>
          this._getParameter(parameters, parameterLongName, CommandLineParameterKind.String),
        getStringListParameter: (parameterLongName: string) =>
          this._getParameter(parameters, parameterLongName, CommandLineParameterKind.StringList)
      };
      this._heftParametersByDefinition.set(pluginDefinition, heftParameters);
    }
    return heftParameters;
  }

  /**
   * Add the parameters specified by a plugin definition to the command line parameter provider.
   * Duplicate parameters are allowed, as long as they have different parameter scopes. In this
   * case, the parameter will only be referenceable by the CLI argument
   * "--<parameterScope>:<parameterName>". If there is no duplicate parameter, it will also be
   * referenceable by the CLI argument "--<parameterName>".
   */
  private _addParametersToProvider(
    pluginDefinition: HeftPluginDefinitionBase,
    commandLineParameterProvider: CommandLineParameterProvider
  ): void {
    const {
      pluginName,
      pluginPackageName,
      pluginParameterScope: parameterScope,
      pluginParameters
    } = pluginDefinition;
    const existingDefinitionWithScope: HeftPluginDefinitionBase | undefined =
      this._pluginDefinitionsByScope.get(parameterScope);
    if (existingDefinitionWithScope && existingDefinitionWithScope !== pluginDefinition) {
      const { pluginName: existingScopePluginName, pluginPackageName: existingScopePluginPackageName } =
        existingDefinitionWithScope;
      throw new Error(
        `Plugin ${JSON.stringify(pluginName)} in package ` +
          `${JSON.stringify(pluginPackageName)} specifies the same parameter scope ` +
          `${JSON.stringify(parameterScope)} as plugin ` +
          `${JSON.stringify(existingScopePluginName)} from package ` +
          `${JSON.stringify(existingScopePluginPackageName)}.`
      );
    } else {
      this._pluginDefinitionsByScope.set(parameterScope, pluginDefinition);
    }

    const definedPluginParametersByName: Map<string, CommandLineParameter> =
      this._parametersByDefinition.get(pluginDefinition)!;

    for (const parameter of pluginParameters) {
      let definedParameter: CommandLineParameter;
      const { description, required, longName: parameterLongName, shortName: parameterShortName } = parameter;
      switch (parameter.parameterKind) {
        case 'choiceList': {
          const { alternatives } = parameter;
          definedParameter = commandLineParameterProvider.defineChoiceListParameter({
            description,
            required,
            alternatives: alternatives.map((p: IChoiceParameterAlternativeJson) => p.name),
            parameterLongName,
            parameterShortName,
            parameterScope
          });
          break;
        }
        case 'choice': {
          const { alternatives, defaultValue } = parameter;
          definedParameter = commandLineParameterProvider.defineChoiceParameter({
            description,
            required,
            alternatives: alternatives.map((p: IChoiceParameterAlternativeJson) => p.name),
            defaultValue,
            parameterLongName,
            parameterShortName,
            parameterScope
          });
          break;
        }
        case 'flag': {
          definedParameter = commandLineParameterProvider.defineFlagParameter({
            description,
            required,
            parameterLongName,
            parameterShortName,
            parameterScope
          });
          break;
        }
        case 'integerList': {
          const { argumentName } = parameter;
          definedParameter = commandLineParameterProvider.defineIntegerListParameter({
            description,
            required,
            argumentName,
            parameterLongName,
            parameterShortName,
            parameterScope
          });
          break;
        }
        case 'integer': {
          const { argumentName, defaultValue } = parameter;
          definedParameter = commandLineParameterProvider.defineIntegerParameter({
            description,
            required,
            argumentName,
            defaultValue,
            parameterLongName,
            parameterShortName,
            parameterScope
          });
          break;
        }
        case 'stringList': {
          const { argumentName } = parameter;
          definedParameter = commandLineParameterProvider.defineStringListParameter({
            description,
            required,
            argumentName,
            parameterLongName,
            parameterShortName,
            parameterScope
          });
          break;
        }
        case 'string': {
          const { argumentName, defaultValue } = parameter;
          definedParameter = commandLineParameterProvider.defineStringParameter({
            description,
            required,
            argumentName,
            defaultValue,
            parameterLongName,
            parameterShortName,
            parameterScope
          });
          break;
        }
        default: {
          // Need to cast to IParameterJson since it's inferred to be type 'never'
          throw new InternalError(
            `Unrecognized parameter kind: ${(parameter as IParameterJson).parameterKind}`
          );
        }
      }

      // Add the parameter to the map using the original long name, so that it can be retrieved by plugins
      // under the original long name.
      definedPluginParametersByName.set(parameter.longName, definedParameter);
    }
  }

  private _getParameter<T extends CommandLineParameter>(
    parametersByLongName: Map<string, CommandLineParameter>,
    parameterLongName: string,
    expectedParameterKind: CommandLineParameterKind
  ): T {
    const parameter: CommandLineParameter | undefined = parametersByLongName.get(parameterLongName);
    if (!parameter) {
      throw new Error(
        `Parameter ${JSON.stringify(parameterLongName)} not found. Are you sure it was defined in ` +
          'heft-plugin.json?'
      );
    } else if (parameter.kind !== expectedParameterKind) {
      throw new Error(
        `Parameter ${JSON.stringify(parameterLongName)} is of kind ` +
          `${JSON.stringify(CommandLineParameterKind[parameter.kind])}, not of kind ` +
          `${JSON.stringify(CommandLineParameterKind[expectedParameterKind])}.`
      );
    }
    return parameter as T;
  }
}
