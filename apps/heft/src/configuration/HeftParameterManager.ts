import { InternalError } from '@rushstack/node-core-library';
import type { CommandLineParameter, CommandLineParameterProvider } from '@rushstack/ts-command-line';

import type {} from '../pluginFramework/IHeftPlugin';
import type {
  HeftPluginDefinitionBase,
  IChoiceParameterAlternativeJson,
  IParameterJson
} from './HeftPluginDefinition';

export interface IParameterConfiguration {
  pluginDefinition: HeftPluginDefinitionBase;
  parameter: IParameterJson;
}

export class HeftParameterManager {
  private _isFinalized: boolean = false;
  private _parameterConfigurations: Set<IParameterConfiguration> = new Set();
  // plugin definition => Map< parameter long name => applied parameter >
  private _parametersByDefinition: Map<HeftPluginDefinitionBase, Map<string, CommandLineParameter>> =
    new Map();

  public addPluginParameters(pluginDefinition: HeftPluginDefinitionBase): void {
    if (this._isFinalized) {
      throw new InternalError('Parameters have already been finalized.');
    }

    // Parameters from this plugin have already been added
    if (this._parametersByDefinition.has(pluginDefinition)) {
      return;
    } else {
      this._parametersByDefinition.set(pluginDefinition, new Map());
    }

    // Add the parameters provided by the plugin. We will perform parameter conflict resolution when applying
    for (const parameter of pluginDefinition.pluginParameters) {
      this._parameterConfigurations.add({ parameter, pluginDefinition });
    }
  }

  public finalizeParameters(commandLineParameterProvider: CommandLineParameterProvider): void {
    if (this._isFinalized) {
      throw new InternalError('Parameters have already been finalized.');
    }

    this._isFinalized = true;
    for (const parameterConfiguration of this._parameterConfigurations) {
      this._addParameterToProvider(parameterConfiguration, commandLineParameterProvider);
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

  private _addParameterToProvider(
    parameterConfiguration: IParameterConfiguration,
    commandLineParameterProvider: CommandLineParameterProvider
  ): void {
    const { parameter, pluginDefinition } = parameterConfiguration;

    // Short names are excluded since it would be difficult and confusing to de-dupe/handle shortname conflicts
    // as well as longname conflicts
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
    }

    // Map the parameters to the providing plugin definition. We know this will exist because we create
    // the entry when the parameters were added.
    const pluginParameters: Map<string, CommandLineParameter> =
      this._parametersByDefinition.get(pluginDefinition)!;
    if (pluginParameters.has(parameter.longName)) {
      throw new Error(
        `Parameter "${parameter.longName}" is defined multiple times by the providing plugin ` +
          `"${pluginDefinition.pluginName}" in package "${pluginDefinition.pluginPackageName}".`
      );
    }
    // Add the parameter to the map using the original long name, so that it can be retrieved by plugins
    // under the original long name.
    pluginParameters.set(parameterConfiguration.parameter.longName, definedParameter);
  }
}
