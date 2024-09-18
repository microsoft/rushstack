// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { CommandLineStringParameter, ICommandLineStringDefinition } from '@rushstack/ts-command-line';

import { EnvironmentVariableNames } from './EnvironmentConfiguration';
import type { RushConfiguration } from './RushConfiguration';
import { RushConstants } from '../logic/RushConstants';

/**
 * Provides the parameter configuration for '--variant'.
 */
export const VARIANT_PARAMETER: ICommandLineStringDefinition = {
  parameterLongName: '--variant',
  argumentName: 'VARIANT',
  description: 'Run command using a variant installation configuration',
  environmentVariable: EnvironmentVariableNames.RUSH_VARIANT
};

export function getVariant(
  variantsParameter: CommandLineStringParameter,
  rushConfiguration: RushConfiguration
): string | undefined {
  const variant: string | undefined = variantsParameter.value;
  if (variant && !rushConfiguration.variants.has(variant)) {
    throw new Error(`The variant "${variant}" is not defined in ${RushConstants.rushJsonFilename}`);
  }

  return variant;
}
