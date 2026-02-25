// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfigurationProject } from '../api/RushConfigurationProject.ts';

/**
 * The type of SemVer range specifier that is prepended to the version
 */
export enum SemVerStyle {
  Exact = 'exact',
  Caret = 'caret',
  Tilde = 'tilde',
  Passthrough = 'passthrough'
}

export interface IPackageForRushUpdate {
  packageName: string;
}

export interface IPackageForRushAdd extends IPackageForRushUpdate {
  /**
   * The style of range that should be used if the version is automatically detected.
   */
  rangeStyle: SemVerStyle;

  /**
   * If not undefined, the latest version will be used (that doesn't break ensureConsistentVersions).
   * If specified, the latest version meeting the SemVer specifier will be used as the basis.
   */
  version?: string;
}

export interface IPackageForRushRemove extends IPackageForRushUpdate {}

export interface IPackageJsonUpdaterRushBaseUpdateOptions {
  /**
   * The projects whose package.jsons should get updated
   */
  projects: RushConfigurationProject[];
  /**
   * The dependencies to be added or removed.
   */
  packagesToUpdate: IPackageForRushUpdate[];
  /**
   * If specified, "rush update" will not be run after updating the package.json file(s).
   */
  skipUpdate: boolean;
  /**
   * If specified, "rush update" will be run in debug mode.
   */
  debugInstall: boolean;
  /**
   * actionName
   */
  actionName: string;
  /**
   * The variant to consider when performing installations and validating shrinkwrap updates.
   */
  variant: string | undefined | undefined;
}

/**
 * Configuration options for adding or updating a dependency in a single project
 */
export interface IPackageJsonUpdaterRushAddOptions extends IPackageJsonUpdaterRushBaseUpdateOptions {
  /**
   * Whether or not this dependency should be added as a devDependency or a regular dependency.
   */
  devDependency: boolean;
  /**
   * Whether or not this dependency should be added as a peerDependency or a regular dependency.
   */
  peerDependency: boolean;
  /**
   * If specified, other packages that use this dependency will also have their package.json's updated.
   */
  updateOtherPackages: boolean;
  /**
   * The dependencies to be added.
   */
  packagesToUpdate: IPackageForRushAdd[];
}

/**
 * Options for remove a dependency from a particular project.
 */
export interface IPackageJsonUpdaterRushRemoveOptions extends IPackageJsonUpdaterRushBaseUpdateOptions {}
