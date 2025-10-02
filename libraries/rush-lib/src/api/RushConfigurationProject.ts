// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import * as semver from 'semver';
import { type IPackageJson, FileSystem, FileConstants } from '@rushstack/node-core-library';

import type { RushConfiguration } from './RushConfiguration';
import type { VersionPolicy, LockStepVersionPolicy } from './VersionPolicy';
import type { PackageJsonEditor } from './PackageJsonEditor';
import { RushConstants } from '../logic/RushConstants';
import { PackageNameParsers } from './PackageNameParsers';
import { DependencySpecifier, DependencySpecifierType } from '../logic/DependencySpecifier';
import { SaveCallbackPackageJsonEditor } from './SaveCallbackPackageJsonEditor';
import type { Subspace } from './Subspace';

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
  subspaceName?: string;
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

  /**
   * The containing subspace.
   */
  subspace: Subspace;
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
   * Returns the subspace name that a project belongs to.
   * If subspaces is not enabled, returns the default subspace.
   */
  public readonly subspace: Subspace;

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

  /**
   * Returns the subspace name specified in the `"subspaceName"` field in `rush.json`.
   * Note that this field may be undefined, if the `default` subspace is being used,
   * and this field may be ignored if the subspaces feature is disabled.
   *
   * @beta
   */
  public readonly configuredSubspaceName: string | undefined;

  /** @internal */
  public constructor(options: IRushConfigurationProjectOptions) {
    const { projectJson, rushConfiguration, tempProjectName, allowedProjectTags } = options;
    const { packageName, projectFolder: projectRelativeFolder } = projectJson;
    this.rushConfiguration = rushConfiguration;
    this.packageName = packageName;
    this.projectRelativeFolder = projectRelativeFolder;

    validateRelativePathField(projectRelativeFolder, 'projectFolder', rushConfiguration.rushJsonFile);

    // For example, the depth of "a/b/c" would be 3.  The depth of "a" is 1.
    const projectFolderDepth: number = projectRelativeFolder.split('/').length;
    if (projectFolderDepth < rushConfiguration.projectFolderMinDepth) {
      throw new Error(
        `To keep things organized, this repository has a projectFolderMinDepth policy` +
          ` requiring project folders to be at least ${rushConfiguration.projectFolderMinDepth} levels deep.` +
          `  Problem folder: "${projectRelativeFolder}"`
      );
    }
    if (projectFolderDepth > rushConfiguration.projectFolderMaxDepth) {
      throw new Error(
        `To keep things organized, this repository has a projectFolderMaxDepth policy` +
          ` preventing project folders from being deeper than ${rushConfiguration.projectFolderMaxDepth} levels.` +
          `  Problem folder:  "${projectRelativeFolder}"`
      );
    }

    const absoluteProjectFolder: string = path.join(rushConfiguration.rushJsonFolder, projectRelativeFolder);
    this.projectFolder = absoluteProjectFolder;
    const packageJsonFilename: string = path.join(absoluteProjectFolder, FileConstants.PackageJson);

    try {
      const packageJsonText: string = FileSystem.readFile(packageJsonFilename);
      // JSON.parse is native and runs in less than 1/2 the time of jju.parse. package.json is required to be strict JSON by NodeJS.
      this._packageJson = JSON.parse(packageJsonText);
    } catch (error) {
      if (FileSystem.isNotExistError(error as Error)) {
        throw new Error(`Could not find package.json for ${packageName} at ${packageJsonFilename}`);
      }

      // Encountered an error while loading the package.json file. Please append the error message with the corresponding file location.
      if (error instanceof SyntaxError) {
        error.message = `${error.message}\nFilename: ${packageJsonFilename}`;
      }
      throw error;
    }

    this.projectRushConfigFolder = path.join(absoluteProjectFolder, 'config', 'rush');
    this.projectRushTempFolder = path.join(
      absoluteProjectFolder,
      RushConstants.projectRushFolderName,
      RushConstants.rushTempFolderName
    );

    // Are we using a package review file?
    if (rushConfiguration.approvedPackagesPolicy.enabled) {
      // If so, then every project needs to have a reviewCategory that was defined
      // by the reviewCategories array.
      if (!projectJson.reviewCategory) {
        throw new Error(
          `The "approvedPackagesPolicy" feature is enabled ${RushConstants.rushJsonFilename}, but a reviewCategory` +
            ` was not specified for the project "${packageName}".`
        );
      }
      if (!rushConfiguration.approvedPackagesPolicy.reviewCategories.has(projectJson.reviewCategory)) {
        throw new Error(
          `The project "${packageName}" specifies its reviewCategory as` +
            `"${projectJson.reviewCategory}" which is not one of the defined reviewCategories.`
        );
      }
      this.reviewCategory = projectJson.reviewCategory;
    }

    if (this.packageJson.name !== this.packageName) {
      throw new Error(
        `The package name "${this.packageName}" specified in ${RushConstants.rushJsonFilename} does not` +
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
        `The project "${packageName}" specifies "shouldPublish": true, ` +
          `but the package.json file specifies "private": true.`
      );
    }

    this.publishFolder = absoluteProjectFolder;
    const { publishFolder } = projectJson;
    if (publishFolder) {
      validateRelativePathField(publishFolder, 'publishFolder', rushConfiguration.rushJsonFile);
      this.publishFolder = path.join(this.publishFolder, publishFolder);
    }

    if (allowedProjectTags && projectJson.tags) {
      const tags: Set<string> = new Set();
      for (const tag of projectJson.tags) {
        if (!allowedProjectTags.has(tag)) {
          throw new Error(
            `The tag "${tag}" specified for project "${packageName}" is not listed in the ` +
              `allowedProjectTags field in ${RushConstants.rushJsonFilename}.`
          );
        } else {
          tags.add(tag);
        }
      }
      this.tags = tags;
    } else {
      this.tags = new Set(projectJson.tags);
    }

    this.configuredSubspaceName = projectJson.subspaceName;
    this.subspace = options.subspace;
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
            const dependencySpecifier: DependencySpecifier = DependencySpecifier.parseWithCache(
              dependency,
              version
            );
            const dependencyName: string =
              dependencySpecifier.aliasTarget?.packageName ?? dependencySpecifier.packageName;
            // Skip if we can't find the local project or it's a cyclic dependency
            const localProject: RushConfigurationProject | undefined =
              this.rushConfiguration.getProjectByName(dependencyName);
            if (localProject && !this.decoupledLocalDependencies.has(dependency)) {
              // Set the value if it's a workspace project, or if we have a local project and the semver is satisfied
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

export function validateRelativePathField(relativePath: string, field: string, file: string): void {
  // path.isAbsolute delegates depending on platform; however, path.posix.isAbsolute('C:/a') returns false,
  // while path.win32.isAbsolute('C:/a') returns true. We want consistent validation across platforms.
  if (path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
    throw new Error(
      `The value "${relativePath}" in the "${field}" field in "${file}" must be a relative path.`
    );
  }

  if (relativePath.includes('\\')) {
    throw new Error(
      `The value "${relativePath}" in the "${field}" field in "${file}" may not contain backslashes ('\\'), since they are interpreted differently` +
        ` on POSIX and Windows. Paths must use '/' as the path separator.`
    );
  }

  if (relativePath.endsWith('/')) {
    throw new Error(
      `The value "${relativePath}" in the "${field}" field in "${file}" may not end with a trailing '/' character.`
    );
  }

  const normalized: string = path.posix.normalize(relativePath);
  if (relativePath !== normalized) {
    throw new Error(
      `The value "${relativePath}" in the "${field}" field in "${file}" should be replaced with its normalized form "${normalized}".`
    );
  }
}
