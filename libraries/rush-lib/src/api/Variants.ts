// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { CommandLineStringParameter, ICommandLineStringDefinition } from '@rushstack/ts-command-line';

import { EnvironmentVariableNames } from './EnvironmentConfiguration.ts';
import type { RushConfiguration } from './RushConfiguration.ts';
import { RushConstants } from '../logic/RushConstants.ts';

/**
 * Provides the parameter configuration for '--variant'.
 */
export const VARIANT_PARAMETER: ICommandLineStringDefinition = {
  parameterLongName: '--variant',
  argumentName: 'VARIANT',
  description: 'Run command using a variant installation configuration',
  environmentVariable: EnvironmentVariableNames.RUSH_VARIANT
};

export async function getVariantAsync(
  variantsParameter: CommandLineStringParameter | undefined,
  rushConfiguration: RushConfiguration,
  defaultToCurrentlyInstalledVariant: boolean
): Promise<string | undefined> {
  let variant: string | undefined = variantsParameter?.value;
  if (variant && !rushConfiguration.variants.has(variant)) {
    throw new Error(`The variant "${variant}" is not defined in ${RushConstants.rushJsonFilename}`);
  }

  if (!variant && defaultToCurrentlyInstalledVariant) {
    variant = await rushConfiguration.getCurrentlyInstalledVariantAsync();
  }

  return variant;
}
