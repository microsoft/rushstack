// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import * as semver from 'semver';

import { RushConstants } from '../../logic/RushConstants.ts';
import { PackageManager } from './PackageManager.ts';

/**
 * Support for interacting with the PNPM package manager.
 */
export class PnpmPackageManager extends PackageManager {
  // example: node_modules/.pnpm/lock.yaml
  public readonly internalShrinkwrapRelativePath: string;

  /**
   * The filename of the shrinkwrap file that is used by the package manager.
   *
   * @remarks
   * Example: `pnpmfile.js` or `.pnpmfile.cjs`
   */
  public readonly pnpmfileFilename: string;

  /** @internal */
  public constructor(version: string) {
    super(version, 'pnpm', RushConstants.pnpmV3ShrinkwrapFilename);

    const parsedVersion: semver.SemVer = new semver.SemVer(version);

    if (parsedVersion.major >= 6) {
      // Introduced in version 6.0.0
      this.pnpmfileFilename = RushConstants.pnpmfileV6Filename;
    } else {
      this.pnpmfileFilename = RushConstants.pnpmfileV1Filename;
    }

    // node_modules/.pnpm/lock.yaml
    // See https://github.com/pnpm/pnpm/releases/tag/v4.0.0 for more details.
    this.internalShrinkwrapRelativePath = path.join('node_modules', '.pnpm', 'lock.yaml');
  }
}
