// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Constants used by the Rush tool.
 *
 * @public
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
   * The folder name ("temp") under the common folder where temporary files will be stored.
   * Example: "C:\MyRepo\common\temp"
   */
  export const rushTempFolderName: string = 'temp';

  /**
   * The folder name ("projects") where temporary projects will be stored.
   * Example: "C:\MyRepo\common\temp\projects"
   */
  export const rushTempProjectsFolderName: string = 'projects';

  /**
   * The filename ("npm-shrinkwrap.json") used to store state for the "npm shrinkwrap"
   * command.
   */
  export const npmShrinkwrapFilename: string = 'npm-shrinkwrap.json';

  /**
   * The folder name ("node_modules") where NPM installs its packages.
   */
  export const nodeModulesFolderName: string = 'node_modules';

  /**
   * The filename ("package.json") used by NPM to define a package.
   */
  export const packageJsonFilename: string = 'package.json';

  /**
   * The filename ("pinned-versions.json") for an optional configuration file
   * that stores a table of dependencies that should be pinned to a specific
   * version for all projects.  This configuration file should go in the
   * "common/config/rush" folder.
   */
  export const pinnedVersionsFilename: string = 'pinned-versions.json';

  /**
   * The name of the package-deps.json file, which is used by the "rush build"
   * command to determine if a particular project needs to be rebuilt.
   */
  export const packageDepsFilename: string = 'package-deps.json';

  /**
   * @alpha
   */
  export const versionPoliciesFileName: string = 'version-policies.json';
}
