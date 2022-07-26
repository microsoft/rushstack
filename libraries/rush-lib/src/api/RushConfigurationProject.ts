// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as semver from 'semver';
import { JsonFile, IPackageJson, FileSystem, FileConstants } from '@rushstack/node-core-library';

import { RushConfiguration } from '../api/RushConfiguration';
import { VersionPolicy, LockStepVersionPolicy } from './VersionPolicy';
import { PackageJsonEditor } from './PackageJsonEditor';
import { RushConstants } from '../logic/RushConstants';
import { PackageNameParsers } from './PackageNameParsers';
import { DependencySpecifier, DependencySpecifierType } from '../logic/DependencySpecifier';

/**
 * This represents the JSON data object for a project entry in the rush.json configuration file.
 */
export interface IRushConfigurationProjectJson {
  packageName: string;
  projectFolder: string;
  reviewCategory?: string;
  decoupledLocalDependencies: string[];
  cyclicDependencyProjects?: string[];
  versionPolicyName?: string;
  shouldPublish?: boolean;
  skipRushCheck?: boolean;
  publishFolder?: string;
  tags?: string[];
}

/**
 * @internal
 */
export interface IRushConfigurationProjectOptions {
  /**
   * The raw JSON representation from rush.json
   */
  projectJson: IRushConfigurationProjectJson;
  /**
   * The enclosing configuration
   */
  rushConfiguration: RushConfiguration;
  /**
   * A unique string name for this project
   */
  tempProjectName: string;
  /**
   * If specified, validate project tags against this list.
   */
  allowedProjectTags: Set<string> | undefined;
}

/**
 * This represents the configuration of a project that is built by Rush, based on
 * the Rush.json configuration file.
 * @public
 */
export class RushConfigurationProject {
  private readonly _packageName: string;
  private readonly _projectFolder: string;
  private readonly _projectRelativeFolder: string;
  private readonly _projectRushConfigFolder: string;
  private readonly _projectRushTempFolder: string;
  private readonly _reviewCategory: string | undefined;
  private readonly _packageJson: IPackageJson;
  private readonly _packageJsonEditor: PackageJsonEditor;
  private readonly _tempProjectName: string;
  private readonly _unscopedTempProjectName: string;
  private readonly _decoupledLocalDependencies: Set<string>;
  private readonly _versionPolicyName: string | undefined;
  private readonly _shouldPublish: boolean;
  private readonly _skipRushCheck: boolean;
  private readonly _publishFolder: string;
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _tags: Set<string>;

  private _versionPolicy: VersionPolicy | undefined = undefined;
  private _dependencyProjects: Set<RushConfigurationProject> | undefined = undefined;
  private _consumingProjects: Set<RushConfigurationProject> | undefined = undefined;

