/**
 * @file RushConfigLoader.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * Provides helper functions to load, validate, and read the rush config file
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import Validator = require('z-schema');
import JsonFile from './JsonFile';
import RushConfigProject, { IRushConfigProjectJson } from './RushConfigProject';

/**
 * This represents the JSON data object for the Rush.json config file.
 */
export interface IRushConfigJson {
  commonFolder: string;
  projects: IRushConfigProjectJson[];
};

/**
 * This represents the Rush configuration for a repository, based on the Rush.json
 * config file.
 */
export default class RushConfig {
  private _rushJsonFolder: string;
  private _commonFolder: string;
  private _projects: RushConfigProject[];
  private _projectsByName: Map<string, RushConfigProject>;

  constructor(rushConfigJson: IRushConfigJson, rushJsonFilename: string) {
    this._rushJsonFolder = path.dirname(rushJsonFilename);
    this._commonFolder = path.resolve(path.join(this._rushJsonFolder, rushConfigJson.commonFolder));
    if (!fs.existsSync(this._commonFolder)) {
      throw new Error(`Common folder not found: ${rushConfigJson.commonFolder}`);
    }

    this._projects = [];
    this._projectsByName = new Map<string, RushConfigProject>();

    for (let rawProject of rushConfigJson.projects) {
      let project = new RushConfigProject(rawProject, this);
      this._projects.push(project);
      this._projectsByName.set(project.packageName, project);
    }
  }

  /**
   * Loads the configuration data from an Rush.json config file and returns
   * an RushConfig object.
   */
  public static loadFromConfigFile(rushJsonFilename: string): RushConfig {
    const rushConfigJson: IRushConfigJson = JsonFile.loadJsonFile(rushJsonFilename);

    // Remove the $schema reference that appears in the config object (used for IntelliSense),
    // since we are replacing it with the precompiled version.  The validator.setRemoteReference()
    // API is a better way to handle this, but we'd first need to publish the schema file
    // to a public web server where Visual Studio can find it.
    delete rushConfigJson['$schema'];

    const validator = new Validator({
      breakOnFirstError: true,
      noTypeless: true
    });

    const rushSchema: any = require('./rush-schema.json');

    if (!validator.validate(rushConfigJson, rushSchema)) {
      let error: ZSchema.Error = validator.getLastError();

      let detail: ZSchema.ErrorDetail = error.details[0];
      let errorMessage: string = `Error parsing file '${path.basename(rushJsonFilename)}', section [${detail.path}]:`
        + os.EOL + `(${detail.code}) ${detail.message} `;

      console.log(os.EOL + 'ERROR: ' + errorMessage + os.EOL + os.EOL);
      throw new Error(errorMessage);
    }

    return new RushConfig(rushConfigJson, rushJsonFilename);
  }

  public static loadFromDefaultLocation(): RushConfig {
    let currentFolder: string = process.cwd();

    // Look upwards at parent folders until we find a folder containing rush.json
    for (let i: number = 0; i < 10; ++i) {
      const rushJsonFilename: string = path.join(currentFolder, 'rush.json');

      if (fs.existsSync(rushJsonFilename)) {
        if (i > 0) {
          console.log('Found config in ' + rushJsonFilename);
        }
        console.log('');
        return RushConfig.loadFromConfigFile(rushJsonFilename);
      }

      const parentFolder: string = path.dirname(currentFolder);
      if (parentFolder === currentFolder) {
        break;
      }
      currentFolder = parentFolder;
    }
    throw new Error('Unable to find rush.json configuration file');
  }

  /**
   * The folder that contains rush.json for this project.
   */
  public get rushJsonFolder(): string {
    return this._rushJsonFolder;
  }

  /**
   * The common folder specified in rush.json.  By default, this is a subfolder
   * of rushJsonFolder whose name is "common".
   */
  public get commonFolder(): string {
    return this._commonFolder;
  }

  public get projects(): RushConfigProject[] {
    return this._projects;
  }

  public getProjectByName(projectName: string) {
    return this._projectsByName.get(projectName);
  }
};
