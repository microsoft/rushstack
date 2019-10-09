// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver from 'semver';
import { RushConstants } from '../../logic/RushConstants';
import { PackageManager } from './PackageManager';
import * as path from 'path';

/**
 * Support for interacting with the PNPM package manager.
 */
export class PnpmPackageManager extends PackageManager {
  /**
   * PNPM only.  True if `--resolution-strategy` is supported.
   */
  public readonly supportsResolutionStrategy: boolean;

  // example: node_modules/.pnpm/lock.yaml
  public readonly internalShrinkwrapRelativePath: string;

  /** @internal */
  public constructor(version: string) {
    super(version, 'pnpm');

    const pnpmVersion: semver.SemVer = new semver.SemVer(version);

    this.supportsResolutionStrategy = false;

    if (pnpmVersion.major >= 3) {
      this._shrinkwrapFilename = RushConstants.pnpmV3ShrinkwrapFilename;

      if (pnpmVersion.minor >= 1) {
        // Introduced in version 3.1.0-0
        this.supportsResolutionStrategy = true;
      }
    } else {
      this._shrinkwrapFilename = RushConstants.pnpmV1ShrinkwrapFilename;
    }

    if (pnpmVersion.major <= 2) {
      // node_modules/.shrinkwrap.yaml
      this.internalShrinkwrapRelativePath = path.join('node_modules', '.shrinkwrap.yaml');
    } else if (pnpmVersion.major <= 3) {
      // node_modules/.pnpm-lock.yaml
      this.internalShrinkwrapRelativePath = path.join('node_modules', '.pnpm-lock.yaml');
    } else {
      // node_modules/.pnpm/lock.yaml
      // See https://github.com/pnpm/pnpm/releases/tag/v4.0.0 for more details.
      this.internalShrinkwrapRelativePath = path.join('node_modules', '.pnpm', 'lock.yaml');
    }
  }
}
