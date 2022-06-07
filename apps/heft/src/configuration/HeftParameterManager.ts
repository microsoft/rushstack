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

// This regex maintains the base restrictions on parameter names (lower-case a-z, 0-9, and hyphens)
// while allowing for a scoping prefix (e.g. "--MyPlugin:my-parameter") and enforcing the same
// plugin name restrictions as the heft-plugin.json schema
const SYNONYM_REGEX: RegExp = /^--([a-zA-Z][a-zA-Z0-9]*:)?[a-z0-9]+((-[a-z0-9]+)+)?$/;

export class HeftParameterManager {
  private _isFinalized: boolean = false;
  // parameter long name => unapplied parameters
  private _parameterConfigurationsByName: Map<string, Set<IParameterConfiguration>> = new Map();
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
      let existingParameters: Set<IParameterConfiguration> | undefined =
        this._parameterConfigurationsByName.get(parameter.longName);
      if (!existingParameters) {
        existingParameters = new Set();
        this._parameterConfigurationsByName.set(parameter.longName, existingParameters);
      }
      existingParameters.add({ parameter, pluginDefinition });
    }
  }

  public finalizeParameters(commandLineParameterProvider: CommandLineParameterProvider): void {
    if (this._isFinalized) {
      throw new InternalError('Parameters have already been finalized.');
    }

    this._isFinalized = true;
    for (const parameterConfigurations of this._parameterConfigurationsByName.values()) {
      if (parameterConfigurations.size === 1) {
        this._addParameterToProvider([...parameterConfigurations][0], commandLineParameterProvider);
      } else {
        // Only define conflicting parameters using the generated synonym. This allows us to include
        // multiple conflicting parameters.
        for (const parameterConfiguration of parameterConfigurations) {
          this._addParameterToProvider(
            parameterConfiguration,
            commandLineParameterProvider,
            /* useSynonymForLongName: */ true
          );
        }
      }
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
        `Parameters from plugin "${pluginDefinition.pluginName}" were not added before finalization.`
      );
    }
    return parameters;
  }

  private _addParameterToProvider(
    parameterConfiguration: IParameterConfiguration,
    commandLineParameterProvider: CommandLineParameterProvider,
    useSynonymForLongName: boolean = false
  ): void {
    const { parameter, pluginDefinition } = parameterConfiguration;
    // Synonym used to avoid conflicts with other parameters.
    const synonym: string = this._generateScopedParameterLongName(parameterConfiguration);
    const parameterLongName: string = useSynonymForLongName ? synonym : parameter.longName;
    // Only use undocumented synonyms when the long name isn't already being set to the synonym.
    const undocumentedSynonyms: string[] | undefined = useSynonymForLongName ? undefined : [synonym];

    // Short names are excluded since it would be difficult and confusing to de-dupe/handle shortname conflicts
    // as well as longname conflicts
    let definedParameter: CommandLineParameter;
    switch (parameter.parameterKind) {
      case 'flag': {
        definedParameter = commandLineParameterProvider.defineFlagParameter({
          description: parameter.description,
          required: parameter.required,
          customNameValidator: this._validateParameterName,
          parameterLongName,
          undocumentedSynonyms
        });
        break;
      }
      case 'choice': {
        definedParameter = commandLineParameterProvider.defineChoiceParameter({
          description: parameter.description,
          required: parameter.required,
          alternatives: parameter.alternatives.map((p: IChoiceParameterAlternativeJson) => p.name),
          defaultValue: parameter.defaultValue,
          customNameValidator: this._validateParameterName,
          parameterLongName,
          undocumentedSynonyms
        });
        break;
      }
      case 'string': {
        definedParameter = commandLineParameterProvider.defineStringParameter({
          description: parameter.description,
          required: parameter.required,
          argumentName: parameter.argumentName,
          customNameValidator: this._validateParameterName,
          parameterLongName,
          undocumentedSynonyms
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
          `"${pluginDefinition.pluginName}".`
      );
    }
    // Add the parameter to the map using the original long name, so that it can be retrieved by plugins
    // under the original long name.
    pluginParameters.set(parameterConfiguration.parameter.longName, definedParameter);
  }

  private _generateScopedParameterLongName(parameterConfiguration: IParameterConfiguration): string {
    let parameterLongName: string = parameterConfiguration.parameter.longName;
    if (parameterLongName.startsWith('--')) {
      parameterLongName = parameterLongName.slice(2);
    }
    return `--${parameterConfiguration.pluginDefinition.pluginName}:${parameterLongName}`;
  }

  private _validateParameterName(longName: string): boolean {
    return SYNONYM_REGEX.test(longName);
  }
}
