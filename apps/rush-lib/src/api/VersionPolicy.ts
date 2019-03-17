// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { cloneDeep } from 'lodash';
import * as semver from 'semver';
import { IPackageJsonWithVersion } from '@microsoft/node-core-library';

import {
  IVersionPolicyJson,
  ILockStepVersionJson,
  IIndividualVersionJson,
  VersionFormatForCommit,
  VersionFormatForPublish,
  IVersionPolicyDependencyJson
} from './VersionPolicyConfiguration';
import { PackageJsonEditor } from './PackageJsonEditor';
import { RushConfiguration } from './RushConfiguration';
import { RushConfigurationProject } from './RushConfigurationProject';

/**
 * Type of version bumps
 * @beta
 */
export enum BumpType {
  // No version bump
  'none',
  // Prerelease version bump
  'prerelease',
  // Patch version bump
  'patch',
  // Preminor version bump
  'preminor',
  // Minor version bump
  'minor',
  // Major version bump
  'major'
}

/**
 * Version policy base type names
 * @beta
 */
export enum VersionPolicyDefinitionName {
  'lockStepVersion',
  'individualVersion'
}

/**
 * This is the base class for version policy which controls how versions get bumped.
 * @beta
 */
export abstract class VersionPolicy {
  private _policyName: string;
  private _definitionName: VersionPolicyDefinitionName;
  private _versionFormatForCommit: VersionFormatForCommit;
  private _versionFormatForPublish: VersionFormatForPublish;

  /**
   * Loads from version policy json
   *
   * @param versionPolicyJson - version policy Json
   *
   * @internal
   */
  public static load(versionPolicyJson: IVersionPolicyJson): VersionPolicy | undefined {
    const definition: VersionPolicyDefinitionName = VersionPolicyDefinitionName[versionPolicyJson.definitionName];
    if (definition === VersionPolicyDefinitionName.lockStepVersion) {
       // tslint:disable-next-line:no-use-before-declare
      return new LockStepVersionPolicy(versionPolicyJson as ILockStepVersionJson);
    } else if (definition === VersionPolicyDefinitionName.individualVersion) {
      // tslint:disable-next-line:no-use-before-declare
      return new IndividualVersionPolicy(versionPolicyJson as IIndividualVersionJson);
    }
    return undefined;
  }

  /**
   * @internal
   */
  constructor(versionPolicyJson: IVersionPolicyJson) {
    this._policyName = versionPolicyJson.policyName;
    this._definitionName = VersionPolicyDefinitionName[versionPolicyJson.definitionName];

    const jsonDependencies: IVersionPolicyDependencyJson = versionPolicyJson.dependencies || { };
    this._versionFormatForCommit = jsonDependencies.versionFormatForCommit || VersionFormatForCommit.original;
    this._versionFormatForPublish = jsonDependencies.versionFormatForPublish || VersionFormatForPublish.original;
  }

  /**
   * Version policy name
   */
  public get policyName(): string {
    return this._policyName;
  }

  /**
   * Version policy definition name
   */
  public get definitionName(): VersionPolicyDefinitionName {
    return this._definitionName;
  }

  /**
   * Whether it is a lockstepped version policy
   */
  public get isLockstepped(): boolean {
    return this.definitionName === VersionPolicyDefinitionName.lockStepVersion;
  }

  /**
   * Returns an updated package json that satisfies the policy.
   *
   * @param project - package json
   * @param force - force update even when the project version is higher than the policy version.
   */
  public abstract ensure(project: IPackageJsonWithVersion, force?: boolean): IPackageJsonWithVersion | undefined;

  /**
   * Bumps version based on the policy
   *
   * @param bumpType - (optional) override bump type
   * @param identifier - (optional) override prerelease Id
   */
  public abstract bump(bumpType?: BumpType, identifier?: string): void;

  /**
   * Serialized json for the policy
   *
   * @internal
   */
  public abstract get _json(): IVersionPolicyJson;

  /**
   * Validates the specified version and throws if the version does not satisfy the policy.
   *
   * @param versionString - version string
   * @param packageName - package name
   */
  public abstract validate(versionString: string, packageName: string): void;

