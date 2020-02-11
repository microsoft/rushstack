// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';
import { RushConfiguration } from '../../api/RushConfiguration';
import { AlreadyReportedError } from '../../utilities/AlreadyReportedError';
import { IPolicyValidatorOptions } from './PolicyValidator';
import { BaseShrinkwrapFile } from '../base/BaseShrinkwrapFile';
import { ShrinkwrapFileFactory } from '../ShrinkwrapFileFactory';

/**
 *  A policy that prevents manual changes to shrinkwrap files used by package managers. This policy can
 *  be enabled by setting PnpmOptionsConfiguration.preventManualShrinkwrapChanges to true.gul
 */
export class ShrinkwrapFilePolicy {
  public static validate(rushConfiguration: RushConfiguration, options: IPolicyValidatorOptions): void {
    // If allowShrinkwrapUpdates is true, then we're updating the shrinkwrap and cannot validate
    // the hash. Additionally, we need to check that the feature is enabled at all.
    if (options.allowShrinkwrapUpdates || !ShrinkwrapFilePolicy.isEnabled(rushConfiguration)) {
      return;
    }

    console.log('Checking shrinkwrap file hash to ensure no invalid changes were made.' + os.EOL);

    // Since we know it is PNPM specific, we can assume the shrinkwrap type.
    const shrinkwrapFile: BaseShrinkwrapFile | undefined = ShrinkwrapFileFactory.getShrinkwrapFile(
      rushConfiguration.packageManager,
      rushConfiguration.getCommittedShrinkwrapFilename(options.shrinkwrapVariant)
    );

    if (!shrinkwrapFile) {
      throw new Error('Could not load the shrinkwrap file!');
    }

    const storedShrinkwrapHash: string | undefined = shrinkwrapFile.shrinkwrapHash;
    if (!storedShrinkwrapHash) {
      console.log(
        colors.red(
          'The shrinkwrap file does not contain the generated hash. You may need to run "rush update" to ' +
          'populate the hash.'
        ) + os.EOL
      );
      throw new AlreadyReportedError();
    }

    shrinkwrapFile.updateShrinkwrapHash();
    if (storedShrinkwrapHash !== shrinkwrapFile.shrinkwrapHash) {
      console.log(
        colors.red(
          'The shrinkwrap file hash does not match the generated hash. Please run "rush update" to ensure the ' +
          'shrinkwrap file is up to date.'
        ) + os.EOL
      );
      throw new AlreadyReportedError();
    }
  }

  public static isEnabled(rushConfiguration: RushConfiguration): boolean {
    return rushConfiguration.packageManager === 'pnpm' &&
      rushConfiguration.pnpmOptions &&
      rushConfiguration.pnpmOptions.preventManualShrinkwrapChanges;
  }

  public static ensureHash(rushConfiguration: RushConfiguration, shrinkwrapFilename: string): void {
    if (ShrinkwrapFilePolicy.isEnabled(rushConfiguration)) {
      const shrinkwrapFile: BaseShrinkwrapFile | undefined =
        ShrinkwrapFileFactory.getShrinkwrapFile(rushConfiguration.packageManager, shrinkwrapFilename);
      if (shrinkwrapFile && !shrinkwrapFile.shrinkwrapHash) {
        shrinkwrapFile.updateShrinkwrapHash();
        shrinkwrapFile.save(shrinkwrapFilename);
      }
    }
  }
}
