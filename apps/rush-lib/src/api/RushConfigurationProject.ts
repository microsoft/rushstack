// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import {
  JsonFile,
  IPackageJson,
  PackageName,
  FileSystem,
  FileConstants
} from '@rushstack/node-core-library';

import { RushConfiguration } from '../api/RushConfiguration';
import { VersionPolicy, LockStepVersionPolicy } from './VersionPolicy';
import { PackageJsonEditor } from './PackageJsonEditor';
import { RushConstants } from '../logic/RushConstants';

/**
 * This represents the JSON data object for a project entry in the rush.json configuration file.
 */
export interface IRushConfigurationProjectJson {
  packageName: string;
  projectFolder: string;
  reviewCategory?: string;
  cyclicDependencyProjects: string[];
  versionPolicyName?: string;
  shouldPublish?: boolean;
  skipRushCheck?: boolean;
}

/**
 * This represents the configuration of a project that is built by Rush, based on
 * the Rush.json configuration file.
 * @public
 */
export class RushConfigurationProject {
  private _packageName: string;
  private _projectFolder: string;
  private _projectRelativeFolder: string;
  private _projectRushTempFolder: string;
  private _reviewCategory: string;
  private _packageJson: IPackageJson;
  private _packageJsonEditor: PackageJsonEditor;
  private _tempProjectName: string;
  private _unscopedTempProjectName: string;
  private _cyclicDependencyProjects: Set<string>;
  private _versionPolicyName: string | undefined;
  private _versionPolicy: VersionPolicy;
  private _shouldPublish: boolean;
  private _skipRushCheck: boolean;
  private _downstreamDependencyProjects: string[];
  private readonly _rushConfiguration: RushConfiguration;

  /** @internal */
  public constructor(
    projectJson: IRushConfigurationProjectJson,
    rushConfiguration: RushConfiguration,
    tempProjectName: string
  ) {
    this._rushConfiguration = rushConfiguration;
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

    if (!FileSystem.exists(this._projectFolder)) {
      throw new Error(`Project folder not found: ${projectJson.projectFolder}`);
    }

    this._projectRushTempFolder = path.join(
      this._projectFolder,
      RushConstants.projectRushFolderName,
      RushConstants.rushTempFolderName
    );

    // Are we using a package review file?
    if (rushConfiguration.approvedPackagesPolicy.enabled) {
      // If so, then every project needs to have a reviewCategory that was defined
      // by the reviewCategories array.
      if (!projectJson.reviewCategory) {
        throw new Error(`The "approvedPackagesPolicy" feature is enabled rush.json, but a reviewCategory` +
          ` was not specified for the project "${projectJson.packageName}".`);
      }
      if (!rushConfiguration.approvedPackagesPolicy.reviewCategories.has(projectJson.reviewCategory)) {
        throw new Error(`The project "${projectJson.packageName}" specifies its reviewCategory as`
          + `"${projectJson.reviewCategory}" which is not one of the defined reviewCategories.`);
      }
      this._reviewCategory = projectJson.reviewCategory;
    }

    const packageJsonFilename: string = path.join(this._projectFolder, FileConstants.PackageJson);
    this._packageJson = JsonFile.load(packageJsonFilename);

    if (this._packageJson.name !== this._packageName) {
      throw new Error(`The package name "${this._packageName}" specified in rush.json does not`
        + ` match the name "${this._packageJson.name}" from package.json`);
    }

    this._packageJsonEditor = PackageJsonEditor.load(packageJsonFilename);

    this._tempProjectName = tempProjectName;

    // The "rushProject.tempProjectName" is guaranteed to be unique name (e.g. by adding the "-2"
    // suffix).  Even after we strip the NPM scope, it will still be unique.
    // Example: "my-project-2"
    this._unscopedTempProjectName = PackageName.getUnscopedName(tempProjectName);

    this._cyclicDependencyProjects = new Set<string>();
    if (projectJson.cyclicDependencyProjects) {
      for (const cyclicDependencyProject of projectJson.cyclicDependencyProjects) {
        this._cyclicDependencyProjects.add(cyclicDependencyProject);
      }
    }
    this._shouldPublish = !!projectJson.shouldPublish;
    this._skipRushCheck = !!projectJson.skipRushCheck;
    this._downstreamDependencyProjects = [];
    this._versionPolicyName = projectJson.versionPolicyName;
  }

