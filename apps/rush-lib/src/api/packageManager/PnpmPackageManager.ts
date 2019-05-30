// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver from 'semver';
import { RushConstants } from '../../logic/RushConstants';
import { PackageManager } from './PackageManager';

/**
 * Support for interacting with the PNPM package manager.
 */
export class PnpmPackageManager extends PackageManager {
  /**
   * PNPM only.  True if `--resolution-strategy` is supported.
   */
  public readonly supportsResolutionStrategy: boolean;

  /** @internal */
  public constructor(version: string) {
    super(version, 'pnpm');

    const parsedVersion: semver.SemVer = new semver.SemVer(version);

    this.supportsResolutionStrategy = false;

    if (parsedVersion.major >= 3) {
      this._shrinkwrapFilename = RushConstants.pnpmV3ShrinkwrapFilename;

      if (parsedVersion.minor >= 1) {
        // Introduced in version 3.1.0-0
        this.supportsResolutionStrategy = true;
      }
    } else {
      this._shrinkwrapFilename = RushConstants.pnpmV1ShrinkwrapFilename;
    }
  }
}
