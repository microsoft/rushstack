// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fsx from 'fs-extra';
import * as os from 'os';
import * as semver from 'semver';

import rushVersion from '../rushVersion';
import JsonFile from '../utilities/JsonFile';
import RushConfigurationProject, { IRushConfigurationProjectJson } from './RushConfigurationProject';
import { PinnedVersionsConfiguration } from './PinnedVersionsConfiguration';
import Utilities from '../utilities/Utilities';
import { RushConstants } from '../RushConstants';
import { ApprovedPackagesPolicy } from './ApprovedPackagesPolicy';
import JsonSchemaValidator from '../utilities/JsonSchemaValidator';

/**
 * A list of known config filenames that are expected to appear in the "./common/config/rush" folder.
 * To avoid confusion/mistakes, any extra files will be reported as an error.
 */
const knownRushConfigFilenames: string[] = [
  '.npmrc',
  RushConstants.npmShrinkwrapFilename,
  RushConstants.pinnedVersionsFilename,
  RushConstants.browserApprovedPackagesFilename,
  RushConstants.nonbrowserApprovedPackagesFilename
];

/**
 * Part of IRushConfigurationJson.
 */
export interface IApprovedPackagesPolicyJson {
  reviewCategories?: string[];
  ignoredNpmScopes?: string[];
}

/**
 * Part of IRushConfigurationJson.
 */
export interface IRushGitPolicyJson {
  allowedEmailRegExps?: string[];
  sampleEmail?: string;
}

/**
 * This represents the JSON data structure for the "rush.json" configuration file.
 * See rush-schema.json for documentation.
 */
export interface IRushConfigurationJson {
  $schema: string;
  npmVersion: string;
  rushMinimumVersion: string;
  nodeSupportedVersionRange?: string;
  projectFolderMinDepth?: number;
  projectFolderMaxDepth?: number;
  approvedPackagesPolicy?: IApprovedPackagesPolicyJson;
  gitPolicy?: IRushGitPolicyJson;
  telemetryEnabled?: boolean;
  projects: IRushConfigurationProjectJson[];
}

/**
 * This represents the JSON data structure for the "rush-link.json" data file.
 * @public
 */
export interface IRushLinkJson {
  localLinks: {
    [name: string]: string[]
  };
}

/**
 * This represents the Rush configuration for a repository, based on the Rush.json
 * configuration file.
 * @public
 */
export default class RushConfiguration {
  private _rushJsonFolder: string;
  private _commonFolder: string;
  private _commonTempFolder: string;
  private _commonRushConfigFolder: string;
  private _npmCacheFolder: string;
  private _npmTmpFolder: string;
  private _committedShrinkwrapFilename: string;
  private _tempShrinkwrapFilename: string;
  private _homeFolder: string;
  private _rushLinkJsonFilename: string;
  private _npmToolVersion: string;
  private _npmToolFilename: string;
  private _projectFolderMinDepth: number;
  private _projectFolderMaxDepth: number;

  // "approvedPackagesPolicy" feature
  private _approvedPackagesPolicy: ApprovedPackagesPolicy;

  // "gitPolicy" feature
  private _gitAllowedEmailRegExps: string[];
  private _gitSampleEmail: string;

  private _pinnedVersions: PinnedVersionsConfiguration;

  private _telemetryEnabled: boolean;

  private _projects: RushConfigurationProject[];
  private _projectsByName: Map<string, RushConfigurationProject>;