  /**
   * The name of the NPM package.  An error is reported if this name is not
   * identical to packageJson.name.
   *
   * Example: `@scope/MyProject`
   */
  public get packageName(): string {
    return this._packageName;
  }

  /**
   * The full path of the folder that contains the project to be built by Rush.
   *
   * Example: `C:\MyRepo\libraries\my-project`
   */
  public get projectFolder(): string {
    return this._projectFolder;
  }

  /**
   * The relative path of the folder that contains the project to be built by Rush.
   *
   * Example: `libraries\my-project`
   */
  public get projectRelativeFolder(): string {
    return this._projectRelativeFolder;
  }

  /**
   * The project-specific Rush temp folder. This folder is used to store Rush-specific temporary files.
   *
   * Example: `C:\MyRepo\libraries\my-project\.rush\temp`
   */
  public get projectRushTempFolder(): string {
    return this._projectRushTempFolder;
  }

  /**
   * The Rush configuration for the monorepo that the project belongs to.
   */
  public get rushConfiguration(): RushConfiguration {
    return this._rushConfiguration;
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
   * @deprecated Use packageJsonEditor instead
   */
  public get packageJson(): IPackageJson {
    return this._packageJson;
  }

  /**
   * A useful wrapper around the package.json file for making modifications
   * @beta
   */
  public get packageJsonEditor(): PackageJsonEditor {
    return this._packageJsonEditor;
  }

  /**
   * The unique name for the temporary project that will be generated in the Common folder.
   * For example, if the project name is `@scope/MyProject`, the temporary project name
   * might be `@rush-temp/MyProject-2`.
   *
   * Example: `@rush-temp/MyProject-2`
   */
  public get tempProjectName(): string {
    return this._tempProjectName;
  }

  /**
   * The unscoped temporary project name
   *
   * Example: `my-project-2`
   */
  public get unscopedTempProjectName(): string {
    return this._unscopedTempProjectName;
  }

  /**
   * A flag which indicates whether changes to this project should be published. This controls
   * whether or not the project would show up when running `rush change`, and whether or not it
   * should be published during `rush publish`.
   */
  public get shouldPublish(): boolean {
    return this._shouldPublish || !!this._versionPolicyName;
  }

  /**
   * If true, then this project will be ignored by the "rush check" command.
   * The default value is false.
   */
  public get skipRushCheck(): boolean {
    return this._skipRushCheck;
  }

  /**
   * Name of the version policy used by this project.
   * @beta
   */
  public get versionPolicyName(): string | undefined {
    return this._versionPolicyName;
  }

  /**
   * Version policy of the project
   * @beta
   */
  public get versionPolicy(): VersionPolicy | undefined {
    if (!this._versionPolicy) {
      if (this.versionPolicyName && this._rushConfiguration.versionPolicyConfiguration) {
        this._versionPolicy = this._rushConfiguration.versionPolicyConfiguration.getVersionPolicy(
          this.versionPolicyName);
      }
    }
    return this._versionPolicy;
  }

  /**
   * Indicate whether this project is the main project for the related version policy.
   *
   * False if the project is not for publishing.
   * True if the project is individually versioned or if its lockstep version policy does not specify main project.
   * False if the project is lockstepped and is not the main project for its version policy.
   *
   * @beta
   */
  public get isMainProject(): boolean {
    if (!this.shouldPublish) {
      return false;
    }
    let isMain: boolean = true;
    if (this.versionPolicy && this.versionPolicy.isLockstepped) {
      const lockStepPolicy: LockStepVersionPolicy = this.versionPolicy as LockStepVersionPolicy;
      if (lockStepPolicy.mainProject && lockStepPolicy.mainProject !== this.packageName) {
        isMain = false;
      }
    }
    return isMain;
  }
}
