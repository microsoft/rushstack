// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Constants used by the Rush tool.
 *
 * @remarks
 *
 * These are NOT part of the public API surface for rush-lib.
 * The rationale is that we don't want people implementing custom parsers for
 * the Rush config files; instead, they should rely on the official APIs from rush-lib.
 */
export namespace RushConstants {
  /**
   * The filename ("browser-approved-packages.json") for an optional policy configuration file
   * that stores a list of NPM packages that have been approved for usage by Rush projects.
   * This is part of a pair of config files, one for projects that run in a web browser
   * (e.g. whose approval criteria mostly focuses on licensing and code size), and one for everywhere else
   * (e.g. tooling projects whose approval criteria mostly focuses on avoiding node_modules sprawl).
   */
  export const browserApprovedPackagesFilename: string = 'browser-approved-packages.json';

  /**
   * The folder name ("changes") where change files will be stored.
   */
  export const changeFilesFolderName: string = 'changes';

  /**
   * The filename ("nonbrowser-approved-packages.json") for an optional policy configuration file
   * that stores a list of NPM packages that have been approved for usage by Rush projects.
   * This is part of a pair of config files, one for projects that run in a web browser
   * (e.g. whose approval criteria mostly focuses on licensing and code size), and one for everywhere else
   * (e.g. tooling projects whose approval criteria mostly focuses on avoiding node_modules sprawl).
   */
  export const nonbrowserApprovedPackagesFilename: string = 'nonbrowser-approved-packages.json';

  /**
   * The folder name ("common") where Rush's common data will be stored.
   */
  export const commonFolderName: string = 'common';

  /**
   * The NPM scope ("@rush-temp") that is used for Rush's temporary projects.
   */
  export const rushTempNpmScope: string = '@rush-temp';

  /**
   * The folder name ("temp") under the common folder, or under the .rush folder in each project's directory where
   * temporary files will be stored.
   * Example: `C:\MyRepo\common\temp`
   */
  export const rushTempFolderName: string = 'temp';

  /**
   * The folder name ("projects") where temporary projects will be stored.
   * Example: `C:\MyRepo\common\temp\projects`
   */
  export const rushTempProjectsFolderName: string = 'projects';

  /**
   * The folder name ("variants") under which named variant configurations for
   * alternate dependency sets may be found.
   * Example: "C:\MyRepo\common\config\rush\variants"
   */
  export const rushVariantsFolderName: string = 'variants';

  /**
   * The filename ("npm-shrinkwrap.json") used to store an installation plan for the NPM package manger.
   */
  export const npmShrinkwrapFilename: string = 'npm-shrinkwrap.json';

  /**
   * The filename ("shrinkwrap.yaml") used to store an installation plan for the PNPM package manger
   * (PNPM version 2.x and earlier).
   */
  export const pnpmV1ShrinkwrapFilename: string = 'shrinkwrap.yaml';

  /**
   * The filename ("pnpm-lock.yaml") used to store an installation plan for the PNPM package manger
   * (PNPM version 3.x and later).
   */
  export const pnpmV3ShrinkwrapFilename: string = 'pnpm-lock.yaml';

  /**
   * The filename ("pnpmfile.js") used to add custom configuration to PNPM
   */
  export const pnpmfileFilename: string = 'pnpmfile.js';

  /**
   * The filename ("shrinkwrap.yaml") used to store state for pnpm
   */
  export const yarnShrinkwrapFilename: string = 'yarn.lock';

  /**
   * The folder name ("node_modules") where NPM installs its packages.
   */
  export const nodeModulesFolderName: string = 'node_modules';

  /**
   * The filename ("pinned-versions.json") for an old configuration file that
   * that is no longer supported.
   *
   * @deprecated This feature has been superseded by the "preferredVersions" setting
   * in common-versions.json
   */
  // NOTE: Although this is marked as "deprecated", we will probably never retire it,
  // since we always want to report the warning when someone upgrades an old repo.
  export const pinnedVersionsFilename: string = 'pinned-versions.json';

  /**
   * The filename ("common-versions.json") for an optional configuration file
   * that stores dependency version information that affects all projects in the repo.
   * This configuration file should go in the "common/config/rush" folder.
   */
  export const commonVersionsFilename: string = 'common-versions.json';

  /**
   * The name of the per-project folder where project-specific Rush files are stored. For example,
   * the package-deps files, which are used by commands to determine if a particular project needs to be rebuilt.
   */
  export const projectRushFolderName: string = '.rush';

  /**
   * Custom command line configuration file, which is used by rush for implementing
   * custom command and options.
   */
  export const commandLineFilename: string = 'command-line.json';

  export const versionPoliciesFilename: string = 'version-policies.json';

  /**
   * The URL ("http://rushjs.io") for the Rush web site.
   */
  export const rushWebSiteUrl: string = 'https://rushjs.io';

  /**
   * The name of the NPM package for the Rush tool ("@microsoft/rush").
   */
  export const rushPackageName: string = '@microsoft/rush';

  /**
   * The folder name ("rush-recycler") where Rush moves large folder trees
   * before asynchronously deleting them.
   */
  export const rushRecyclerFolderName: string = 'rush-recycler';

  /**
   * The name of the file to drop in project-folder/.rush/temp/ containing a listing of the projects direct
   * and indirect dependencies. This is used to detect if a project's dependencies have changed since the last build.
   */
  export const projectDependencyManifestFilename: string = 'project-dependencies.json';
}
