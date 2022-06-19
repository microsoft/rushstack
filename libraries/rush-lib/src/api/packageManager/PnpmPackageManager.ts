// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver from 'semver';
import * as path from 'path';

import { RushConstants } from '../../logic/RushConstants';
import { PackageManager } from './PackageManager';

/**
 * Support for interacting with the PNPM package manager.
 */
export class PnpmPackageManager extends PackageManager {
  protected _pnpmfileFilename: string;
  protected _splitWorkspacePnpmfileFilename: string;

  // example: node_modules/.pnpm/lock.yaml
  public readonly internalShrinkwrapRelativePath: string;

  /** @internal */
  public constructor(version: string) {
    super(version, 'pnpm');

    const parsedVersion: semver.SemVer = new semver.SemVer(version);

    if (parsedVersion.major >= 6) {
      // Introduced in version 6.0.0
      this._pnpmfileFilename = RushConstants.pnpmfileV6Filename;
    } else {
      this._pnpmfileFilename = RushConstants.pnpmfileV1Filename;
    }

    this._splitWorkspacePnpmfileFilename = '.pnpmfile-split-workspace.cjs';

    this._shrinkwrapFilename = RushConstants.pnpmV3ShrinkwrapFilename;

    // node_modules/.pnpm/lock.yaml
    // See https://github.com/pnpm/pnpm/releases/tag/v4.0.0 for more details.
    this.internalShrinkwrapRelativePath = path.join('node_modules', '.pnpm', 'lock.yaml');
  }

  /**
   * The filename of the shrinkwrap file that is used by the package manager.
   *
   * @remarks
   * Example: `pnpmfile.js` or `.pnpmfile.cjs`
   */
  public get pnpmfileFilename(): string {
    return this._pnpmfileFilename;
  }

  /**
   * The filename of the global shrinkwrap file that is used by the package manager.
   *
   * @remarks
   * Example: `.pnpmfile-split-workspace.cjs`
   */
  public get splitWorkspacePnpmfileFilename(): string {
    return this._splitWorkspacePnpmfileFilename;
  }
}
