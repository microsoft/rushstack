/**
 * @file RushConfigLoader.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * Provides helper functions to load, validate, and read the rush config file
 */

import * as path from 'path';
import * as fs from 'fs';
import JsonFile from './JsonFile';
import RushConfig from './RushConfig';

/**
 * This represents the JSON data object for a project entry in the Rush.json config file.
 */
export interface IRushConfigProjectJson {
  packageName: string;
  projectFolder: string;
  dependencies?: string[];
};

/**
 * This represents the configuration of a project that is built by Rush, based on
 * the Rush.json config file.
 */
export default class RushConfigProject {
  private _packageName: string;
  private _projectFolder: string;
  private _dependencies: string[];
  private _packageJson: PackageJson;

  constructor(projectJson: IRushConfigProjectJson, rushConfig: RushConfig) {
    this._packageName = projectJson.packageName;

    this._projectFolder = path.join(rushConfig.rushJsonFolder, projectJson.projectFolder);

    if (!fs.existsSync(this._projectFolder)) {
      throw new Error(`Project folder not found: ${projectJson.projectFolder}`);
    }

    this._dependencies = projectJson.dependencies || [];

    const packageJsonFilename: string = path.join(this._projectFolder, 'package.json');
    this._packageJson = JsonFile.loadJsonFile(packageJsonFilename);

    if (this._packageJson.name !== this._packageName) {
      throw new Error(`The package name "${this._packageName}" specified in rush.json does not`
        + ` match the name "${this._packageJson.name}" from package.json`);
    }
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
   * A list of names of projects that must be built before this project can be built.
   */
  public get dependencies(): string[] {
    return this._dependencies;
  }

  /**
   * The parsed NPM "package.json" file from projectFolder.
   */
  public get packageJson(): PackageJson {
    return this._packageJson;
  }
}

