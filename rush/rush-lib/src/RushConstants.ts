// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Constants used by the Rush tool.
 *
 * @public
 */
export class RushConstants {
  /**
   * The NPM scope ("@rush-temp") that is used for Rush's temporary projects.
   */
  public static readonly rushTempNpmScope: string = '@rush-temp';

  /**
   * The folder name ("temp") under the common folder where temporary files will be stored.
   * Example: "C:\MyRepo\common\temp"
   */
  public static readonly rushTempFolderName: string = 'temp';

  /**
   * The folder name ("projects") where temporary projects will be stored.
   * Example: "C:\MyRepo\common\temp\projects"
   */
  public static readonly rushTempProjectsFolderName: string = 'projects';

  /**
   * The filename ("npm-shrinkwrap.json") used to store state for the "npm shrinkwrap"
   * command.
   */
  public static readonly npmShrinkwrapFilename: string = 'npm-shrinkwrap.json';
}
