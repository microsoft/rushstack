/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as semver from 'semver';

import rushVersion from '../rushVersion';
import Validator = require('z-schema');
import JsonFile from '../utilities/JsonFile';
import RushConfigProject, { IRushConfigProjectJson } from './RushConfigProject';
import Utilities from '../utilities/Utilities';

/**
 * This represents the JSON data structure for the "rush.json" config file.
 * See rush-schema.json for documentation.
 */
export interface IRushConfigJson {
  $schema: string;
  commonFolder: string;
  npmVersion: string;
  rushMinimumVersion: string;
  nodeSupportedVersionRange: string;
  projectFolderMinDepth?: number;
  projectFolderMaxDepth?: number;
  projects: IRushConfigProjectJson[];
}

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
  private _tempModulesFolder: string;
  private _homeFolder: string;
  private _rushLinkJsonFilename: string;
  private _npmToolVersion: string;
  private _npmToolFilename: string;
  private _projectFolderMinDepth: number;
  private _projectFolderMaxDepth: number;

  private _projects: RushConfigProject[];
  private _projectsByName: Map<string, RushConfigProject>;

  /**
   * Loads the configuration data from an Rush.json config file and returns
   * an RushConfig object.
   */
  public static loadFromConfigFile(rushJsonFilename: string): RushConfig {
    const rushConfigJson: IRushConfigJson = JsonFile.loadJsonFile(rushJsonFilename);

    // Check the Rush version *before* we validate the schema, since if the version is outdated
    // then the schema may have changed.
    const rushMinimumVersion: string = rushConfigJson.rushMinimumVersion;
    // If the version is missing or malformed, fall through and let the schema handle it.
    if (rushMinimumVersion && semver.valid(rushMinimumVersion)) {
      if (semver.lt(rushVersion, rushMinimumVersion)) {
        throw new Error(`Your rush tool is version ${rushVersion}, but rush.json`
          + ` requires version ${rushConfigJson.rushMinimumVersion} or newer.  To upgrade,`
          + ` run "npm install @ms/rush -g".`);
      }
    }

    // Remove the $schema reference that appears in the config object (used for IntelliSense),
    // since we are replacing it with the precompiled version.  The validator.setRemoteReference()
    // API is a better way to handle this, but we'd first need to publish the schema file
    // to a public web server where Visual Studio can find it.
    delete rushConfigJson.$schema;

    const validator: ZSchema.Validator = new Validator({
      breakOnFirstError: true,
      noTypeless: true
    });

    const rushSchema: Object = require('../rush-schema.json');

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
  private static _generateTempNamesForProjects(projectJsons: IRushConfigProjectJson[]):
    Map<IRushConfigProjectJson, string> {

    const tempNamesByProject: Map<IRushConfigProjectJson, string> = new Map<IRushConfigProjectJson, string>();
    const usedTempNames: Set<string> = new Set<string>();

    const sortedProjectJsons: IRushConfigProjectJson[] = projectJsons.sort(
      (a: IRushConfigProjectJson, b: IRushConfigProjectJson) => a.packageName.localeCompare(a.packageName)
    );
    for (const projectJson of sortedProjectJsons) {
      // If the name is "@ms/MyProject", extract the "MyProject" part
      const unscopedName: string = Utilities.parseScopedPackgeName(projectJson.packageName).name;

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
   * DO NOT CALL -- Use RushConfig.loadFromConfigFile() or Use RushConfig.loadFromDefaultLocation()
   * instead.
   */
  constructor(rushConfigJson: IRushConfigJson, rushJsonFilename: string) {
    if (rushConfigJson.nodeSupportedVersionRange) {
      if (!semver.validRange(rushConfigJson.nodeSupportedVersionRange)) {
        throw new Error('Error parsing the node-semver expression in the "nodeSupportedVersionRange"'
          + ` field from rush.json: "${rushConfigJson.nodeSupportedVersionRange}"`);
      }
      if (!semver.satisfies(process.version, rushConfigJson.nodeSupportedVersionRange)) {
        throw new Error(`Your dev environment is running Node.js version ${process.version} which does`
          + ` not meet the requirements for building this repository.  (The rush.json configuration`
          + ` requires nodeSupportedVersionRange="${rushConfigJson.nodeSupportedVersionRange}")`);
      }
    }

    this._rushJsonFolder = path.dirname(rushJsonFilename);
    this._commonFolder = path.resolve(path.join(this._rushJsonFolder, rushConfigJson.commonFolder));
    if (!fs.existsSync(this._commonFolder)) {
      throw new Error(`Rush common folder does not exist: ${rushConfigJson.commonFolder}`);
    }
    this._commonFolderName = path.basename(this._commonFolder);

    this._tempModulesFolder = path.join(this._commonFolder, 'temp_modules');

    const unresolvedUserFolder: string = process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'];
    this._homeFolder = path.resolve(unresolvedUserFolder);
    if (!fs.existsSync(this._homeFolder)) {
      throw new Error('Unable to determine the current user\'s home directory');
    }

    this._rushLinkJsonFilename = path.join(this._commonFolder, 'rush-link.json');

    this._npmToolVersion = rushConfigJson.npmVersion;
    this._npmToolFilename = path.join(this._commonFolder, 'local-npm', 'node_modules', '.bin', 'npm');

    this._projectFolderMinDepth = rushConfigJson.projectFolderMinDepth !== undefined
      ? rushConfigJson.projectFolderMinDepth : 1;
    if (this._projectFolderMinDepth < 1) {
      throw new Error('Invalid projectFolderMinDepth; the minimum possible value is 1');
    }

    this._projectFolderMaxDepth = rushConfigJson.projectFolderMaxDepth !== undefined
      ? rushConfigJson.projectFolderMaxDepth : 2;
    if (this._projectFolderMaxDepth < this._projectFolderMinDepth) {
      throw new Error('The projectFolderMaxDepth cannot be smaller than the projectFolderMinDepth');
    }

    this._projects = [];
    this._projectsByName = new Map<string, RushConfigProject>();

    const tempNamesByProject: Map<IRushConfigProjectJson, string>
      = RushConfig._generateTempNamesForProjects(rushConfigJson.projects);

    for (const projectJson of rushConfigJson.projects) {
      const tempProjectName: string = tempNamesByProject.get(projectJson);
      const project: RushConfigProject = new RushConfigProject(projectJson, this, tempProjectName);
      this._projects.push(project);
      if (this._projectsByName.get(project.packageName)) {
        throw new Error(`The project name "${project.packageName}" was specified more than once`
          + ` in the rush.json config file.`);
      }
      this._projectsByName.set(project.packageName, project);
    }

    for (const project of this._projects) {
      project.cyclicDependencyProjects.forEach((cyclicDependencyProject: string) => {
        if (!this.getProjectByName(cyclicDependencyProject)) {
          throw new Error(`In rush.json, the "${cyclicDependencyProject}" project does not exist,`
            + ` but was referenced by the cyclicDependencyProjects for ${project.packageName}`);
        }
      });
    }
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
   * Example: "C:\MyRepo\common"
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
   * The folder containing the temp packages generated by "rush generate".
   * Example: "C:\MyRepo\common\temp_modules"
   */
  public get tempModulesFolder(): string {
    return this._tempModulesFolder;
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
   * The version of the locally installed NPM tool.  (Example: "1.2.3")
   */
  public get npmToolVersion(): string {
    return this._npmToolVersion;
  }

  /**
   * The absolute path to the locally installed NPM tool.  If "rush install" has not
   * been run, then this file may not exist yet.
   * Example: "C:\MyRepo\common\local-npm\node_modules\.bin\npm"
   */
  public get npmToolFilename(): string {
    return this._npmToolFilename;
  }

  /**
   * The minimum allowable folder depth for the projectFolder field in the rush.json file.
   * This setting provides a way for repository maintainers to discourage nesting of project folders
   * that makes the directory tree more difficult to navigate.  The default value is 2,
   * which implements a standard 2-level hierarchy of <categoryFolder>/<projectFolder>/package.json.
   */
  public get projectFolderMinDepth(): number {
    return this._projectFolderMinDepth;
  }

  /**
   * The maximum allowable folder depth for the projectFolder field in the rush.json file.
   * This setting provides a way for repository maintainers to discourage nesting of project folders
   * that makes the directory tree more difficult to navigate.  The default value is 2,
   * which implements on a standard convention of <categoryFolder>/<projectFolder>/package.json.
   */
  public get projectFolderMaxDepth(): number {
    return this._projectFolderMaxDepth;
  }

  public get projects(): RushConfigProject[] {
    return this._projects;
  }

  public getProjectByName(projectName: string): RushConfigProject {
    return this._projectsByName.get(projectName);
  }
}
