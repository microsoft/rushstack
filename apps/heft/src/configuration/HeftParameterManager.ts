// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError } from '@rushstack/node-core-library';
import type { CommandLineParameter, CommandLineParameterProvider } from '@rushstack/ts-command-line';

import type {} from '../pluginFramework/IHeftPlugin';
import type {
  HeftPluginDefinitionBase,
  IChoiceParameterAlternativeJson,
  IParameterJson
} from './HeftPluginDefinition';

export class HeftParameterManager {
  private _isFinalized: boolean = false;
  // plugin definition => Map< parameter long name => applied parameter >
  private _parametersByDefinition: Map<HeftPluginDefinitionBase, Map<string, CommandLineParameter>> =
    new Map();

  public addPluginParameters(pluginDefinition: HeftPluginDefinitionBase): void {
    if (this._isFinalized) {
      throw new InternalError('Parameters have already been finalized.');
    }
    if (!this._parametersByDefinition.has(pluginDefinition)) {
      this._parametersByDefinition.set(pluginDefinition, new Map());
    }
  }

  public finalizeParameters(commandLineParameterProvider: CommandLineParameterProvider): void {
    if (this._isFinalized) {
      throw new InternalError('Parameters have already been finalized.');
    }
    this._isFinalized = true;
    for (const pluginDefinition of this._parametersByDefinition.keys()) {
      this._addParametersToProvider(pluginDefinition, commandLineParameterProvider);
    }
  }

  public getParametersForPlugin(
    pluginDefinition: HeftPluginDefinitionBase
  ): Map<string, CommandLineParameter> {
    if (!this._isFinalized) {
      throw new InternalError('Parameters have not yet been finalized.');
    }
    const parameters: Map<string, CommandLineParameter> | undefined =
      this._parametersByDefinition.get(pluginDefinition);
    if (!parameters) {
      throw new InternalError(
        `Parameters from plugin "${pluginDefinition.pluginName}" in package ` +
          `"${pluginDefinition.pluginPackageName}" were not added before finalization.`
      );
    }
    return parameters;
  }

  /**
   * Add the parameters specified by a plugin definition to the command line parameter provider.
   * Duplicate parameters are allowed, as long as they have different parameter scopes. In this
   * case, the parameter will only be referencable by the CLI argument
   * "--<parameterScope>:<parameterName>". If there is no duplicate parameter, it will also be
   * referencable by the CLI argument "--<parameterName>".
   */
  private _addParametersToProvider(
    pluginDefinition: HeftPluginDefinitionBase,
    commandLineParameterProvider: CommandLineParameterProvider
  ): void {
    const definedPluginParametersByName: Map<string, CommandLineParameter> =
      this._parametersByDefinition.get(pluginDefinition)!;

    // Error if a plugin defines a parameter multiple times
    for (const parameter of pluginDefinition.pluginParameters) {
      if (definedPluginParametersByName.has(parameter.longName)) {
        throw new Error(
          `Parameter "${parameter.longName}" is defined multiple times by the providing plugin ` +
            `"${pluginDefinition.pluginName}" in package "${pluginDefinition.pluginPackageName}".`
        );
      }

      // Short names are excluded since it would be difficult and confusing to de-dupe/handle shortname
      // conflicts as well as longname conflicts
      let definedParameter: CommandLineParameter;
      switch (parameter.parameterKind) {
        case 'choiceList': {
          definedParameter = commandLineParameterProvider.defineChoiceListParameter({
            description: parameter.description,
            required: parameter.required,
            alternatives: parameter.alternatives.map((p: IChoiceParameterAlternativeJson) => p.name),
            parameterLongName: parameter.longName,
            parameterScope: pluginDefinition.pluginParameterScope
          });
          break;
        }
        case 'choice': {
          definedParameter = commandLineParameterProvider.defineChoiceParameter({
            description: parameter.description,
            required: parameter.required,
            alternatives: parameter.alternatives.map((p: IChoiceParameterAlternativeJson) => p.name),
            defaultValue: parameter.defaultValue,
            parameterLongName: parameter.longName,
            parameterScope: pluginDefinition.pluginParameterScope
          });
          break;
        }
        case 'flag': {
          definedParameter = commandLineParameterProvider.defineFlagParameter({
            description: parameter.description,
            required: parameter.required,
            parameterLongName: parameter.longName,
            parameterScope: pluginDefinition.pluginParameterScope
          });
          break;
        }
        case 'integerList': {
          definedParameter = commandLineParameterProvider.defineIntegerListParameter({
            description: parameter.description,
            required: parameter.required,
            argumentName: parameter.argumentName,
            parameterLongName: parameter.longName,
            parameterScope: pluginDefinition.pluginParameterScope
          });
          break;
        }
        case 'integer': {
          definedParameter = commandLineParameterProvider.defineIntegerParameter({
            description: parameter.description,
            required: parameter.required,
            argumentName: parameter.argumentName,
            defaultValue: parameter.defaultValue,
            parameterLongName: parameter.longName,
            parameterScope: pluginDefinition.pluginParameterScope
          });
          break;
        }
        case 'stringList': {
          definedParameter = commandLineParameterProvider.defineStringListParameter({
            description: parameter.description,
            required: parameter.required,
            argumentName: parameter.argumentName,
            parameterLongName: parameter.longName,
            parameterScope: pluginDefinition.pluginParameterScope
          });
          break;
        }
        case 'string': {
          definedParameter = commandLineParameterProvider.defineStringParameter({
            description: parameter.description,
            required: parameter.required,
            argumentName: parameter.argumentName,
            defaultValue: parameter.defaultValue,
            parameterLongName: parameter.longName,
            parameterScope: pluginDefinition.pluginParameterScope
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
}
