// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';
import * as path from 'path';
import { LockFile, FileSystem } from '@rushstack/node-core-library';

import { LastInstallFlag } from '../api/LastInstallFlag';
import { Utilities } from '../utilities/Utilities';
import { PackageManagerName } from '../api/packageManager/PackageManager';
import { RushConfiguration } from '../api/RushConfiguration';
import { RushGlobalFolder } from '../api/RushGlobalFolder';

export class InstallHelpers {
  /**
   * If the "(p)npm-local" symlink hasn't been set up yet, this creates it, installing the
   * specified (P)npm version in the user's home directory if needed.
   */
  public static async ensureLocalPackageManager(
    rushConfiguration: RushConfiguration,
    rushGlobalFolder: RushGlobalFolder,
    maxInstallAttempts: number
  ): Promise<void> {
    // Example: "C:\Users\YourName\.rush"
    const rushUserFolder: string = rushGlobalFolder.nodeSpecificPath;

    if (!FileSystem.exists(rushUserFolder)) {
      console.log('Creating ' + rushUserFolder);
      FileSystem.ensureFolder(rushUserFolder);
    }

    const packageManager: PackageManagerName = rushConfiguration.packageManager;
    const packageManagerVersion: string = rushConfiguration.packageManagerToolVersion;

    const packageManagerAndVersion: string = `${packageManager}-${packageManagerVersion}`;
    // Example: "C:\Users\YourName\.rush\pnpm-1.2.3"
    const packageManagerToolFolder: string = path.join(rushUserFolder, packageManagerAndVersion);

    const packageManagerMarker: LastInstallFlag = new LastInstallFlag(packageManagerToolFolder, {
      node: process.versions.node
    });

    console.log(`Trying to acquire lock for ${packageManagerAndVersion}`);

    const lock: LockFile = await LockFile.acquire(rushUserFolder, packageManagerAndVersion);

    console.log(`Acquired lock for ${packageManagerAndVersion}`);

    if (!packageManagerMarker.isValid() || lock.dirtyWhenAcquired) {
      console.log(colors.bold(`Installing ${packageManager} version ${packageManagerVersion}${os.EOL}`));

      // note that this will remove the last-install flag from the directory
      Utilities.installPackageInDirectory({
        directory: packageManagerToolFolder,
        packageName: packageManager,
        version: rushConfiguration.packageManagerToolVersion,
        tempPackageTitle: `${packageManager}-local-install`,
        maxInstallAttempts: maxInstallAttempts,
        // This is using a local configuration to install a package in a shared global location.
        // Generally that's a bad practice, but in this case if we can successfully install
        // the package at all, we can reasonably assume it's good for all the repositories.
        // In particular, we'll assume that two different NPM registries cannot have two
        // different implementations of the same version of the same package.
        // This was needed for: https://github.com/microsoft/rushstack/issues/691
        commonRushConfigFolder: rushConfiguration.commonRushConfigFolder
      });

      console.log(`Successfully installed ${packageManager} version ${packageManagerVersion}`);
    } else {
      console.log(`Found ${packageManager} version ${packageManagerVersion} in ${packageManagerToolFolder}`);
    }

    packageManagerMarker.create();

    // Example: "C:\MyRepo\common\temp"
    FileSystem.ensureFolder(rushConfiguration.commonTempFolder);

    // Example: "C:\MyRepo\common\temp\pnpm-local"
    const localPackageManagerToolFolder: string = path.join(
      rushConfiguration.commonTempFolder,
      `${packageManager}-local`
    );

    console.log(os.EOL + 'Symlinking "' + localPackageManagerToolFolder + '"');
    console.log('  --> "' + packageManagerToolFolder + '"');

    // We cannot use FileSystem.exists() to test the existence of a symlink, because it will
    // return false for broken symlinks.  There is no way to test without catching an exception.
    try {
      FileSystem.deleteFolder(localPackageManagerToolFolder);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    FileSystem.createSymbolicLinkJunction({
      linkTargetPath: packageManagerToolFolder,
      newLinkPath: localPackageManagerToolFolder
    });

    lock.release();
  }
}
