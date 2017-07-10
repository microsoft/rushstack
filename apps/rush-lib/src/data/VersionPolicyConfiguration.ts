// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fsx from 'fs-extra';
import JsonSchemaValidator from '../utilities/JsonSchemaValidator';
import JsonFile from '../utilities/JsonFile';

import { VersionPolicy } from './VersionPolicy';

export interface IVersionPolicyJson {
  policyName: string;
  definitionName: string;
}

export interface ILockStepVersionJson extends IVersionPolicyJson {
  version: string;
  nextBump: string;
}

export interface IIndividualVersionJson extends IVersionPolicyJson {
  lockedMajor?: number;
}

/**
 * @alpha
 */
export class VersionPolicyConfiguration {
  private _versionPolicies: Map<string, VersionPolicy>;

  public constructor(private _jsonFileName: string) {
    this._versionPolicies = new Map<string, VersionPolicy>();
    this._loadFile();
  }

  /**
   * Gets the version policy by its name.
   * Throws error if the version policy is not found.
   * @param policyName - Name of the version policy
   * @alpha
   */
  public getVersionPolicy(policyName: string): VersionPolicy {
    const policy: VersionPolicy = this._versionPolicies.get(policyName);
    if (!policy) {
      throw new Error(`Failed to find version policy by name \'${policyName}\'`);
    }
    return policy;
  }

  /**
   * Gets all the version policies
   * @alpha
   */
  public get versionPolicies(): Map<string, VersionPolicy> {
    return this._versionPolicies;
  }

  private _loadFile(): void {
    if (!fsx.existsSync(this._jsonFileName)) {
      return;
    }
    const versionPolicyJson: IVersionPolicyJson[] = JsonFile.loadJsonFile(this._jsonFileName);

    const schemaPath: string = path.join(__dirname, '../version-policies.schema.json');
    const validator: JsonSchemaValidator = JsonSchemaValidator.loadFromFile(schemaPath);
    validator.validateObject(versionPolicyJson, (errorDescription: string) => {
      throw new Error(`Error parsing file '${path.basename(this._jsonFileName)}':\n`
        + errorDescription);
    });

    versionPolicyJson.forEach(policyJson => {
      const policy: VersionPolicy = VersionPolicy.load(policyJson);
      if (policy) {
        this._versionPolicies.set(policy.policyName, policy);
      }
    });
  }
}
