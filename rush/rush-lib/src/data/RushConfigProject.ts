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
  reviewCategory?: string;
  cyclicDependencyProjects: string[];
  shouldTrackChanges?: boolean;
}

/**
 * This represents the configuration of a project that is built by Rush, based on
 * the Rush.json config file.
 */
export default class RushConfigProject {
  private _packageName: string;
  private _projectFolder: string;
  private _reviewCategory: string;
  private _packageJson: PackageJson;
  private _tempProjectName: string;
  private _cyclicDependencyProjects: Set<string>;
  private _shouldTrackChanges: boolean;

  constructor(projectJson: IRushConfigProjectJson, rushConfig: RushConfig, tempProjectName: string) {
    this._packageName = projectJson.packageName;

    // For example, the depth of "a/b/c" would be 3.  The depth of "a" is 1.
    const projectFolderDepth: number = projectJson.projectFolder.split('/').length;
    if (projectFolderDepth < rushConfig.projectFolderMinDepth) {
      throw new Error(`To keep things organized, this repository has a projectFolderMinDepth policy`
        + ` requiring project folders to be at least ${rushConfig.projectFolderMinDepth} levels deep.`
        + `  Problem folder: "${projectJson.projectFolder}"`);
    }
    if (projectFolderDepth > rushConfig.projectFolderMaxDepth) {
      throw new Error(`To keep things organized, this repository has a projectFolderMaxDepth policy`
        + ` preventing project folders from being deeper than ${rushConfig.projectFolderMaxDepth} levels.`
        + `  Problem folder:  "${projectJson.projectFolder}"`);
    }

    this._projectFolder = path.join(rushConfig.rushJsonFolder, projectJson.projectFolder);

    if (!fs.existsSync(this._projectFolder)) {
      throw new Error(`Project folder not found: ${projectJson.projectFolder}`);
    }

    // Are we using a package review file?
    if (rushConfig.packageReviewFile) {
      // If so, then every project needs to have a reviewCategory that was defined
      // by the reviewCategories array.
      if (!rushConfig.reviewCategories.size) {
        throw new Error(`The rush.json file specifies a packageReviewFile, but the reviewCategories`
          + ` list is not configured.`);
      }
      if (!projectJson.reviewCategory) {
        throw new Error(`The rush.json file configures a packageReviewFile, but a reviewCategory` +
          ` was not specified for the project "${projectJson.packageName}".`);
      }
      if (!rushConfig.reviewCategories.has(projectJson.reviewCategory)) {
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

    this._shouldTrackChanges = !!projectJson.shouldTrackChanges;
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
   * The review category name, or undefined if no category was assigned.
   * This name must be one of the valid choices listed in RushConfig.reviewCategories.
   */
  public get reviewCategory(): string {
    return this._reviewCategory;
  }

  /**
   * A list of local projects that appear as devDependencies for this project, but cannot be
   * locally linked because it would create a cyclic dependency; instead, the last published
   * version will be installed in the Common folder.
   *
   * These are package names that would be found by RushConfig.getProjectByName().
   */
  public get cyclicDependencyProjects(): Set<string> {
    return this._cyclicDependencyProjects;
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
   * A flag which indicates whether changes to this project should be tracked by the
   * changefile workflow. If this is false, the project will not show up the `rush change` UI
   */
  public get shouldTrackChanges(): boolean {
    return this._shouldTrackChanges;
  }
}
