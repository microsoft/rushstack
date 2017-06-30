// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { cloneDeep } from 'lodash';
import { SemVer } from 'semver';

import {
  IVersionPolicyJson,
  ILockStepVersionJson,
  IIndividualVersionJson
} from './RushConfiguration';

import IPackageJson from '../utilities/IPackageJson';

import RushConfigurationProject from './RushConfigurationProject';

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

  public abstract ensure(project: RushConfigurationProject): IPackageJson | undefined;
}

/**
 * This policy indicates all related projects should use the same version.
 * @alpha
 */
export class LockStepVersionPolicy extends VersionPolicy {
  private _version: SemVer;
  private _nextBump: BumpType;

  constructor(versionPolicyJson: ILockStepVersionJson) {
    super(versionPolicyJson);
    this._version = new SemVer(versionPolicyJson.version);
    this._nextBump = BumpType[versionPolicyJson.nextBump];
  }

  public get version(): SemVer {
    return this._version;
  }

  public get nextBump(): BumpType {
    return this._nextBump;
  }

  public ensure(project: RushConfigurationProject): IPackageJson | undefined {
    const packageVersion: SemVer = new SemVer(project.packageJson.version);
    if (packageVersion.format() === this._version.format()) {
      // No need to update the project
      return undefined;
    }
    const updatedProject: IPackageJson = cloneDeep(project.packageJson);
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

  public ensure(project: RushConfigurationProject): IPackageJson | undefined {
    if (this.lockedMajor) {
      const version: SemVer = new SemVer(project.packageJson.version);
      if (version.major !== this._lockedMajor) {
        const updatedProject: IPackageJson = cloneDeep(project.packageJson);
        version.major = this._lockedMajor;
        updatedProject.version = version.format();
        return updatedProject;
      }
    }
    return undefined;
  }
}
