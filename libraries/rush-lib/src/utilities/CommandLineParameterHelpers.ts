// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { CommandLineAction, CommandLineParameter } from '@rushstack/ts-command-line';

import type { IParameterJson } from '../api/CommandLineConfiguration';
import { RushConstants } from '../logic/RushConstants';
import type { ParameterJson } from '../api/CommandLineJson';

/**
 * Helper function to create CommandLineParameter instances from parameter definitions.
 * This centralizes the logic for defining parameters based on their kind.
 *
 * @param action - The CommandLineAction to define the parameters on
 * @param associatedParameters - The set of parameter definitions
 * @returns A map from parameter longName to the created CommandLineParameter instance
 */
export function createCommandLineParameters(
  action: CommandLineAction,
  associatedParameters: Iterable<IParameterJson>
): Map<string, CommandLineParameter> {
  const customParameters: Map<string, CommandLineParameter> = new Map();

  for (const parameter of associatedParameters) {
    let tsCommandLineParameter: CommandLineParameter | undefined;

    switch (parameter.parameterKind) {
      case 'flag':
        tsCommandLineParameter = action.defineFlagParameter({
          parameterShortName: parameter.shortName,
          parameterLongName: parameter.longName,
          description: parameter.description,
          required: parameter.required
        });
        break;
      case 'choice':
        tsCommandLineParameter = action.defineChoiceParameter({
          parameterShortName: parameter.shortName,
          parameterLongName: parameter.longName,
          description: parameter.description,
          required: parameter.required,
          alternatives: parameter.alternatives.map((x) => x.name),
          defaultValue: parameter.defaultValue
        });
        break;
      case 'string':
        tsCommandLineParameter = action.defineStringParameter({
          parameterLongName: parameter.longName,
          parameterShortName: parameter.shortName,
          description: parameter.description,
          required: parameter.required,
          argumentName: parameter.argumentName
        });
        break;
      case 'integer':
        tsCommandLineParameter = action.defineIntegerParameter({
          parameterLongName: parameter.longName,
          parameterShortName: parameter.shortName,
          description: parameter.description,
          required: parameter.required,
          argumentName: parameter.argumentName
        });
        break;
      case 'stringList':
        tsCommandLineParameter = action.defineStringListParameter({
          parameterLongName: parameter.longName,
          parameterShortName: parameter.shortName,
          description: parameter.description,
          required: parameter.required,
          argumentName: parameter.argumentName
        });
        break;
      case 'integerList':
        tsCommandLineParameter = action.defineIntegerListParameter({
          parameterLongName: parameter.longName,
          parameterShortName: parameter.shortName,
          description: parameter.description,
          required: parameter.required,
          argumentName: parameter.argumentName
        });
        break;
      case 'choiceList':
        tsCommandLineParameter = action.defineChoiceListParameter({
          parameterShortName: parameter.shortName,
          parameterLongName: parameter.longName,
          description: parameter.description,
          required: parameter.required,
          alternatives: parameter.alternatives.map((x) => x.name)
        });
        break;
      default:
        throw new Error(
          `${RushConstants.commandLineFilename} defines a parameter "${
            (parameter as ParameterJson).longName
          }" using an unsupported parameter kind "${(parameter as ParameterJson).parameterKind}"`
        );
    }

    customParameters.set(parameter.longName, tsCommandLineParameter);
  }

  return customParameters;
}
