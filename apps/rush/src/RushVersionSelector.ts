// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as semver from 'semver';

import { LockFile } from '@microsoft/node-core-library';
import {
  IPackageSelector,
  Utilities
} from '@microsoft/rush-lib/lib/utilities/Utilities';
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

  public constructor(currentPackageVersion: string) {
    this._rushGlobalFolder = new _RushGlobalFolder();
    this._currentPackageVersion = currentPackageVersion;
  }

  public ensureRushVersionInstalled(
    rushVersion: string,
    configuration: MinimalRushConfiguration | undefined,
    executeOptions: ILaunchOptions
  ): Promise<void> {

    const isLegacyRushVersion: boolean = semver.lt(rushVersion, '4.0.0');
    const expectedRushPath: string = path.join(this._rushGlobalFolder.nodeSpecificPath, `rush-${rushVersion}`);

    const installMarker: _LastInstallFlag = new _LastInstallFlag(
      expectedRushPath,
      { node: process.versions.node }
    );

    let installPromise: Promise<void> = Promise.resolve();

    if (!installMarker.isValid()) {
      installPromise = installPromise.then(() => {
        // Need to install Rush
        console.log(`Rush version ${rushVersion} is not currently installed. Installing...`);

        const resourceName: string = `rush-${rushVersion}`;

        console.log(`Trying to acquire lock for ${resourceName}`);

        return LockFile.acquire(expectedRushPath, resourceName)
          .then((lock: LockFile) => {

            if (installMarker.isValid()) {
              console.log('Another process performed the installation.');
            } else {
              const packages: IPackageSelector[] = [{
                name: isLegacyRushVersion ? '@microsoft/rush' : '@microsoft/rush-lib',
                version: rushVersion
              }];

              if (semver.lt(rushVersion, '5.19.0')) {
                // Versions of Rush before 5.19.0 indirectly depended on "mkdirp": "*", which was broken
                // in version 1.0.0. To make installs of older versions of Rush work, provide a hint to the package
                // manager that a known-good version of "mkdirp" should be installed.
                packages.push({
                  name: 'mkdirp',
                  version: '0.5.1'
                });
              }

              Utilities.installPackagesInDirectory({
                packages,
                directory: expectedRushPath,
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

              console.log(`Successfully installed Rush version ${rushVersion} in ${expectedRushPath}.`);

              // If we've made it here without exception, write the flag file
              installMarker.create();

              lock.release();
            }
          });
      });
    }

    return installPromise.then(() => {
      if (semver.lt(rushVersion, '3.0.20')) {
        // In old versions, requiring the entry point invoked the command-line parser immediately,
        // so fail if "rushx" was used
        RushCommandSelector.failIfNotInvokedAsRush(rushVersion);
        require(path.join(
          expectedRushPath,
          'node_modules',
          '@microsoft',
          'rush',
          'lib',
          'rush'
        ));
      } else if (semver.lt(rushVersion, '4.0.0')) {
        // In old versions, requiring the entry point invoked the command-line parser immediately,
        // so fail if "rushx" was used
        RushCommandSelector.failIfNotInvokedAsRush(rushVersion);
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
        // eslint-disable-next-line @typescript-eslint/no-var-requires
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
