// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { cloneDeep } from 'lodash';
import * as semver from 'semver';

import {
  IVersionPolicyJson,
  ILockStepVersionJson,
  IIndividualVersionJson
} from './RushConfiguration';

import IPackageJson from '../utilities/IPackageJson';

/**
 * Type of version bumps
 * @alpha
 */
export enum BumpType {
  'prerelease',
  'release',
  'patch',
  'minor',
  'major'
}

/**
 * Version policy base type names
 * @alpha
 */
export enum BaseTypeName {
  'lockStepVersion',
  'individualVersion'
}

/**
 * This is the base class for version policy which controls how versions get bumped.
 * @alpha
 */
export abstract class VersionPolicy {
  private _policyName: string;
  private _baseType: BaseTypeName;

  public static load(versionPolicyJson: IVersionPolicyJson): VersionPolicy {
    const baseTypeName: BaseTypeName = BaseTypeName[versionPolicyJson.baseType];
    if (baseTypeName === BaseTypeName.lockStepVersion) {
      return new LockStepVersionPolicy(versionPolicyJson as ILockStepVersionJson);
    } else if (baseTypeName === BaseTypeName.individualVersion) {
      return new IndividualVersionPolicy(versionPolicyJson as IIndividualVersionJson);
    }
    return undefined;
  }

  constructor(versionPolicyJson: IVersionPolicyJson) {
    this._policyName = versionPolicyJson.policyName;
    this._baseType = BaseTypeName[versionPolicyJson.baseType];
  }

  public get policyName(): string {
    return this._policyName;
  }

  public get baseType(): BaseTypeName {
    return this._baseType;
  }

  public abstract ensure(project: IPackageJson): IPackageJson | undefined;
}

/**
 * This policy indicates all related projects should use the same version.
 * @alpha
 */
export class LockStepVersionPolicy extends VersionPolicy {
  private _version: semver.SemVer;
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
    const updatedProject: IPackageJson = cloneDeep(project);
    updatedProject.version = this._version.format();
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
}