  /** @internal */
  public constructor(options: IRushConfigurationProjectOptions) {
    const { projectJson, rushConfiguration, tempProjectName, allowedProjectTags } = options;
    this._rushConfiguration = rushConfiguration;
    this._packageName = projectJson.packageName;
    this._projectRelativeFolder = projectJson.projectFolder;

    // For example, the depth of "a/b/c" would be 3.  The depth of "a" is 1.
    const projectFolderDepth: number = projectJson.projectFolder.split('/').length;
    if (projectFolderDepth < rushConfiguration.projectFolderMinDepth) {
      throw new Error(
        `To keep things organized, this repository has a projectFolderMinDepth policy` +
          ` requiring project folders to be at least ${rushConfiguration.projectFolderMinDepth} levels deep.` +
          `  Problem folder: "${projectJson.projectFolder}"`
      );
    }
    if (projectFolderDepth > rushConfiguration.projectFolderMaxDepth) {
      throw new Error(
        `To keep things organized, this repository has a projectFolderMaxDepth policy` +
          ` preventing project folders from being deeper than ${rushConfiguration.projectFolderMaxDepth} levels.` +
          `  Problem folder:  "${projectJson.projectFolder}"`
      );
    }

    this._projectFolder = path.join(rushConfiguration.rushJsonFolder, projectJson.projectFolder);
    const packageJsonFilename: string = path.join(this._projectFolder, FileConstants.PackageJson);

    try {
      this._packageJson = JsonFile.load(packageJsonFilename);
    } catch (error) {
      if (FileSystem.isNotExistError(error as Error)) {
        throw new Error(
          `Could not find package.json for ${projectJson.packageName} at ${packageJsonFilename}`
        );
      }
      throw error;
    }

    this._projectRushConfigFolder = path.join(this._projectFolder, 'config', 'rush');
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
        throw new Error(
          `The "approvedPackagesPolicy" feature is enabled rush.json, but a reviewCategory` +
            ` was not specified for the project "${projectJson.packageName}".`
        );
      }
      if (!rushConfiguration.approvedPackagesPolicy.reviewCategories.has(projectJson.reviewCategory)) {
        throw new Error(
          `The project "${projectJson.packageName}" specifies its reviewCategory as` +
            `"${projectJson.reviewCategory}" which is not one of the defined reviewCategories.`
        );
      }
      this._reviewCategory = projectJson.reviewCategory;
    }

    if (this._packageJson.name !== this._packageName) {
      throw new Error(
        `The package name "${this._packageName}" specified in rush.json does not` +
          ` match the name "${this._packageJson.name}" from package.json`
      );
    }

    this._packageJsonEditor = PackageJsonEditor.fromObject(this._packageJson, packageJsonFilename);

    this._tempProjectName = tempProjectName;

    // The "rushProject.tempProjectName" is guaranteed to be unique name (e.g. by adding the "-2"
    // suffix).  Even after we strip the NPM scope, it will still be unique.
    // Example: "my-project-2"
    this._unscopedTempProjectName = PackageNameParsers.permissive.getUnscopedName(tempProjectName);

    this._decoupledLocalDependencies = new Set<string>();
    if (projectJson.cyclicDependencyProjects || projectJson.decoupledLocalDependencies) {
      if (projectJson.cyclicDependencyProjects && projectJson.decoupledLocalDependencies) {
        throw new Error(
          'A project configuration cannot specify both "decoupledLocalDependencies" and "cyclicDependencyProjects". Please use "decoupledLocalDependencies" only -- the other name is deprecated.'
        );
      }
      for (const cyclicDependencyProject of projectJson.cyclicDependencyProjects ||
        projectJson.decoupledLocalDependencies) {
        this._decoupledLocalDependencies.add(cyclicDependencyProject);
      }
    }
    this._shouldPublish = !!projectJson.shouldPublish;
    this._skipRushCheck = !!projectJson.skipRushCheck;
    this._versionPolicyName = projectJson.versionPolicyName;

    if (this._shouldPublish && this._packageJson.private) {
      throw new Error(
        `The project "${projectJson.packageName}" specifies "shouldPublish": true, ` +
          `but the package.json file specifies "private": true.`
      );
    }

    this._publishFolder = this._projectFolder;
    if (projectJson.publishFolder) {
      this._publishFolder = path.join(this._publishFolder, projectJson.publishFolder);
    }

    if (allowedProjectTags && projectJson.tags) {
      this._tags = new Set();
      for (const tag of projectJson.tags) {
        if (!allowedProjectTags.has(tag)) {
          throw new Error(
            `The tag "${tag}" specified for project "${this._packageName}" is not listed in the ` +
              `allowedProjectTags field in rush.json.`
          );
        } else {
          this._tags.add(tag);
        }
      }
    } else {
      this._tags = new Set(projectJson.tags);
    }
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
   * Example: `libraries/my-project`
   */
  public get projectRelativeFolder(): string {
    return this._projectRelativeFolder;
  }

  /**
   * The project-specific Rush configuration folder.
   *
   * Example: `C:\MyRepo\libraries\my-project\config\rush`
   */
  public get projectRushConfigFolder(): string {
    return this._projectRushConfigFolder;
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
  public get reviewCategory(): string | undefined {
    return this._reviewCategory;
  }

  /**
   * A list of local projects that appear as devDependencies for this project, but cannot be
   * locally linked because it would create a cyclic dependency; instead, the last published
   * version will be installed in the Common folder.
   *
   * These are package names that would be found by RushConfiguration.getProjectByName().
   */
  public get decoupledLocalDependencies(): Set<string> {
    return this._decoupledLocalDependencies;
  }

  /**
   * A list of local projects that appear as devDependencies for this project, but cannot be
   * locally linked because it would create a cyclic dependency; instead, the last published
   * version will be installed in the Common folder.
   *
   * These are package names that would be found by RushConfiguration.getProjectByName().
   *
   * @deprecated Use `decoupledLocalDependencies` instead, as it better describes the purpose of the data.
   */
  public get cyclicDependencyProjects(): Set<string> {
    return this._decoupledLocalDependencies;
  }

  /**
   * An array of projects within the Rush configuration which directly depend on this package.
   * @deprecated Use `consumingProjectNames` instead, as it has Set semantics, which better reflect the nature
   * of the data.
   */
  public get downstreamDependencyProjects(): string[] {
    return Array.from(this.consumingProjects, (project: RushConfigurationProject) => project.packageName);
  }

  /**
   * An array of projects within the Rush configuration which this project declares as dependencies.
   * @deprecated Use `dependencyProjects` instead, as it has Set semantics, which better reflect the nature
   * of the data.
   */
  public get localDependencyProjects(): ReadonlyArray<RushConfigurationProject> {
    return [...this.dependencyProjects];
  }

  /**
   * The set of projects within the Rush configuration which this project declares as dependencies.
   *
   * @remarks
   * Can be used recursively to walk the project dependency graph to find all projects that are directly or indirectly
   * referenced from this project.
   */
  public get dependencyProjects(): ReadonlySet<RushConfigurationProject> {
    let dependencyProjects: Set<RushConfigurationProject> | undefined = this._dependencyProjects;
    if (!dependencyProjects) {
      this._dependencyProjects = dependencyProjects = new Set();
      const { packageJson } = this;
      for (const dependencySet of [
        packageJson.dependencies,
        packageJson.devDependencies,
        packageJson.optionalDependencies
      ]) {
        if (dependencySet) {
          for (const [dependency, version] of Object.entries(dependencySet)) {
            // Skip if we can't find the local project or it's a cyclic dependency
            const localProject: RushConfigurationProject | undefined =
              this._rushConfiguration.getProjectByName(dependency);
            if (localProject && !this._decoupledLocalDependencies.has(dependency)) {
              // Set the value if it's a workspace project, or if we have a local project and the semver is satisfied
              const dependencySpecifier: DependencySpecifier = new DependencySpecifier(dependency, version);
              switch (dependencySpecifier.specifierType) {
                case DependencySpecifierType.Version:
                case DependencySpecifierType.Range:
                  if (
                    semver.satisfies(localProject.packageJson.version, dependencySpecifier.versionSpecifier)
                  ) {
                    dependencyProjects.add(localProject);
                  }
                  break;
                case DependencySpecifierType.Workspace:
                  dependencyProjects.add(localProject);
                  break;
              }
            }
          }
        }
      }
    }
    return dependencyProjects;
  }

  /**
   * The set of projects within the Rush configuration which declare this project as a dependency.
   * Excludes those that declare this project as a `cyclicDependencyProject`.
   *
   * @remarks
   * This field is the counterpart to `dependencyProjects`, and can be used recursively to walk the project dependency
   * graph to find all projects which will be impacted by changes to this project.
   */
  public get consumingProjects(): ReadonlySet<RushConfigurationProject> {
    if (!this._consumingProjects) {
      // Force initialize all dependency relationships
      // This needs to operate on every project in the set because the relationships are only specified
      // in the consuming project
      const { projects } = this._rushConfiguration;

      for (const project of projects) {
        project._consumingProjects = new Set();
      }

      for (const project of projects) {
        for (const dependency of project.dependencyProjects) {
          dependency._consumingProjects!.add(project);
        }
      }
    }
    return this._consumingProjects!;
  }

  /**
   * The parsed NPM "package.json" file from projectFolder.
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
   * The full path of the folder that will get published by Rush.
   *
   * @remarks
   * By default this is the same as the project folder, but a custom folder can be specified
   * using the the "publishFolder" setting in rush.json.
   *
   * Example: `C:\MyRepo\libraries\my-project\temp\publish`
   */
  public get publishFolder(): string {
    return this._publishFolder;
  }

  /**
   * Version policy of the project
   * @beta
   */
  public get versionPolicy(): VersionPolicy | undefined {
    if (!this._versionPolicy) {
      if (this.versionPolicyName && this._rushConfiguration.versionPolicyConfiguration) {
        this._versionPolicy = this._rushConfiguration.versionPolicyConfiguration.getVersionPolicy(
          this.versionPolicyName
        );
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

  /**
   * The set of tags applied to this project.
   * @beta
   */
  public get tags(): ReadonlySet<string> {
    return this._tags;
  }
}