  /**
   * Tells the version policy to modify any dependencies in the target package
   * to values used for publishing.
   */
  public setDependenciesBeforePublish(packageName: string, configuration: RushConfiguration): void {
    if (this._versionFormatForPublish === VersionFormatForPublish.exact) {
      const project: RushConfigurationProject = configuration.getProjectByName(packageName)!;

      const packageJsonEditor: PackageJsonEditor = project.packageJsonEditor;

      for (const dependency of packageJsonEditor.dependencyList) {
        const rushDependencyProject: RushConfigurationProject | undefined =
          configuration.getProjectByName(dependency.name);

        if (rushDependencyProject) {
          const dependencyVersion: string = rushDependencyProject.packageJson.version;

          dependency.setVersion(dependencyVersion);
        }
      }

      packageJsonEditor.saveIfModified();
    }
  }

  /**
   * Tells the version policy to modify any dependencies in the target package
   * to values used for checked-in source.
   */
  public setDependenciesBeforeCommit(packageName: string, configuration: RushConfiguration): void {
    if (this._versionFormatForCommit === VersionFormatForCommit.wildcard) {
      const project: RushConfigurationProject = configuration.getProjectByName(packageName)!;

      const packageJsonEditor: PackageJsonEditor = project.packageJsonEditor;

      for (const dependency of packageJsonEditor.dependencyList) {
        const rushDependencyProject: RushConfigurationProject | undefined =
          configuration.getProjectByName(dependency.name);

        if (rushDependencyProject) {
          dependency.setVersion('*');
        }
      }

      packageJsonEditor.saveIfModified();
    }
  }
}

/**
 * This policy indicates all related projects should use the same version.
 * @beta
 */
export class LockStepVersionPolicy extends VersionPolicy {
  private _version: semver.SemVer;
  // nextBump is probably not needed. It can be prerelease only.
  // Other types of bumps can be passed in as a parameter to bump method, so can identifier.
  private _nextBump: BumpType;
  private _mainProject: string | undefined;

  /**
   * @internal
   */
  constructor(versionPolicyJson: ILockStepVersionJson) {
    super(versionPolicyJson);
    this._version = new semver.SemVer(versionPolicyJson.version);
    this._nextBump = BumpType[versionPolicyJson.nextBump];
    this._mainProject = versionPolicyJson.mainProject;
  }

  /**
   * The value of the lockstep version
   */
  public get version(): string {
    return this._version.format();
  }

  /**
   * The type of bump for next bump.
   */
  public get nextBump(): BumpType {
    return this._nextBump;
  }

  /**
   * The main project for the version policy.
   *
   * If the value is provided, change logs will only be generated in that project.
   * If the value is not provided, change logs will be hosted in each project associated with the policy.
   */
  public get mainProject(): string | undefined {
    return this._mainProject;
  }

  /**
   * Serialized json for this policy
   *
   * @internal
   */
  public get _json(): ILockStepVersionJson {
    const json: ILockStepVersionJson = {
      policyName: this.policyName,
      definitionName: VersionPolicyDefinitionName[this.definitionName],
      version: this.version,
      nextBump: BumpType[this.nextBump]
    };
    if (this._mainProject) {
      json.mainProject = this._mainProject;
    }
    return json;
  }

  /**
   * Returns an updated package json that satisfies the version policy.
   *
   * @param project - input package json
   * @param force - force update even when the project version is higher than the policy version.
   */
  public ensure(project: IPackageJsonWithVersion, force?: boolean): IPackageJsonWithVersion | undefined {
    const packageVersion: semver.SemVer = new semver.SemVer(project.version);
    const compareResult: number = packageVersion.compare(this._version);
    if (compareResult === 0) {
      return undefined;
    } else if (compareResult > 0 && !force) {
      const errorMessage: string = `Version ${project.version} in package ${project.name}`
        + ` is higher than locked version ${this._version.format()}.`;
      throw new Error(errorMessage);
    }
    return this._updatePackageVersion(project, this._version);
  }

