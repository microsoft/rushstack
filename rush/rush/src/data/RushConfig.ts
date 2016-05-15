/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import Validator = require('z-schema');
import JsonFile from '../utilities/JsonFile';
import RushConfigProject, { IRushConfigProjectJson } from './RushConfigProject';
import Utilities from '../utilities/Utilities';

/**
 * This represents the JSON data structure for the "rush.json" config file.
 */
export interface IRushConfigJson {
  commonFolder: string;
  npmVersion: string;
  projects: IRushConfigProjectJson[];
};

/**
 * This represents the JSON data structure for the "rush-link.json" data file.
 */
export interface IRushLinkJson {
  localLinks: {
    [name: string]: string[]
  };
}

/**
 * This represents the Rush configuration for a repository, based on the Rush.json
 * config file.
 */
export default class RushConfig {
  private _rushJsonFolder: string;
  private _commonFolder: string;
  private _commonFolderName: string;
  private _homeFolder: string;
  private _rushLinkJsonFilename: string;
  private _npmVersion: string;
  private _projects: RushConfigProject[];
  private _projectsByName: Map<string, RushConfigProject>;

  constructor(rushConfigJson: IRushConfigJson, rushJsonFilename: string) {
    this._rushJsonFolder = path.dirname(rushJsonFilename);
    this._commonFolder = path.resolve(path.join(this._rushJsonFolder, rushConfigJson.commonFolder));
    if (!fs.existsSync(this._commonFolder)) {
      throw new Error(`Rush common folder does not exist: ${rushConfigJson.commonFolder}`);
    }
    this._commonFolderName = path.basename(this._commonFolder);

    const unresolvedUserFolder: string = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
    this._homeFolder = path.resolve(unresolvedUserFolder);
    if (!fs.existsSync(this._homeFolder)) {
      throw new Error('Unable to determine the current user\'s home directory');
    }

    this._rushLinkJsonFilename = path.join(this._commonFolder, 'rush-link.json');

    this._npmVersion = rushConfigJson.npmVersion;

    this._projects = [];
    this._projectsByName = new Map<string, RushConfigProject>();

    const tempNamesByProject: Map<IRushConfigProjectJson, string>
      = RushConfig._generateTempNamesForProjects(rushConfigJson.projects);

    for (const projectJson of rushConfigJson.projects) {
      const tempProjectName: string = tempNamesByProject.get(projectJson);
      const project = new RushConfigProject(projectJson, this, tempProjectName);
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

    const rushSchema: any = require('../rush-schema.json');

    if (!validator.validate(rushConfigJson, rushSchema)) {
      const error: ZSchema.Error = validator.getLastError();

      const detail: ZSchema.ErrorDetail = error.details[0];
      const errorMessage: string = `Error parsing file '${path.basename(rushJsonFilename)}',`
        + `section[${detail.path}]:${os.EOL}(${detail.code}) ${detail.message}`;

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
   * This generates the unique names that are used to create temporary projects
   * in the Rush common folder.
   */
  private static _generateTempNamesForProjects(projectJsons: IRushConfigProjectJson[])
    : Map<IRushConfigProjectJson, string> {

    const tempNamesByProject = new Map<IRushConfigProjectJson, string>();
    let usedTempNames: Set<string> = new Set<string>();

    const sortedProjectJsons: IRushConfigProjectJson[] = projectJsons.sort(
      (a: IRushConfigProjectJson, b: IRushConfigProjectJson) => a.packageName.localeCompare(a.packageName)
    );
    for (const projectJson of sortedProjectJsons) {
      // If the name is "@ms/MyProject", extract the "MyProject" part
      let unscopedName: string = Utilities.parseScopedPackgeName(projectJson.packageName).name;

      // Generate a unique like name "rush-MyProject", or "rush-MyProject-2" if
      // there is a naming conflict
      let counter: number = 0;
      let tempProjectName: string = 'rush-' + unscopedName;
      while (usedTempNames.has(tempProjectName)) {
        ++counter;
        tempProjectName = 'rush-' + unscopedName + '-' + counter;
      }
      usedTempNames.add(tempProjectName);
      tempNamesByProject.set(projectJson, tempProjectName);
    }

    return tempNamesByProject;
  }

  /**
   * The folder that contains rush.json for this project.
   */
  public get rushJsonFolder(): string {
    return this._rushJsonFolder;
  }

  /**
   * The common folder specified in rush.json.  By default, this is the fully
   * resolved path for a subfolder of rushJsonFolder whose name is "common".
   */
  public get commonFolder(): string {
    return this._commonFolder;
  }

  /**
   * This is how we refer to the common folder, e.g. in error messages.
   * For example if commonFolder is "C:\MyRepo\common" then
   * commonFolderName="common".
   */
  public get commonFolderName(): string {
    return this._commonFolderName;
  }

  /**
   * The absolute path to the home directory for the current user.  On Windows,
   * it would be something like "C:\Users\YourName".
   */
  public get homeFolder(): string {
    return this._homeFolder;
  }

  /**
   * The filename of the build dependency data file.  By default this is
   * called 'rush-link.json' resides in the Rush common folder.
   * Its data structure is defined by IRushLinkJson.
   */
  public get rushLinkJsonFilename(): string {
    return this._rushLinkJsonFilename;
  }

  /**
   * The version of the NPM tool to be installed.  (Example: "1.2.3")
   */
  public get npmVersion(): string {
    return this._npmVersion;
  }

  public get projects(): RushConfigProject[] {
    return this._projects;
  }

  public getProjectByName(projectName: string) {
    return this._projectsByName.get(projectName);
  }
};