  /**
   * Loads the configuration data from an Rush.json configuration file and returns
   * an RushConfiguration object.
   */
  public static loadFromConfigurationFile(rushJsonFilename: string): RushConfiguration {
    const rushConfigurationJson: IRushConfigurationJson = JsonFile.loadJsonFile(rushJsonFilename);

    // Check the Rush version *before* we validate the schema, since if the version is outdated
    // then the schema may have changed.
    const rushMinimumVersion: string = rushConfigurationJson.rushMinimumVersion;
    // If the version is missing or malformed, fall through and let the schema handle it.
    if (rushMinimumVersion && semver.valid(rushMinimumVersion)) {
      if (semver.lt(rushVersion, rushMinimumVersion)) {
        throw new Error(`Your rush tool is version ${rushVersion}, but rush.json`
          + ` requires version ${rushConfigurationJson.rushMinimumVersion} or newer.  To upgrade,`
          + ` run "npm install @microsoft/rush -g".`);
      }
    }

    const rushSchemaFilename: string = path.join(__dirname, '../rush-schema.json');
    const validator: JsonSchemaValidator = JsonSchemaValidator.loadFromFile(rushSchemaFilename);

    validator.validateObject(rushConfigurationJson, (errorDescription: string) => {
      const errorMessage: string = `Error parsing file '${rushJsonFilename}':`
        + os.EOL + errorDescription;

      throw new Error(errorMessage);
    });

    return new RushConfiguration(rushConfigurationJson, rushJsonFilename);
  }

