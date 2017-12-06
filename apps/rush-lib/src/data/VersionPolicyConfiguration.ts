// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fsx from 'fs-extra';
import { JsonFile, JsonSchema } from '@microsoft/node-core-library';

import { VersionPolicy, BumpType } from './VersionPolicy';

/**
 * @beta
 */
export interface IVersionPolicyJson {
  policyName: string;
  definitionName: string;
}

/**
 * @beta
 */
export interface ILockStepVersionJson extends IVersionPolicyJson {
  version: string;
  nextBump: string;
  changeLogHostProject?: string;
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
export class VersionPolicyConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromFile(
    path.join(__dirname, '../schemas/version-policies.schema.json'));

  private _versionPolicies: Map<string, VersionPolicy>;

  /**
   * @internal
   */
  public constructor(private _jsonFileName: string) {
    this._versionPolicies = new Map<string, VersionPolicy>();
    this._loadFile();
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
    const versionPolicyJson: IVersionPolicyJson[] = [];
    this.versionPolicies.forEach((versionPolicy) => {
      versionPolicyJson.push(versionPolicy._json);
    });
    if (shouldCommit) {
      JsonFile.save(versionPolicyJson, this._jsonFileName);
    }
  }

  private _loadFile(): void {
    if (!fsx.existsSync(this._jsonFileName)) {
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
}
