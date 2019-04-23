// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver from 'semver';
import { RushConstants } from '../logic/RushConstants';

/**
 * This represents the available Package Manager tools as a string
 * @public
 */
export type PackageManager = 'pnpm' | 'npm' | 'yarn';

/**
 * Reports the known features of a package manager as detected from its version number.
 * @beta
 */
export class PackageManagerFeatureSet {
  /**
   * The package manager.
   */
  public readonly packageManager: PackageManager;

  /**
   * The SemVer version of the package manager.
   */
  public readonly version: string;

  /**
   * The filename of the shrinkwrap file that is used by the package manager.
   *
   * @remarks
   * Example: `npm-shrinkwrap.json` or `pnpm-lock.yaml`
   */
  public readonly shrinkwrapFilename: string;

  /**
   * PNPM only.  True if `--resolution-strategy` is supported.
   */
  public readonly supportsPnpmResolutionStrategy: boolean;

  public constructor(packageManager: PackageManager, version: string) {
    this.packageManager = packageManager;
    this.version = version;

    const parsedVersion: semver.SemVer = new semver.SemVer(version);

    this.supportsPnpmResolutionStrategy = false;

    switch (this.packageManager) {
      case 'pnpm':
        if (parsedVersion.major >= 3) {
          this.shrinkwrapFilename = RushConstants.pnpmV3ShrinkwrapFilename;

          if (parsedVersion.minor >= 1) {
            // Introduced in version 3.1.0-0
            this.supportsPnpmResolutionStrategy = true;
          }
        } else {
          this.shrinkwrapFilename = RushConstants.pnpmV1ShrinkwrapFilename;
        }
        break;
      case 'npm':
        this.shrinkwrapFilename = RushConstants.npmShrinkwrapFilename;
        break;
      case 'yarn':
        this.shrinkwrapFilename = RushConstants.yarnShrinkwrapFilename;
        break;
    }
  }
}
