// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fsx from 'fs-extra';
import * as semver from 'semver';

import Utilities from '@microsoft/rush-lib/lib/utilities/Utilities';
import * as rushLib from '@microsoft/rush-lib';

const MAX_INSTALL_ATTEMPTS: number = 3;

export default class RushVersionManager {
  private _rushDirectory: string;
  private _currentPackageVersion: string;

  constructor(homeDirectory: string, currentPackageVersion: string) {
    this._rushDirectory = path.join(homeDirectory, '.rush');
    this._currentPackageVersion = currentPackageVersion;
  }

  public ensureRushVersionInstalled(version: string): () => void {
    const isLegacyRushVersion: boolean = semver.lt(version, '4.0.0');
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

    if (semver.lt(version, '3.0.20')) {
      return () => {
        require(path.join(
          expectedRushPath,
          'node_modules',
          '@microsoft',
          'rush',
          'lib',
          'rush'
        ));
      };
    } else if (semver.lt(version, '4.0.0')) {
      return () => {
        require(path.join(
          expectedRushPath,
          'node_modules',
          '@microsoft',
          'rush',
          'lib',
          'start'
        ));
      };
    } else {
      return () => {
        const rushCliEntrypoint: typeof rushLib = require(path.join(
          expectedRushPath,
          'node_modules',
          '@microsoft',
          'rush-lib',
          'lib',
          'index'
        ));
        rushCliEntrypoint.Rush.launch(this._currentPackageVersion, true);
      };
    }
  }
}
