// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as semver from 'semver';

import {
  LockFile,
  Logging
} from '@microsoft/node-core-library';
import { Utilities } from '@microsoft/rush-lib/lib/utilities/Utilities';
import * as rushLib from '@microsoft/rush-lib';

const MAX_INSTALL_ATTEMPTS: number = 3;

export class RushVersionSelector {
  private _rushDirectory: string;
  private _currentPackageVersion: string;

  constructor(currentPackageVersion: string) {
    this._rushDirectory = path.join(Utilities.getHomeDirectory(), '.rush');
    this._currentPackageVersion = currentPackageVersion;
  }

  public ensureRushVersionInstalled(version: string): Promise<void> {
    const isLegacyRushVersion: boolean = semver.lt(version, '4.0.0');
    const expectedRushPath: string = path.join(this._rushDirectory, `rush-${version}`);

    const installMarker: rushLib._LastInstallFlag = new rushLib._LastInstallFlag(
      expectedRushPath,
      { node: process.versions.node }
    );

    let installPromise: Promise<void> = Promise.resolve();

    if (!installMarker.isValid()) {
      installPromise = installPromise.then(() => {
        // Need to install Rush
        Logging.log(`Rush version ${version} is not currently installed. Installing...`);

        const resourceName: string = `rush-${version}`;

        Logging.log(`Trying to acquire lock for ${resourceName}`);

        return LockFile.acquire(expectedRushPath, resourceName)
          .then((lock: LockFile) => {

            if (installMarker.isValid()) {
              Logging.log('Another process performed the installation.');
            } else {
              Utilities.installPackageInDirectory(
                expectedRushPath,
                isLegacyRushVersion ? '@microsoft/rush' : '@microsoft/rush-lib',
                version,
                'rush-local-install',
                MAX_INSTALL_ATTEMPTS,
                true
              );

              Logging.log(`Successfully installed Rush version ${version} in ${expectedRushPath}.`);

              // If we've made it here without exception, write the flag file
              installMarker.create();

              lock.release();
            }
          });
      });
    }

    return installPromise.then(() => {
      if (semver.lt(version, '3.0.20')) {
        require(path.join(
          expectedRushPath,
          'node_modules',
          '@microsoft',
          'rush',
          'lib',
          'rush'
        ));
      } else if (semver.lt(version, '4.0.0')) {
        require(path.join(
          expectedRushPath,
          'node_modules',
          '@microsoft',
          'rush',
          'lib',
          'start'
        ));
      } else {
        const rushCliEntrypoint: typeof rushLib = require(path.join(
          expectedRushPath,
          'node_modules',
          '@microsoft',
          'rush-lib',
          'lib',
          'index'
        ));
        rushCliEntrypoint.Rush.launch(this._currentPackageVersion, true);
      }
    });
  }
}
