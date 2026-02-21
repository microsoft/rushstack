// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfiguration } from '../../api/RushConfiguration.ts';
import type { IPolicyValidatorOptions } from './PolicyValidator.ts';
import type { BaseShrinkwrapFile } from '../base/BaseShrinkwrapFile.ts';
import { ShrinkwrapFileFactory } from '../ShrinkwrapFileFactory.ts';
import type { RepoStateFile } from '../RepoStateFile.ts';
import type { Subspace } from '../../api/Subspace.ts';

export interface IShrinkwrapFilePolicyValidatorOptions extends IPolicyValidatorOptions {
  repoState: RepoStateFile;
}

/**
 *  A policy that validates shrinkwrap files used by package managers.
 */
export function validate(
  rushConfiguration: RushConfiguration,
  subspace: Subspace,
  variant: string | undefined,
  options: IPolicyValidatorOptions
): void {
  // eslint-disable-next-line no-console
  console.log('Validating package manager shrinkwrap file.\n');
  const shrinkwrapFile: BaseShrinkwrapFile | undefined = ShrinkwrapFileFactory.getShrinkwrapFile({
    packageManager: rushConfiguration.packageManager,
    shrinkwrapFilePath: subspace.getCommittedShrinkwrapFilePath(variant),
    subspaceHasNoProjects: subspace.getProjects().length === 0
  });

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