  /**
   * Bumps the version of the lockstep policy
   *
   * @param bumpType - Overwrite bump type in version-policy.json with the provided value.
   * @param identifier - Prerelease identifier if bump type is prerelease.
   */
  public bump(bumpType?: BumpType, identifier?: string): void {
    this._version.inc(this._getReleaseType(bumpType || this.nextBump), identifier);
  }

  /**
   * Updates the version of the policy directly with a new value
   * @param newVersionString - New version
   */
  public update(newVersionString: string): boolean {
    const newVersion: semver.SemVer = new semver.SemVer(newVersionString);
    if (!newVersion || this._version === newVersion) {
      return false;
    }
    this._version = newVersion;
    return true;
  }

  /**
   * Validates the specified version and throws if the version does not satisfy lockstep version.
   *
   * @param versionString - version string
   * @param packageName - package name
   */
  public validate(versionString: string, packageName: string): void {
    const versionToTest: semver.SemVer = new semver.SemVer(versionString, false);
    if (this._version.compare(versionToTest) !== 0) {
      throw new Error(`Invalid version ${versionString} in ${packageName}`);
    }
  }

  private _updatePackageVersion(project: IPackageJsonWithVersion, newVersion: semver.SemVer): IPackageJsonWithVersion {
    const updatedProject: IPackageJsonWithVersion = cloneDeep(project);
    updatedProject.version = newVersion.format();
    return updatedProject;
  }

  private _getReleaseType(bumpType: BumpType): semver.ReleaseType {
    // Eventually we should just use ReleaseType and get rid of bump type.
    return BumpType[bumpType] as semver.ReleaseType;
  }
}

/**
 * This policy indicates all related projects get version bump driven by their own changes.
 * @beta
 */
export class IndividualVersionPolicy extends VersionPolicy {
  private _lockedMajor: number | undefined;

  /**
   * @internal
   */
  constructor(versionPolicyJson: IIndividualVersionJson) {
    super(versionPolicyJson);
    this._lockedMajor = versionPolicyJson.lockedMajor;
  }

  /**
   * The major version that has been locked
   */
  public get lockedMajor(): number | undefined {
    return this._lockedMajor;
  }

  /**
   * Serialized json for this policy
   *
   * @internal
   */
  public get _json(): IIndividualVersionJson {
    const json: IIndividualVersionJson = {
      policyName: this.policyName,
      definitionName: VersionPolicyDefinitionName[this.definitionName]
    };
    if (this.lockedMajor !== undefined) {
      json.lockedMajor = this.lockedMajor;
    }
    return json;
  }

  /**
   * Returns an updated package json that satisfies the version policy.
   *
   * @param project - input package json
   * @param force - force update even when the project version is higher than the policy version.
   */
  public ensure(project: IPackageJsonWithVersion, force?: boolean): IPackageJsonWithVersion | undefined {
    if (this.lockedMajor) {
      const version: semver.SemVer = new semver.SemVer(project.version);
      if (version.major < this.lockedMajor) {
        const updatedProject: IPackageJsonWithVersion = cloneDeep(project);
        updatedProject.version = `${this._lockedMajor}.0.0`;
        return updatedProject;
      } else if (version.major > this.lockedMajor) {
        const errorMessage: string = `Version ${project.version} in package ${project.name}`
          + ` is higher than locked major version ${this._lockedMajor}.`;
        throw new Error(errorMessage);
      }
    }
    return undefined;
  }

  /**
   * Bumps version.
   * Individual version policy lets change files drive version bump. This method currently does not do anything.
   *
   * @param bumpType - bump type
   * @param identifier - prerelease id
   */
  public bump(bumpType?: BumpType, identifier?: string): void {
    // individual version policy lets change files drive version bump.
  }

  /**
   * Validates the specified version and throws if the version does not satisfy the policy.
   *
   * @param versionString - version string
   * @param packageName - package name
   */
  public validate(versionString: string, packageName: string): void {
    const versionToTest: semver.SemVer = new semver.SemVer(versionString, false);
    if (this._lockedMajor !== undefined) {
      if (this._lockedMajor !== versionToTest.major) {
        throw new Error(`Invalid major version ${versionString} in ${packageName}`);
      }
    }
  }
}
