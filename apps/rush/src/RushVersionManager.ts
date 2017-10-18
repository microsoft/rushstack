// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fsx from 'fs-extra';
import * as semver from 'semver';
import { Utilities } from '@microsoft/rush-lib';

import RushWrapper from './RushWrapper';

const RUSH_TRANSITIONAL_VERSION: string = '4.0.0';
const MAX_INSTALL_ATTEMPTS: number = 5;

interface IRushCliEntrypoint {
  executeCli(): void;
}

export default class RushVersionManager {
  private _rushDirectory: string;

  constructor(homeDirectory: string) {
    this._rushDirectory = path.join(homeDirectory, '.rush');
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
        const rushCliEntrypoint: IRushCliEntrypoint = require(path.join(
          expectedRushPath,
          'node_modules',
          '@microsoft',
          'rush-lib',
          'lib',
          'cli',
          'executeCli'
        ));
        rushCliEntrypoint.executeCli();
      });
    }
  }
}
