// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile, JsonSchema, FileSystem } from '@rushstack/node-core-library';

import { VersionPolicy, type BumpType, type LockStepVersionPolicy } from './VersionPolicy';
import type { RushConfigurationProject } from './RushConfigurationProject';
import schemaJson from '../schemas/version-policies.schema.json';

/**
 * This interface represents the raw version policy JSON object which allows repo
 * maintainers to define how different groups of projects will be published by Rush,
 * and how their version numbers will be determined.
 * @public
 */
export interface IVersionPolicyJson {
  policyName: string;
  definitionName: string;
  dependencies?: IVersionPolicyDependencyJson;
  exemptFromRushChange?: boolean;
  includeEmailInChangeFile?: boolean;
}

/**
 * This interface represents the raw lock-step version policy JSON object which extends the base version policy
 * with additional fields specific to lock-step versioning.
 * @public
 */
export interface ILockStepVersionJson extends IVersionPolicyJson {
  version: string;
  nextBump?: string;
  mainProject?: string;
}

/**
 * This interface represents the raw individual version policy JSON object which extends the base version policy
 * with additional fields specific to individual versioning.
 * @public
 */
export interface IIndividualVersionJson extends IVersionPolicyJson {
  lockedMajor?: number;
}

/**
 * @public
 */
export type VersionFormatForPublish = 'original' | 'exact';

/**
 * @public
 */
export type VersionFormatForCommit = 'wildcard' | 'original';

/**
 * This interface represents the `dependencies` field in a version policy JSON object,
 * allowing repo maintainers to specify how dependencies' versions should be handled
 * during publishing and committing.
 * @public
 */
export interface IVersionPolicyDependencyJson {
  versionFormatForPublish?: VersionFormatForPublish;
  versionFormatForCommit?: VersionFormatForCommit;
}

/**
 * Use this class to load and save the "common/config/rush/version-policies.json" config file.
 * This config file configures how different groups of projects will be published by Rush,
 * and how their version numbers will be determined.
 * @public
 */
export class VersionPolicyConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

  private _jsonFileName: string;

  /**
   * Gets all the version policies
   */
  public readonly versionPolicies: Map<string, VersionPolicy>;

  /**
   * @internal
   */
  public constructor(jsonFileName: string) {
    this._jsonFileName = jsonFileName;
    this.versionPolicies = new Map<string, VersionPolicy>();
    this._loadFile();
  }

  /**
   * Validate the version policy configuration against the rush config
   */
  public validate(projectsByName: ReadonlyMap<string, RushConfigurationProject>): void {
    if (!this.versionPolicies) {
      return;
    }
    this.versionPolicies.forEach((policy) => {
      const lockStepPolicy: LockStepVersionPolicy = policy as LockStepVersionPolicy;
      if (lockStepPolicy.mainProject && !projectsByName.get(lockStepPolicy.mainProject)) {
        throw new Error(
          `Version policy \"${policy.policyName}\" has a non-existing mainProject:` +
            ` ${lockStepPolicy.mainProject}.`
        );
      }
    });
  }

  /**
   * Gets the version policy by its name.
   * Throws error if the version policy is not found.
   * @param policyName - Name of the version policy
   */
  public getVersionPolicy(policyName: string): VersionPolicy {
    const policy: VersionPolicy | undefined = this.versionPolicies.get(policyName);
    if (!policy) {
      throw new Error(`Failed to find version policy by name \'${policyName}\'`);
    }
    return policy;
  }

  /**
   * Bumps up versions for the specified version policy or all version policies
   *
   * @param versionPolicyName - version policy name
   * @param bumpType - bump type to override what policy has defined.
   * @param identifier - prerelease identifier to override what policy has defined.
   * @param shouldCommit - should save to disk
   */
  public bump(
    versionPolicyName?: string,
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
  public update(versionPolicyName: string, newVersion: string, shouldCommit?: boolean): void {
    const policy: VersionPolicy | undefined = this.versionPolicies.get(versionPolicyName);
    if (!policy || !policy.isLockstepped) {
      throw new Error(`Lockstep Version policy with name "${versionPolicyName}" cannot be found`);
    }
    const lockStepVersionPolicy: LockStepVersionPolicy = policy as LockStepVersionPolicy;
    const previousVersion: string = lockStepVersionPolicy.version;
    if (lockStepVersionPolicy.update(newVersion)) {
      // eslint-disable-next-line no-console
      console.log(`\nUpdate version policy ${versionPolicyName} from ${previousVersion} to ${newVersion}`);
      this._saveFile(!!shouldCommit);
    }
  }

  private _loadFile(): void {
    if (!FileSystem.exists(this._jsonFileName)) {
      return;
    }
    const versionPolicyJson: IVersionPolicyJson[] = JsonFile.loadAndValidate(
      this._jsonFileName,
      VersionPolicyConfiguration._jsonSchema
    );

    versionPolicyJson.forEach((policyJson) => {
      const policy: VersionPolicy | undefined = VersionPolicy.load(policyJson);
      if (policy) {
        this.versionPolicies.set(policy.policyName, policy);
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
