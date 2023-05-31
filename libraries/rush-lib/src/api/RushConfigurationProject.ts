// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as semver from 'semver';
import { IPackageJson, FileSystem, FileConstants } from '@rushstack/node-core-library';

import { RushConfiguration } from '../api/RushConfiguration';
import { VersionPolicy, LockStepVersionPolicy } from './VersionPolicy';
import type { PackageJsonEditor } from './PackageJsonEditor';
import { RushConstants } from '../logic/RushConstants';
import { PackageNameParsers } from './PackageNameParsers';
import { DependencySpecifier, DependencySpecifierType } from '../logic/DependencySpecifier';
import { SaveCallbackPackageJsonEditor } from './SaveCallbackPackageJsonEditor';

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
  private readonly _shouldPublish: boolean;

  private _versionPolicy: VersionPolicy | undefined = undefined;
  private _dependencyProjects: Set<RushConfigurationProject> | undefined = undefined;
  private _consumingProjects: Set<RushConfigurationProject> | undefined = undefined;
  private _packageJson: IPackageJson;

  /**
   * The name of the NPM package.  An error is reported if this name is not
   * identical to packageJson.name.
   *
   * Example: `@scope/MyProject`
   */
  public readonly packageName: string;

  /**
   * The full path of the folder that contains the project to be built by Rush.
   *
   * Example: `C:\MyRepo\libraries\my-project`
   */
  public readonly projectFolder: string;

  /**
   * The relative path of the folder that contains the project to be built by Rush.
   *
   * Example: `libraries/my-project`
   */
  public readonly projectRelativeFolder: string;

  /**
   * The project-specific Rush configuration folder.
   *
   * Example: `C:\MyRepo\libraries\my-project\config\rush`
   */
  public readonly projectRushConfigFolder: string;

  /**
   * The project-specific Rush temp folder. This folder is used to store Rush-specific temporary files.
   *
   * Example: `C:\MyRepo\libraries\my-project\.rush\temp`
   */
  public readonly projectRushTempFolder: string;

  /**
   * The Rush configuration for the monorepo that the project belongs to.
   */
  public readonly rushConfiguration: RushConfiguration;

  /**
   * The review category name, or undefined if no category was assigned.
   * This name must be one of the valid choices listed in RushConfiguration.reviewCategories.
   */
  public readonly reviewCategory: string | undefined;

  /**
   * A list of local projects that appear as devDependencies for this project, but cannot be
   * locally linked because it would create a cyclic dependency; instead, the last published
   * version will be installed in the Common folder.
   *
   * These are package names that would be found by RushConfiguration.getProjectByName().
   */
  public readonly decoupledLocalDependencies: Set<string>;

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
  public readonly packageJsonEditor: PackageJsonEditor;

  /**
   * The unique name for the temporary project that will be generated in the Common folder.
   * For example, if the project name is `@scope/MyProject`, the temporary project name
   * might be `@rush-temp/MyProject-2`.
   *
   * Example: `@rush-temp/MyProject-2`
   */
  public readonly tempProjectName: string;

  /**
   * The unscoped temporary project name
   *
   * Example: `my-project-2`
   */
  public readonly unscopedTempProjectName: string;

  /**
   * If true, then this project will be ignored by the "rush check" command.
   * The default value is false.
   */
  public readonly skipRushCheck: boolean;

  /**
   * Name of the version policy used by this project.
   * @beta
   */
  public readonly versionPolicyName: string | undefined;

  /**
   * The full path of the folder that will get published by Rush.
   *
   * @remarks
   * By default this is the same as the project folder, but a custom folder can be specified
   * using the the "publishFolder" setting in rush.json.
   *
   * Example: `C:\MyRepo\libraries\my-project\temp\publish`
   */
  public readonly publishFolder: string;

  /**
   * An optional set of custom tags that can be used to select this project.
   *
   * @remarks
   * For example, adding `my-custom-tag` will allow this project to be selected by the
   * command `rush list --only tag:my-custom-tag`.  The tag name must be one or more words separated
   * by hyphens, where a word may contain lowercase letters, digits, and the period character.
   *
   * @beta
   */
  public readonly tags: ReadonlySet<string>;

  /** @internal */
  public constructor(options: IRushConfigurationProjectOptions) {
    const { projectJson, rushConfiguration, tempProjectName, allowedProjectTags } = options;
    this.rushConfiguration = rushConfiguration;
    this.packageName = projectJson.packageName;
    this.projectRelativeFolder = projectJson.projectFolder;

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

    this.projectFolder = path.join(rushConfiguration.rushJsonFolder, projectJson.projectFolder);
    const packageJsonFilename: string = path.join(this.projectFolder, FileConstants.PackageJson);

    try {
      const packageJsonText: string = FileSystem.readFile(packageJsonFilename);
      // JSON.parse is native and runs in less than 1/2 the time of jju.parse. package.json is required to be strict JSON by NodeJS.
      this._packageJson = JSON.parse(packageJsonText);
    } catch (error) {
      if (FileSystem.isNotExistError(error as Error)) {
        throw new Error(
          `Could not find package.json for ${projectJson.packageName} at ${packageJsonFilename}`
        );
      }
      throw error;
    }

    this.projectRushConfigFolder = path.join(this.projectFolder, 'config', 'rush');
    this.projectRushTempFolder = path.join(
      this.projectFolder,
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
      this.reviewCategory = projectJson.reviewCategory;
    }

    if (this.packageJson.name !== this.packageName) {
      throw new Error(
        `The package name "${this.packageName}" specified in rush.json does not` +
          ` match the name "${this.packageJson.name}" from package.json`
      );
    }

    if (!semver.valid(this.packageJson.version)) {
      throw new Error(
        `The value "${this.packageJson.version}" is not valid SemVer syntax for the \"version\" field` +
          ` in the file "${packageJsonFilename}"`
      );
    }

    this.packageJsonEditor = SaveCallbackPackageJsonEditor.fromObjectWithCallback({
      object: this.packageJson,
      filename: packageJsonFilename,
      onSaved: (newObject) => {
        // Just update the in-memory copy, don't bother doing the validation again
        this._packageJson = newObject;
        this._dependencyProjects = undefined; // Reset the cached dependency projects
      }
    });

    this.tempProjectName = tempProjectName;

    // The "rushProject.tempProjectName" is guaranteed to be unique name (e.g. by adding the "-2"
    // suffix).  Even after we strip the NPM scope, it will still be unique.
    // Example: "my-project-2"
    this.unscopedTempProjectName = PackageNameParsers.permissive.getUnscopedName(tempProjectName);

    this.decoupledLocalDependencies = new Set<string>();
    if (projectJson.cyclicDependencyProjects || projectJson.decoupledLocalDependencies) {
      if (projectJson.cyclicDependencyProjects && projectJson.decoupledLocalDependencies) {
        throw new Error(
          'A project configuration cannot specify both "decoupledLocalDependencies" and "cyclicDependencyProjects". Please use "decoupledLocalDependencies" only -- the other name is deprecated.'
        );
      }
      for (const cyclicDependencyProject of projectJson.cyclicDependencyProjects ||
        projectJson.decoupledLocalDependencies) {
        this.decoupledLocalDependencies.add(cyclicDependencyProject);
      }
    }
    this._shouldPublish = !!projectJson.shouldPublish;
    this.skipRushCheck = !!projectJson.skipRushCheck;
    this.versionPolicyName = projectJson.versionPolicyName;

    if (this._shouldPublish && this.packageJson.private) {
      throw new Error(
        `The project "${projectJson.packageName}" specifies "shouldPublish": true, ` +
          `but the package.json file specifies "private": true.`
      );
    }

    this.publishFolder = this.projectFolder;
    if (projectJson.publishFolder) {
      this.publishFolder = path.join(this.publishFolder, projectJson.publishFolder);
    }

    if (allowedProjectTags && projectJson.tags) {
      this.tags = new Set();
      for (const tag of projectJson.tags) {
        if (!allowedProjectTags.has(tag)) {
          throw new Error(
            `The tag "${tag}" specified for project "${this.packageName}" is not listed in the ` +
              `allowedProjectTags field in rush.json.`
          );
        } else {
          (this.tags as Set<string>).add(tag);
        }
      }
    } else {
      this.tags = new Set(projectJson.tags);
    }
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
    return this.decoupledLocalDependencies;
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
              this.rushConfiguration.getProjectByName(dependency);
            if (localProject && !this.decoupledLocalDependencies.has(dependency)) {
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
      const { projects } = this.rushConfiguration;

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
   * A flag which indicates whether changes to this project should be published. This controls
   * whether or not the project would show up when running `rush change`, and whether or not it
   * should be published during `rush publish`.
   */
  public get shouldPublish(): boolean {
    return this._shouldPublish || !!this.versionPolicyName;
  }

  /**
   * Version policy of the project
   * @beta
   */
  public get versionPolicy(): VersionPolicy | undefined {
    if (!this._versionPolicy) {
      if (this.versionPolicyName && this.rushConfiguration.versionPolicyConfiguration) {
        this._versionPolicy = this.rushConfiguration.versionPolicyConfiguration.getVersionPolicy(
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
}