  public static loadFromDefaultLocation(): RushConfiguration {
    let currentFolder: string = process.cwd();

    // Look upwards at parent folders until we find a folder containing rush.json
    for (let i: number = 0; i < 10; ++i) {
      const rushJsonFilename: string = path.join(currentFolder, 'rush.json');

      if (fsx.existsSync(rushJsonFilename)) {
        if (i > 0) {
          console.log('Found configuration in ' + rushJsonFilename);
        }
        console.log('');
        return RushConfiguration.loadFromConfigurationFile(rushJsonFilename);
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
   * NOTE: sortedProjectJsons is sorted by the caller.
   */
  private static _generateTempNamesForProjects(sortedProjectJsons: IRushConfigurationProjectJson[]):
    Map<IRushConfigurationProjectJson, string> {

    const tempNamesByProject: Map<IRushConfigurationProjectJson, string> =
      new Map<IRushConfigurationProjectJson, string>();
    const usedTempNames: Set<string> = new Set<string>();

    // NOTE: projectJsons was already sorted in alphabetical order by the caller.
    for (const projectJson of sortedProjectJsons) {
      // If the name is "@ms/MyProject", extract the "MyProject" part
      const unscopedName: string = Utilities.parseScopedPackageName(projectJson.packageName).name;

      // Generate a unique like name "@rush-temp/MyProject", or "@rush-temp/MyProject-2" if
      // there is a naming conflict
      let counter: number = 0;
      let tempProjectName: string = `${RushConstants.rushTempNpmScope}/${unscopedName}`;
      while (usedTempNames.has(tempProjectName)) {
        ++counter;
        tempProjectName = `${RushConstants.rushTempNpmScope}/${unscopedName}-${counter}`;
      }
      usedTempNames.add(tempProjectName);
      tempNamesByProject.set(projectJson, tempProjectName);
    }

    return tempNamesByProject;
  }

  /**
   * If someone adds a config file in the "common/rush/config" folder, it would be a bad
   * experience for Rush to silently ignore their file simply because they misspelled the
   * filename, or maybe it's an old format that's no longer supported.  The
   * _validateCommonRushConfigFolder() function makes sure that this folder only contains
   * recognized config files.
   */
  private static _validateCommonRushConfigFolder(commonRushConfigFolder: string): void {
    if (!fsx.existsSync(commonRushConfigFolder)) {
      console.log(`Creating folder: ${commonRushConfigFolder}`);
      fsx.mkdirsSync(commonRushConfigFolder);
      return;
    }

    const filenames: string[] = fsx.readdirSync(commonRushConfigFolder);
    for (const filename of filenames) {
      const resolvedFilename: string = path.resolve(commonRushConfigFolder, filename);

      // Ignore things that aren't actual files
      const stat: fsx.Stats = fsx.statSync(resolvedFilename);
      if (!stat.isFile() && !stat.isSymbolicLink) {
        continue;
      }

      // Ignore harmless file extensions
      const fileExtension: string = path.extname(filename);
      if (['.bak', '.disabled', '.md', '.old', '.orig'].indexOf(fileExtension) >= 0) {
        continue;
      }

      const knownSet: Set<string> = new Set<string>(knownRushConfigFilenames.map(x => x.toUpperCase()));

      // Is the filename something we know?  If not, report an error.
      if (!knownSet.has(filename.toUpperCase())) {
        throw new Error(`An unrecognized file "${filename}" was found in the Rush config folder:`
          + ` ${commonRushConfigFolder}`);
      }
    }
  }

  /**
   * The folder that contains rush.json for this project.
   */
  public get rushJsonFolder(): string {
    return this._rushJsonFolder;
  }

  /**
   * The fully resolved path for the "common" folder where Rush will store settings that
   * affect all Rush projects.  This is always a subfolder of the folder containing "rush.json".
   * Example: "C:\MyRepo\common"
   */
  public get commonFolder(): string {
    return this._commonFolder;
  }

  /**
   * The folder where Rush's additional config files are stored.  This folder is always a
   * subfolder called "config\rush" inside the common folder.  (The "common\config" folder
   * is reserved for configuration files used by other tools.)  To avoid confusion or mistakes,
   * Rush will report an error if this this folder contains any unrecognized files.
   *
   * Example: "C:\MyRepo\common\config\rush"
   */
  public get commonRushConfigFolder(): string {
    return this._commonRushConfigFolder;
  }

  /**
   * The folder where temporary files will be stored.  This is always a subfolder called "temp"
   * inside the common folder.
   * Example: "C:\MyRepo\common\temp"
   */
  public get commonTempFolder(): string {
    return this._commonTempFolder;
  }

  /**
   * The local folder that will store the NPM package cache.  Rush does not rely on the
   * NPM's default global cache folder, because NPM's caching implementation does not
   * reliably handle multiple processes.  (For example, if a build box is running
   * "rush install" simultaneously for two different working folders, it may fail randomly.)
   *
   * Example: "C:\MyRepo\common\temp\npm-cache"
   */
  public get npmCacheFolder(): string {
    return this._npmCacheFolder;
  }

  /**
   * The local folder where NPM's temporary files will be written during installation.
   * Rush does not rely on the global default folder, because it may be on a different
   * hard disk.
   *
   * Example: "C:\MyRepo\common\temp\npm-tmp"
   */
  public get npmTmpFolder(): string {
    return this._npmTmpFolder;
  }

  /**
   * The filename of the NPM shrinkwrap file that is tracked e.g. by Git.  (The "rush install"
   * command uses a temporary copy, whose path is tempShrinkwrapFilename.)
   * This property merely reports the filename; the file itself may not actually exist.
   * Example: "C:\MyRepo\common\npm-shrinkwrap.json"
   */
  public get committedShrinkwrapFilename(): string {
    return this._committedShrinkwrapFilename;
  }

  /**
   * The filename of the temporary NPM shrinkwrap file that is used by "rush install".
   * (The master copy is tempShrinkwrapFilename.)
   * This property merely reports the filename; the file itself may not actually exist.
   * Example: "C:\MyRepo\common\temp\npm-shrinkwrap.json"
   */
  public get tempShrinkwrapFilename(): string {
    return this._tempShrinkwrapFilename;
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
   *
   * Example: "C:\MyRepo\common\temp\rush-link.json"
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
   * Example: "C:\MyRepo\common\temp\npm-local\node_modules\.bin\npm"
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

  /**
   * The "approvedPackagesPolicy" settings.
   */
  public get approvedPackagesPolicy(): ApprovedPackagesPolicy {
    return this._approvedPackagesPolicy;
  }

  /**
   * [Part of the "gitPolicy" feature.]
   * A list of regular expressions describing allowable e-mail patterns for Git commits.
   * They are case-insensitive anchored JavaScript RegExps.
   * Example: ".*@example\.com"
   * This array will never be undefined.
   */
  public get gitAllowedEmailRegExps(): string[] {
    return this._gitAllowedEmailRegExps;
  }

  /**
   * [Part of the "gitPolicy" feature.]
   * An example valid e-mail address that conforms to one of the allowedEmailRegExps.
   * Example: "foxtrot@example\.com"
   * This will never be undefined, and will always be nonempty if gitAllowedEmailRegExps is used.
   */
  public get gitSampleEmail(): string {
    return this._gitSampleEmail;
  }

  /**
   * Indicates whether telemetry collection is enabled for Rush runs.
   */
  public get telemetryEnabled(): boolean {
    return this._telemetryEnabled;
  }

  public get projects(): RushConfigurationProject[] {
    return this._projects;
  }

  public get projectsByName(): Map<string, RushConfigurationProject> {
    return this._projectsByName;
  }

  /**
   * The PinnedVersionsConfiguration object.  If the pinnedVersions.json file is missing,
   * this property will NOT be undefined.  Instead it will be initialized in an empty state,
   * and calling PinnedVersionsConfiguration.save() will create the file.
   */
  public get pinnedVersions(): PinnedVersionsConfiguration {
    return this._pinnedVersions;
  }

  /**
   * Looks up a project in the projectsByName map.  If the project is not found,
   * then undefined is returned.
   */
  public getProjectByName(projectName: string): RushConfigurationProject {
    return this._projectsByName.get(projectName);
  }

  /**
   * This is used e.g. by command-line interfaces such as "rush build --to example".
   * If "example" is not a project name, then it also looks for a scoped name
   * like "@something/example".  If exactly one project matches this heuristic, it
   * is returned.  Otherwise, undefined is returned.
   */
  public findProjectByShorthandName(shorthandProjectName: string): RushConfigurationProject {
    // Is there an exact match?
    let result: RushConfigurationProject = this._projectsByName.get(shorthandProjectName);
    if (result) {
      return result;
    }

    // Is there an approximate match?
    for (const project of this._projects) {
      if (Utilities.parseScopedPackageName(project.packageName).name === shorthandProjectName) {
        if (result) {
          // Ambiguous -- there is more than one match
          return undefined;
        } else {
          result = project;
        }
      }
    }
    return result;
  }

  /**
   * Looks up a project by its RushConfigurationProject.tempProjectName field.
   * @returns The found project, or undefined if no match was found.
   */
  public findProjectByTempName(tempProjectName: string): RushConfigurationProject | undefined {
    // Is there an approximate match?
    for (const project of this._projects) {
      if (project.tempProjectName === tempProjectName) {
        return project;
      }
    }
    return undefined;
  }

  private _populateDownstreamDependencies(dependencies: { [key: string]: string }, packageName: string): void {
    if (!dependencies) {
      return;
    }
    Object.keys(dependencies).forEach(dependencyName => {
      const depProject: RushConfigurationProject = this._projectsByName.get(dependencyName);

      if (depProject) {
        depProject.downstreamDependencyProjects.push(packageName);
      }
    });
  }

  /**
   * Use RushConfiguration.loadFromConfigurationFile() or Use RushConfiguration.loadFromDefaultLocation()
   * instead.
   */
  private constructor(rushConfigurationJson: IRushConfigurationJson, rushJsonFilename: string) {
    if (rushConfigurationJson.nodeSupportedVersionRange) {
      if (!semver.validRange(rushConfigurationJson.nodeSupportedVersionRange)) {
        throw new Error('Error parsing the node-semver expression in the "nodeSupportedVersionRange"'
          + ` field from rush.json: "${rushConfigurationJson.nodeSupportedVersionRange}"`);
      }
      if (!semver.satisfies(process.version, rushConfigurationJson.nodeSupportedVersionRange)) {
        throw new Error(`Your dev environment is running Node.js version ${process.version} which does`
          + ` not meet the requirements for building this repository.  (The rush.json configuration`
          + ` requires nodeSupportedVersionRange="${rushConfigurationJson.nodeSupportedVersionRange}")`);
      }
    }

    this._rushJsonFolder = path.dirname(rushJsonFilename);

    this._commonFolder = path.resolve(path.join(this._rushJsonFolder, RushConstants.commonFolderName));

    this._commonRushConfigFolder = path.join(this._commonFolder, 'config', 'rush');
    RushConfiguration._validateCommonRushConfigFolder(this._commonRushConfigFolder);

    this._commonTempFolder = path.join(this._commonFolder, RushConstants.rushTempFolderName);
    this._npmCacheFolder = path.resolve(path.join(this._commonTempFolder, 'npm-cache'));
    this._npmTmpFolder = path.resolve(path.join(this._commonTempFolder, 'npm-tmp'));

    this._committedShrinkwrapFilename = path.join(this._commonRushConfigFolder, RushConstants.npmShrinkwrapFilename);
    this._tempShrinkwrapFilename = path.join(this._commonTempFolder, RushConstants.npmShrinkwrapFilename);

    const unresolvedUserFolder: string = process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'];
    this._homeFolder = path.resolve(unresolvedUserFolder);
    if (!fsx.existsSync(this._homeFolder)) {
      throw new Error('Unable to determine the current user\'s home directory');
    }

    this._rushLinkJsonFilename = path.join(this._commonTempFolder, 'rush-link.json');

    this._npmToolVersion = rushConfigurationJson.npmVersion;
    this._npmToolFilename = path.resolve(path.join(this._commonTempFolder,
      'npm-local', 'node_modules', '.bin', 'npm'));

    this._projectFolderMinDepth = rushConfigurationJson.projectFolderMinDepth !== undefined
      ? rushConfigurationJson.projectFolderMinDepth : 1;
    if (this._projectFolderMinDepth < 1) {
      throw new Error('Invalid projectFolderMinDepth; the minimum possible value is 1');
    }

    this._projectFolderMaxDepth = rushConfigurationJson.projectFolderMaxDepth !== undefined
      ? rushConfigurationJson.projectFolderMaxDepth : 2;
    if (this._projectFolderMaxDepth < this._projectFolderMinDepth) {
      throw new Error('The projectFolderMaxDepth cannot be smaller than the projectFolderMinDepth');
    }

    this._approvedPackagesPolicy = new ApprovedPackagesPolicy(this, rushConfigurationJson);

    this._gitAllowedEmailRegExps = [];
    this._gitSampleEmail = '';
    if (rushConfigurationJson.gitPolicy) {
      if (rushConfigurationJson.gitPolicy.sampleEmail) {
        this._gitSampleEmail = rushConfigurationJson.gitPolicy.sampleEmail;
      }

      if (rushConfigurationJson.gitPolicy.allowedEmailRegExps) {
        this._gitAllowedEmailRegExps = rushConfigurationJson.gitPolicy.allowedEmailRegExps;

        if (this._gitSampleEmail.trim().length < 1) {
          throw new Error('The rush.json file is missing the "sampleEmail" option, ' +
            'which is required when using "allowedEmailRegExps"');
        }
      }
    }

    this._telemetryEnabled = !!rushConfigurationJson.telemetryEnabled;

    this._projects = [];
    this._projectsByName = new Map<string, RushConfigurationProject>();

    // We sort the projects array in alphabetical order.  This ensures that the packages
    // are processed in a deterministic order by the various Rush algorithms.
    const sortedProjectJsons: IRushConfigurationProjectJson[] = rushConfigurationJson.projects.slice(0);
    sortedProjectJsons.sort(
      (a: IRushConfigurationProjectJson, b: IRushConfigurationProjectJson) => a.packageName.localeCompare(b.packageName)
    );

    const tempNamesByProject: Map<IRushConfigurationProjectJson, string>
      = RushConfiguration._generateTempNamesForProjects(sortedProjectJsons);

    for (const projectJson of sortedProjectJsons) {
      const tempProjectName: string = tempNamesByProject.get(projectJson);
      const project: RushConfigurationProject = new RushConfigurationProject(projectJson, this, tempProjectName);
      this._projects.push(project);
      if (this._projectsByName.get(project.packageName)) {
        throw new Error(`The project name "${project.packageName}" was specified more than once`
          + ` in the rush.json configuration file.`);
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

      // Compute the downstream dependencies within the list of Rush projects.
      this._populateDownstreamDependencies(project.packageJson.dependencies, project.packageName);
      this._populateDownstreamDependencies(project.packageJson.devDependencies, project.packageName);
    }

    // Example: "./common/config/rush/pinnedVersions.json"
    const pinnedVersionsFile: string = path.join(this.commonRushConfigFolder, RushConstants.pinnedVersionsFilename);
    this._pinnedVersions = PinnedVersionsConfiguration.tryLoadFromFile(pinnedVersionsFile);
  }
}
