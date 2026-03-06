// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AlreadyReportedError, Async, FileSystem } from '@rushstack/node-core-library';

import type { RushConfiguration } from '../../api/RushConfiguration.ts';
import type { IPolicyValidatorOptions } from './PolicyValidator.ts';
import { RushConstants } from '../RushConstants.ts';

/**
 * Ensures the environment where the Rush repo exists is valid
 */
export async function validateAsync(
  rushConfiguration: RushConfiguration,
  options: IPolicyValidatorOptions
): Promise<void> {
  if (rushConfiguration.experimentsConfiguration.configuration.forbidPhantomResolvableNodeModulesFolders) {
    const pathParts: string[] = rushConfiguration.rushJsonFolder.split(/[\/\\]/);
    const existingNodeModulesPaths: string[] = [];
    await Async.forEachAsync(
      pathParts,
      async (pathPart: string, index: number) => {
        const potentialNodeModulesPath: string = `${pathParts.slice(0, index + 1).join('/')}/node_modules`;
        const pathExists: boolean = await FileSystem.existsAsync(potentialNodeModulesPath);
        if (pathExists) {
          existingNodeModulesPaths.push(potentialNodeModulesPath);
        }
      },
      { concurrency: 5 }
    );

    if (existingNodeModulesPaths.length > 0) {
      const paths: string = existingNodeModulesPaths.sort().join(', ');
      let errorMessage: string =
        `The following node_modules folders exist in the path to the Rush repo: ${paths}. ` +
        `This is not supported, and may cause issues.`;
      if (options.bypassPolicyAllowed) {
        errorMessage += ` To ignore, use the "${RushConstants.bypassPolicyFlagLongName}" flag.`;
      }

      // eslint-disable-next-line no-console
      console.error(errorMessage);
      throw new AlreadyReportedError();
    }
  }
}
