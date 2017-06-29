// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  IVersionPolicyJson,
  ILockStepVersionJson,
  IIndividualVersionJson
} from './RushConfiguration';

/**
 * Type of version bumps
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
 */
export enum BaseTypeName {
  'lockStepVersion',
  'individualVersion'
}

/**
 * This is the base class for version policy which controls how versions get bumped.
 */
export class VersionPolicy {
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
}

/**
 * This policy indicates all related projects should use the same version.
 */
export class LockStepVersionPolicy extends VersionPolicy {
  private _version: string;
  private _nextBump: BumpType;

  constructor(versionPolicyJson: ILockStepVersionJson) {
    super(versionPolicyJson);
    this._version = versionPolicyJson.version;
    this._nextBump = BumpType[versionPolicyJson.nextBump];
  }

  public get version(): string {
    return this._version;
  }

  public get nextBump(): BumpType {
    return this._nextBump;
  }
}

/**
 * This policy indicates all related projects get version bump driven by their own changes.
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
}
