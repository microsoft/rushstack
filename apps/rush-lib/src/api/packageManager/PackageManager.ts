// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This represents the available Package Manager tools as a string
 * @public
 */
export type PackageManagerName = 'pnpm' | 'npm' | 'yarn';

/**
 * An abstraction for controlling the supported package managers: PNPM, NPM, and Yarn.
 * @beta
 */
export abstract class PackageManager {
  /**
   * The package manager.
   */
  public readonly packageManager: PackageManagerName;

  /**
   * The SemVer version of the package manager.
   */
  public readonly version: string;

  protected _shrinkwrapFilename: string;

  /** @internal */
  protected constructor(version: string, packageManager: PackageManagerName) {
    this.version = version;
    this.packageManager = packageManager;
  }

  /**
   * The filename of the shrinkwrap file that is used by the package manager.
   *
   * @remarks
   * Example: `npm-shrinkwrap.json` or `pnpm-lock.yaml`
   */
  public get shrinkwrapFilename(): string {
    return this._shrinkwrapFilename;
  }
}
