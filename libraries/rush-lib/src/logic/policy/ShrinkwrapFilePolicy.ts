// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfiguration } from '../../api/RushConfiguration';
import type { IPolicyValidatorOptions } from './PolicyValidator';
import type { BaseShrinkwrapFile } from '../base/BaseShrinkwrapFile';
import { ShrinkwrapFileFactory } from '../ShrinkwrapFileFactory';
import type { RepoStateFile } from '../RepoStateFile';
import type { Subspace } from '../../api/Subspace';

export interface IShrinkwrapFilePolicyValidatorOptions extends IPolicyValidatorOptions {
  repoState: RepoStateFile;
}

/**
 *  A policy that validates shrinkwrap files used by package managers.
 */
export async function validateAsync(
  rushConfiguration: RushConfiguration,
  subspace: Subspace,
  variant: string | undefined,
  options: IPolicyValidatorOptions
): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('Validating package manager shrinkwrap file.\n');
  const shrinkwrapFile: BaseShrinkwrapFile | undefined = await ShrinkwrapFileFactory.getShrinkwrapFileAsync(
    rushConfiguration.packageManager,
    subspace.getCommittedShrinkwrapFilePath(variant)
  );

  if (!shrinkwrapFile) {
    // eslint-disable-next-line no-console
    console.log('Shrinkwrap file could not be found, skipping validation.\n');
    return;
  }

  // Run shrinkwrap-specific validation
  shrinkwrapFile.validate(
    rushConfiguration.packageManagerOptions,
    {
      ...options,
      repoState: subspace.getRepoState()
    },
    rushConfiguration.experimentsConfiguration.configuration
  );
}
