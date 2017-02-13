/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import * as path from 'path';
import * as fsx from 'fs-extra';
import * as semver from 'semver';
import JsonFile from '../utilities/JsonFile';
import RushConfiguration from '../data/RushConfiguration';
import { IPackageJson } from '../data/Package';

/**
 * This represents the JSON data object for a project entry in the rush.json configuration file.
 */
export interface IRushConfigurationProjectJson {
  packageName: string;
  projectFolder: string;
  reviewCategory?: string;
  cyclicDependencyProjects: string[];
  shouldPublish?: boolean;
}

/**
 * This represents the configuration of a project that is built by Rush, based on
 * the Rush.json configuration file.
 */
export default class RushConfigurationProject {
  private _packageName: string;
  private _projectFolder: string;
  private _projectRelativeFolder: string;
  private _reviewCategory: string;
  private _packageJson: PackageJson;
  private _tempProjectName: string;
  private _cyclicDependencyProjects: Set<string>;
  private _shouldPublish: boolean;
  private _downstreamDependencyProjects: string[];

  constructor(projectJson: IRushConfigurationProjectJson,
              rushConfiguration: RushConfiguration,
              tempProjectName: string) {
    this._packageName = projectJson.packageName;
    this._projectRelativeFolder = projectJson.projectFolder;

    // For example, the depth of "a/b/c" would be 3.  The depth of "a" is 1.
    const projectFolderDepth: number = projectJson.projectFolder.split('/').length;
    if (projectFolderDepth < rushConfiguration.projectFolderMinDepth) {
      throw new Error(`To keep things organized, this repository has a projectFolderMinDepth policy`
        + ` requiring project folders to be at least ${rushConfiguration.projectFolderMinDepth} levels deep.`
        + `  Problem folder: "${projectJson.projectFolder}"`);
    }
    if (projectFolderDepth > rushConfiguration.projectFolderMaxDepth) {
      throw new Error(`To keep things organized, this repository has a projectFolderMaxDepth policy`
        + ` preventing project folders from being deeper than ${rushConfiguration.projectFolderMaxDepth} levels.`
        + `  Problem folder:  "${projectJson.projectFolder}"`);
    }

    this._projectFolder = path.join(rushConfiguration.rushJsonFolder, projectJson.projectFolder);

    if (!fsx.existsSync(this._projectFolder)) {
      throw new Error(`Project folder not found: ${projectJson.projectFolder}`);
    }

    // Are we using a package review file?
    if (rushConfiguration.packageReviewFile) {
      // If so, then every project needs to have a reviewCategory that was defined
      // by the reviewCategories array.
      if (!rushConfiguration.reviewCategories.size) {
        throw new Error(`The rush.json file specifies a packageReviewFile, but the reviewCategories`
          + ` list is not configured.`);
      }
      if (!projectJson.reviewCategory) {
        throw new Error(`The rush.json file configures a packageReviewFile, but a reviewCategory` +
          ` was not specified for the project "${projectJson.packageName}".`);
      }
      if (!rushConfiguration.reviewCategories.has(projectJson.reviewCategory)) {
        throw new Error(`The project "${projectJson.packageName}" specifies its reviewCategory as`
          + `"${projectJson.reviewCategory}" which is not one of the defined reviewCategories.`);
      }
      this._reviewCategory = projectJson.reviewCategory;
    }

    const packageJsonFilename: string = path.join(this._projectFolder, 'package.json');
    this._packageJson = JsonFile.loadJsonFile(packageJsonFilename);

    if (this._packageJson.name !== this._packageName) {
      throw new Error(`The package name "${this._packageName}" specified in rush.json does not`
        + ` match the name "${this._packageJson.name}" from package.json`);
    }

    this._tempProjectName = tempProjectName;

    this._cyclicDependencyProjects = new Set<string>();
    if (projectJson.cyclicDependencyProjects) {
      for (const cyclicDependencyProject of projectJson.cyclicDependencyProjects) {
        this._cyclicDependencyProjects.add(cyclicDependencyProject);
      }
    }
    this._downstreamDependencyProjects = [];
    this._shouldPublish = !!projectJson.shouldPublish;
  }

