// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fsx from 'fs-extra';
import * as semver from 'semver';

import { Utilities } from '@microsoft/rush-lib';
import * as rushLibCli from '@microsoft/rush-lib/lib/start';

import RushWrapper from './RushWrapper';

/**
 * Version 4.0.0 is the first version where the rush CLI implementation is in rush-lib. This version changes the
 *  installation and calling convention.
 */
const RUSH_TRANSITIONAL_VERSION: string = '4.0.0';
const MAX_INSTALL_ATTEMPTS: number = 3;

export default class RushVersionManager {
  private _rushDirectory: string;
  private _currentPackageVersion: string;

  constructor(homeDirectory: string, currentPackageVersion: string) {
    this._rushDirectory = path.join(homeDirectory, '.rush');
    this._currentPackageVersion = currentPackageVersion;
  }

  public ensureRushVersionInstalled(version: string): RushWrapper {
    const isLegacyRushVersion: boolean = semver.lt(version, RUSH_TRANSITIONAL_VERSION);
    const expectedRushPath: string = path.join(this._rushDirectory, `rush-${version}`);
    const expectedRushInstalledFlagPath: string = path.join(expectedRushPath, 'last-install.flag');
    if (!fsx.existsSync(expectedRushInstalledFlagPath)) {
      // Need to install Rush
      console.log(`Rush version ${version} is not currently installed. Installing...`);

      Utilities.installPackageInDirectory(
        expectedRushPath,
        isLegacyRushVersion ? '@microsoft/rush' : '@microsoft/rush-lib',
        version,
        'rush-local-install',
        MAX_INSTALL_ATTEMPTS,
        true
      );

      // If we've made it here without exception, write the flag file
      fsx.createFileSync(expectedRushInstalledFlagPath);
      console.log(`Successfully installed Rush version ${version} in ${expectedRushPath}`);
    }

    if (isLegacyRushVersion) {
      return new RushWrapper(() => {
        require(path.join(expectedRushPath, 'node_modules', '@microsoft', 'rush', 'lib', 'rush'));
      });
    } else {
      return new RushWrapper(() => {
        const rushCliEntrypoint: typeof rushLibCli = require(path.join(
          expectedRushPath,
          'node_modules',
          '@microsoft',
          'rush-lib',
          'lib',
          'start'
        ));
        rushCliEntrypoint.start(this._currentPackageVersion, true);
      });
    }
  }
}
