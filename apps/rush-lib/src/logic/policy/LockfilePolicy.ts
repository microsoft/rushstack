// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';
import { InternalError } from '@microsoft/node-core-library';
import { RushConfiguration } from '../../api/RushConfiguration';
import { AlreadyReportedError } from '../../utilities/AlreadyReportedError';
import { IPolicyValidatorOptions } from './PolicyValidator';
import { BaseShrinkwrapFile } from '../base/BaseShrinkwrapFile';
import { ShrinkwrapFileFactory } from '../ShrinkwrapFileFactory';

export class LockfilePolicy {
  public static validate(rushConfiguration: RushConfiguration, options: IPolicyValidatorOptions): void {
    // If allowShrinkwrapUpdates is true, then we're updating the shrinkwrap
    // and cannot validate the hash
    if (options.allowShrinkwrapUpdates) {
      return;
    }

    if (!LockfilePolicy.isEnabled(rushConfiguration)) {
      // If the option wasn't provided
      console.log(
        colors.cyan(
          'Ignoring lockfile validation because it was not enabled or is not supported ' +
          'with the specified package manager.'
        ) + os.EOL
      );
      return;
    }

    console.log('Checking shrinkwrap hash to validate no manual changes were made.' + os.EOL);

    // Since we know it is PNPM specific, we can assume the shrinkwrap type.
    const shrinkwrapFile: BaseShrinkwrapFile | undefined = ShrinkwrapFileFactory.getShrinkwrapFile(
      rushConfiguration.packageManager,
      rushConfiguration.getCommittedShrinkwrapFilename(options.shrinkwrapVariant)
    );

    if (!shrinkwrapFile) {
      throw new InternalError('Could not load the shrinkwrap');
    }

    const storedShrinkwrapHash: string | undefined = shrinkwrapFile.shrinkwrapHash;
    if (!storedShrinkwrapHash) {
      console.log(
        colors.red(
          'The lockfile does not contain the generated hash. You may need to run "rush update" to populate the hash.'
        ) + os.EOL
      );
      throw new AlreadyReportedError();
    }

    shrinkwrapFile.updateShrinkwrapHash();
    if (storedShrinkwrapHash !== shrinkwrapFile.shrinkwrapHash) {
      console.log(
        colors.red(
          `The lockfile hash "${storedShrinkwrapHash}" does not match the generated hash ` +
          `"${shrinkwrapFile.shrinkwrapHash}". If you have manually edited the lockfile, ` +
          'please revert any changes and run "rush update".'
        ) + os.EOL
      );
      throw new AlreadyReportedError();
    }
  }

  public static isEnabled(rushConfiguration: RushConfiguration): boolean {
    return rushConfiguration.packageManager === 'pnpm' &&
      rushConfiguration.pnpmOptions &&
      rushConfiguration.pnpmOptions.preventManualLockfileChanges;
  }

  public static ensureHash(rushConfiguration: RushConfiguration, shrinkwrapFilename: string): void {
    if (LockfilePolicy.isEnabled(rushConfiguration)) {
      const shrinkwrapFile: BaseShrinkwrapFile | undefined =
        ShrinkwrapFileFactory.getShrinkwrapFile(rushConfiguration.packageManager, shrinkwrapFilename);
      if (shrinkwrapFile && !shrinkwrapFile.shrinkwrapHash) {
        shrinkwrapFile.updateShrinkwrapHash();
        shrinkwrapFile.save(shrinkwrapFilename);
      }
    }
  }
}
