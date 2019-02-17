// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonFile, JsonSchema, FileSystem } from '@microsoft/node-core-library';

import { VersionPolicy, BumpType, LockStepVersionPolicy } from './VersionPolicy';
import { RushConfigurationProject } from './RushConfigurationProject';

/**
 * @beta
 */
export interface IVersionPolicyJson {
  policyName: string;
  definitionName: string;
  dependencies?: IVersionPolicyDependencyJson;
}

/**
 * @beta
 */
export interface ILockStepVersionJson extends IVersionPolicyJson {
  version: string;
  nextBump: string;
  mainProject?: string;
}

/**
 * @beta
 */
export interface IIndividualVersionJson extends IVersionPolicyJson {
  lockedMajor?: number;
}

/**
 * @beta
 */
export enum VersionFormatForPublish {
  original = 'original',
  exact = 'exact'
}

/**
 * @beta
 */
export enum VersionFormatForCommit {
  wildcard = 'wildcard',
  original = 'original'
}

/**
 * @beta
 */
export interface IVersionPolicyDependencyJson {
  versionFormatForPublish?: VersionFormatForPublish;
  versionFormatForCommit?: VersionFormatForCommit;
}

/**
 * Use this class to load and save the "common/config/rush/version-policies.json" config file.
 * This config file configures how different groups of projects will be published by Rush,
 * and how their version numbers will be determined.
 * @beta
 */
export class VersionPolicyConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromFile(
    path.join(__dirname, '../schemas/version-policies.schema.json'));

  private _versionPolicies: Map<string, VersionPolicy>;
  private _jsonFileName: string;

  /**
   * @internal
   */
  public constructor(jsonFileName: string) {
    this._jsonFileName = jsonFileName;
    this._versionPolicies = new Map<string, VersionPolicy>();
    this._loadFile();
  }

  /**
   * Validate the version policy configuration against the rush config
   */
  public validate(projectsByName: Map<string, RushConfigurationProject>): void {
    if (!this.versionPolicies) {
      return;
    }
    this.versionPolicies.forEach((policy) => {
      const lockStepPolicy: LockStepVersionPolicy = policy as LockStepVersionPolicy;
      if (lockStepPolicy.mainProject && !projectsByName.get(lockStepPolicy.mainProject)) {
        throw new Error(`Version policy \"${policy.policyName}\" has a non-existing mainProject:` +
          ` ${lockStepPolicy.mainProject}.`);
      }
    });
  }

  /**
   * Gets the version policy by its name.
   * Throws error if the version policy is not found.
   * @param policyName - Name of the version policy
   */
  public getVersionPolicy(policyName: string): VersionPolicy {
    const policy: VersionPolicy | undefined = this._versionPolicies.get(policyName);
    if (!policy) {
      throw new Error(`Failed to find version policy by name \'${policyName}\'`);
    }
    return policy;
  }

  /**
   * Gets all the version policies
   */
  public get versionPolicies(): Map<string, VersionPolicy> {
    return this._versionPolicies;
  }

  /**
   * Bumps up versions for the specified version policy or all version policies
   *
   * @param versionPolicyName - version policy name
   * @param bumpType - bump type to override what policy has defined.
   * @param identifier - prerelease identifier to override what policy has defined.
   * @param shouldCommit - should save to disk
   */
  public bump(versionPolicyName?: string,
    bumpType?: BumpType,
    identifier?: string,
    shouldCommit?: boolean
  ): void {
    if (versionPolicyName) {
      const policy: VersionPolicy | undefined = this.versionPolicies.get(versionPolicyName);
      if (policy) {
        policy.bump(bumpType, identifier);
      }
    } else {
      this.versionPolicies.forEach((versionPolicy) => {
        if (versionPolicy) {
          versionPolicy.bump(bumpType, identifier);
        }
      });
    }
    this._saveFile(!!shouldCommit);
  }

  /**
   * Updates the version directly for the specified version policy
   * @param versionPolicyName - version policy name
   * @param newVersion - new version
   */
  public update(versionPolicyName: string,
    newVersion: string
  ): void {
    const policy: VersionPolicy | undefined = this.versionPolicies.get(versionPolicyName);
    if (!policy || !policy.isLockstepped) {
      throw new Error(`Lockstep Version policy with name "${versionPolicyName}" cannot be found`);
    }
    const lockStepVersionPolicy: LockStepVersionPolicy = policy as LockStepVersionPolicy;
    if (lockStepVersionPolicy.update(newVersion)) {
      this._saveFile(true);
    }
  }

  private _loadFile(): void {
    if (!FileSystem.exists(this._jsonFileName)) {
      return;
    }
    const versionPolicyJson: IVersionPolicyJson[] = JsonFile.loadAndValidate(this._jsonFileName,
      VersionPolicyConfiguration._jsonSchema);

    versionPolicyJson.forEach(policyJson => {
      const policy: VersionPolicy | undefined = VersionPolicy.load(policyJson);
      if (policy) {
        this._versionPolicies.set(policy.policyName, policy);
      }
    });
  }

  private _saveFile(shouldCommit: boolean): void {
    const versionPolicyJson: IVersionPolicyJson[] = [];
    this.versionPolicies.forEach((versionPolicy) => {
      versionPolicyJson.push(versionPolicy._json);
    });
    if (shouldCommit) {
      JsonFile.save(versionPolicyJson, this._jsonFileName, { updateExistingFile: true });
    }
  }
}
