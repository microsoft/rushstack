// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as semver from 'semver';

import { LockFile } from '@microsoft/node-core-library';
import { Utilities } from '@microsoft/rush-lib/lib/utilities/Utilities';
import {
  _LastInstallFlag,
  _RushGlobalFolder,
  ILaunchOptions
} from '@microsoft/rush-lib';

import { RushCommandSelector } from './RushCommandSelector';
import { MinimalRushConfiguration } from './MinimalRushConfiguration';

const MAX_INSTALL_ATTEMPTS: number = 3;

export class RushVersionSelector {
  private _rushGlobalFolder: _RushGlobalFolder;
  private _currentPackageVersion: string;

  constructor(currentPackageVersion: string) {
    this._rushGlobalFolder = new _RushGlobalFolder();
    this._currentPackageVersion = currentPackageVersion;
  }

  public ensureRushVersionInstalled(
    version: string,
    configuration: MinimalRushConfiguration | undefined,
    executeOptions: ILaunchOptions
  ): Promise<void> {

    const isLegacyRushVersion: boolean = semver.lt(version, '4.0.0');
    const expectedRushPath: string = path.join(this._rushGlobalFolder.nodeSpecificPath, `rush-${version}`);

    const installMarker: _LastInstallFlag = new _LastInstallFlag(
      expectedRushPath,
      { node: process.versions.node }
    );

    let installPromise: Promise<void> = Promise.resolve();

    if (!installMarker.isValid()) {
      installPromise = installPromise.then(() => {
        // Need to install Rush
        console.log(`Rush version ${version} is not currently installed. Installing...`);

        const resourceName: string = `rush-${version}`;

        console.log(`Trying to acquire lock for ${resourceName}`);

        return LockFile.acquire(expectedRushPath, resourceName)
          .then((lock: LockFile) => {

            if (installMarker.isValid()) {
              console.log('Another process performed the installation.');
            } else {
              Utilities.installPackageInDirectory({
                directory: expectedRushPath,
                packageName: isLegacyRushVersion ? '@microsoft/rush' : '@microsoft/rush-lib',
                version: version,
                tempPackageTitle: 'rush-local-install',
                maxInstallAttempts: MAX_INSTALL_ATTEMPTS,
                // This is using a local configuration to install a package in a shared global location.
                // Generally that's a bad practice, but in this case if we can successfully install
                // the package at all, we can reasonably assume it's good for all the repositories.
                // In particular, we'll assume that two different NPM registries cannot have two
                // different implementations of the same version of the same package.
                // This was needed for: https://github.com/microsoft/rushstack/issues/691
                commonRushConfigFolder: configuration ? configuration.commonRushConfigFolder : undefined,
                suppressOutput: true
              });

              console.log(`Successfully installed Rush version ${version} in ${expectedRushPath}.`);

              // If we've made it here without exception, write the flag file
              installMarker.create();

              lock.release();
            }
          });
      });
    }

    return installPromise.then(() => {
      if (semver.lt(version, '3.0.20')) {
        // In old versions, requiring the entry point invoked the command-line parser immediately,
        // so fail if "rushx" was used
        RushCommandSelector.failIfNotInvokedAsRush(version);
        require(path.join(
          expectedRushPath,
          'node_modules',
          '@microsoft',
          'rush',
          'lib',
          'rush'
        ));
      } else if (semver.lt(version, '4.0.0')) {
        // In old versions, requiring the entry point invoked the command-line parser immediately,
        // so fail if "rushx" was used
        RushCommandSelector.failIfNotInvokedAsRush(version);
        require(path.join(
          expectedRushPath,
          'node_modules',
          '@microsoft',
          'rush',
          'lib',
          'start'
        ));
      } else {
        // For newer rush-lib, RushCommandSelector can test whether "rushx" is supported or not
        const rushCliEntrypoint: { } = require(path.join(
          expectedRushPath,
          'node_modules',
          '@microsoft',
          'rush-lib',
          'lib',
          'index'
        ));
        RushCommandSelector.execute(this._currentPackageVersion, rushCliEntrypoint, executeOptions);
      }
    });
  }
}
