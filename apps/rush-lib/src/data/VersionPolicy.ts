// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { cloneDeep } from 'lodash';
import * as semver from 'semver';

import {
  IVersionPolicyJson,
  ILockStepVersionJson,
  IIndividualVersionJson
} from './VersionPolicyConfiguration';

import IPackageJson from '../utilities/IPackageJson';

/**
 * Type of version bumps
 * @alpha
 */
export enum BumpType {
  'prerelease',
  'patch',
  'minor',
  'major'
}

/**
 * Version policy base type names
 * @alpha
 */
export enum VersionPolicyDefinitionName {
  'lockStepVersion',
  'individualVersion'
}

/**
 * This is the base class for version policy which controls how versions get bumped.
 * @alpha
 */
export abstract class VersionPolicy {
  private _policyName: string;
  private _definitionName: VersionPolicyDefinitionName;

  public static load(versionPolicyJson: IVersionPolicyJson): VersionPolicy {
    const definition: VersionPolicyDefinitionName = VersionPolicyDefinitionName[versionPolicyJson.definitionName];
    if (definition === VersionPolicyDefinitionName.lockStepVersion) {
      return new LockStepVersionPolicy(versionPolicyJson as ILockStepVersionJson);
    } else if (definition === VersionPolicyDefinitionName.individualVersion) {
      return new IndividualVersionPolicy(versionPolicyJson as IIndividualVersionJson);
    }
    return undefined;
  }

  constructor(versionPolicyJson: IVersionPolicyJson) {
    this._policyName = versionPolicyJson.policyName;
    this._definitionName = VersionPolicyDefinitionName[versionPolicyJson.definitionName];
  }

  public get policyName(): string {
    return this._policyName;
  }

  public get definitionName(): VersionPolicyDefinitionName {
    return this._definitionName;
  }

  public abstract ensure(project: IPackageJson): IPackageJson | undefined;

  public abstract bump(): void;

  public abstract get json(): IVersionPolicyJson;

  public abstract validate(versionString: string, packageName: string): void;
}

/**
 * This policy indicates all related projects should use the same version.
 * @alpha
 */
export class LockStepVersionPolicy extends VersionPolicy {
  private _version: semver.SemVer;
  // nextBump is probably not needed. It can be prerelease only.
  // Other types of bumps can be passed in as a parameter to bump method, so can identifier.
  private _nextBump: BumpType;

  constructor(versionPolicyJson: ILockStepVersionJson) {
    super(versionPolicyJson);
    this._version = new semver.SemVer(versionPolicyJson.version);
    this._nextBump = BumpType[versionPolicyJson.nextBump];
  }

  public get version(): semver.SemVer {
    return this._version;
  }

  public get nextBump(): BumpType {
    return this._nextBump;
  }

  public get json(): ILockStepVersionJson {
    return {
      policyName: this.policyName,
      definitionName: VersionPolicyDefinitionName[this.definitionName],
      version: this.version.format(),
      nextBump: BumpType[this.nextBump]
    };
  }

  public ensure(project: IPackageJson): IPackageJson | undefined {
    const packageVersion: semver.SemVer = new semver.SemVer(project.version);
    const compareResult: number = packageVersion.compare(this._version);
    if (compareResult === 0) {
      return undefined;
    } else if (compareResult > 0) {
      const errorMessage: string = `Version ${project.version} in package ${project.name}`
        + ` is higher than locked version ${this._version.format()}.`;
      throw new Error(errorMessage);
    }
    return this._updatePackageVersion(project, this._version);
  }

  public bump(): void {
    this.version.inc(BumpType[this._nextBump]);
  }

  public validate(versionString: string, packageName: string): void {
    const versionToTest: semver.SemVer = new semver.SemVer(versionString, false);
    if (this.version.compare(versionToTest) !== 0) {
      throw new Error(`Invalid version ${versionString} in ${packageName}`);
    }
  }

  private _updatePackageVersion(project: IPackageJson, newVersion: semver.SemVer): IPackageJson {
    const updatedProject: IPackageJson = cloneDeep(project);
    updatedProject.version = newVersion.format();
    return updatedProject;
  }
}

/**
 * This policy indicates all related projects get version bump driven by their own changes.
 * @alpha
 */
export class IndividualVersionPolicy extends VersionPolicy {
  private _lockedMajor: number | undefined;

  constructor(versionPolicyJson: IIndividualVersionJson) {
    super(versionPolicyJson);
    this._lockedMajor = versionPolicyJson.lockedMajor;
  }

  public get lockedMajor(): number | undefined {
    return this._lockedMajor;
  }

  public get json(): IIndividualVersionJson {
    return {
      policyName: this.policyName,
      definitionName: VersionPolicyDefinitionName[this.definitionName],
      lockedMajor: this.lockedMajor
    };
  }

  public ensure(project: IPackageJson): IPackageJson | undefined {
    if (this.lockedMajor) {
      const version: semver.SemVer = new semver.SemVer(project.version);
      if (version.major < this._lockedMajor) {
        const updatedProject: IPackageJson = cloneDeep(project);
        updatedProject.version = `${this._lockedMajor}.0.0`;
        return updatedProject;
      } else if (version.major > this._lockedMajor) {
        const errorMessage: string = `Version ${project.version} in package ${project.name}`
          + ` is higher than locked major version ${this._lockedMajor}.`;
        throw new Error(errorMessage);
      }
    }
    return undefined;
  }

  public bump(): void {
    // individual version policy lets change files drive version bump.
  }

  public validate(versionString: string, packageName: string): void {
    const versionToTest: semver.SemVer = new semver.SemVer(versionString, false);
    if (this._lockedMajor !== undefined) {
      if (this._lockedMajor !== versionToTest.major) {
        throw new Error(`Invalid major version ${versionString} in ${packageName}`);
      }
    }
  }
}
