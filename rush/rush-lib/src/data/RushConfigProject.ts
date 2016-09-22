/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import * as path from 'path';
import * as fs from 'fs';
import JsonFile from '../utilities/JsonFile';
import RushConfig from '../data/RushConfig';

/**
 * This represents the JSON data object for a project entry in the Rush.json config file.
 */
export interface IRushConfigProjectJson {
  packageName: string;
  projectFolder: string;
}

/**
 * This represents the configuration of a project that is built by Rush, based on
 * the Rush.json config file.
 */
export default class RushConfigProject {
  private _packageName: string;
  private _projectFolder: string;
  private _packageJson: PackageJson;
  private _tempProjectName: string;

  constructor(projectJson: IRushConfigProjectJson, rushConfig: RushConfig, tempProjectName: string) {
    this._packageName = projectJson.packageName;

    // For example, the depth of "a/b/c" would be 3.  The depth of "a" is 1.
    const projectFolderDepth: number = projectJson.projectFolder.split('/').length;
    if (projectFolderDepth < rushConfig.projectFolderMinDepth) {
      throw new Error(`To keep things organized, this repository has a policy that project folders `
        + `should be at least ${rushConfig.projectFolderMinDepth} levels deep.  `
        + `Problem folder: "${projectJson.projectFolder}"`);
    }
    if (projectFolderDepth > rushConfig.projectFolderMaxDepth) {
      throw new Error(`To keep things organized, this repository has a policy that project folders `
        + `must not have more than ${rushConfig.projectFolderMaxDepth} levels of nesting.  `
        + `Problem folder:  "${projectJson.projectFolder}"`);
    }

    this._projectFolder = path.join(rushConfig.rushJsonFolder, projectJson.projectFolder);

    if (!fs.existsSync(this._projectFolder)) {
      throw new Error(`Project folder not found: ${projectJson.projectFolder}`);
    }

    const packageJsonFilename: string = path.join(this._projectFolder, 'package.json');
    this._packageJson = JsonFile.loadJsonFile(packageJsonFilename);

    if (this._packageJson.name !== this._packageName) {
      throw new Error(`The package name "${this._packageName}" specified in rush.json does not`
        + ` match the name "${this._packageJson.name}" from package.json`);
    }

    this._tempProjectName = tempProjectName;
  }

  /**
   * The name of the NPM package.  An error is reported if this name is not
   * identical to packageJson.name.
   */
  public get packageName(): string {
    return this._packageName;
  }

  /**
   * The full path of the folder that contains the project to be built by Rush.
   */
  public get projectFolder(): string {
    return this._projectFolder;
  }

  /**
   * The parsed NPM "package.json" file from projectFolder.
   */
  public get packageJson(): PackageJson {
    return this._packageJson;
  }

  /**
   * The unique name for the temporary project that will be generated in the Common folder.
   * For example, if the project name is "@ms/MyProject", the temporary project name
   * might be "rush-MyProject-2".
   */
  public get tempProjectName(): string {
    return this._tempProjectName;
  }
}