  /**
   * Generate a temp_module package.json for this project based on an overall configuration
   */
  public generateTempModule(rushConfiguration: RushConfiguration): IPackageJson {
     const tempPackageJson: IPackageJson = {
      name: this.tempProjectName,
      version: '0.0.0',
      private: true,
      dependencies: {}
    };

    // If there are any optional dependencies, copy them over directly
    if (this.packageJson.optionalDependencies) {
      tempPackageJson.optionalDependencies = this.packageJson.optionalDependencies;
    }

    // Collect pairs of (packageName, packageVersion) to be added as temp package dependencies
    const pairs: { packageName: string, packageVersion: string }[] = [];

    // If there are devDependencies, we need to merge them with the regular
    // dependencies.  If the same library appears in both places, then the
    // regular dependency takes precedence over the devDependency.
    // It also takes precedence over a duplicate in optionalDependencies,
    // but NPM will take care of that for us.  (Frankly any kind of duplicate
    // should be an error, but NPM is pretty lax about this.)
    if (this.packageJson.devDependencies) {
      for (const packageName of Object.keys(this.packageJson.devDependencies)) {
        pairs.push({ packageName: packageName, packageVersion: this.packageJson.devDependencies[packageName] });
      }
    }

    if (this.packageJson.dependencies) {
      for (const packageName of Object.keys(this.packageJson.dependencies)) {
        pairs.push({ packageName: packageName, packageVersion: this.packageJson.dependencies[packageName] });
      }
    }

    for (const pair of pairs) {
      // Is there a locally built Rush project that could satisfy this dependency?
      // If so, then we will symlink to the project folder rather than to common/node_modules.
      // In this case, we don't want "npm install" to process this package, but we do need
      // to record this decision for "rush link" later, so we add it to a special 'rushDependencies' field.
      const localProject: RushConfigurationProject = rushConfiguration.getProjectByName(pair.packageName);
      if (localProject) {

        // Don't locally link if it's listed in the cyclicDependencyProjects
        if (!this.cyclicDependencyProjects.has(pair.packageName)) {

          // Also, don't locally link if the SemVer doesn't match
          const localProjectVersion: string = localProject.packageJson.version;
          if (semver.satisfies(localProjectVersion, pair.packageVersion)) {

            // We will locally link this package
            if (!tempPackageJson.rushDependencies) {
              tempPackageJson.rushDependencies = {};
            }
            tempPackageJson.rushDependencies[pair.packageName] = pair.packageVersion;
            continue;
          }
        }
      }

      // We will NOT locally link this package; add it as a regular dependency.
      tempPackageJson.dependencies[pair.packageName] = pair.packageVersion;
    }

    return tempPackageJson;
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
   * The relative path of the folder that contains the project to be built by Rush.
   */
  public get projectRelativeFolder(): string {
    return this._projectRelativeFolder;
  }

  /**
   * The review category name, or undefined if no category was assigned.
   * This name must be one of the valid choices listed in RushConfiguration.reviewCategories.
   */
  public get reviewCategory(): string {
    return this._reviewCategory;
  }

  /**
   * A list of local projects that appear as devDependencies for this project, but cannot be
   * locally linked because it would create a cyclic dependency; instead, the last published
   * version will be installed in the Common folder.
   *
   * These are package names that would be found by RushConfiguration.getProjectByName().
   */
  public get cyclicDependencyProjects(): Set<string> {
    return this._cyclicDependencyProjects;
  }

  /**
   * A list of projects within the Rush configuration which directly depend on this package.
   */
  public get downstreamDependencyProjects(): string[] {
    return this._downstreamDependencyProjects;
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

  /**
   * A flag which indicates whether changes to this project should be published. This controls
   * whether or not the project would show up when running `rush change`, and whether or not it
   * should be published during `rush publish`.
   */
  public get shouldPublish(): boolean {
    return this._shouldPublish;
  }
}
