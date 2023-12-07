// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, JsonFile, JsonSchema } from '@rushstack/node-core-library';
import path from 'path';
import { trueCasePathSync } from 'true-case-path';

import { RushConfiguration } from './RushConfiguration';
import schemaJson from '../schemas/subspaces.schema.json';

export interface ISubspaceConfig {
  subspaceName: string;
}

/**
 * This represents the JSON data structure for the "subspaces.json" configuration file.
 * See subspace.schema.json for documentation.
 * @beta
 */
export interface ISubspaceConfigurationJson {
  enabled: boolean;
  splitWorkspaceCompatibility?: boolean;
  availableSubspaces: ISubspaceConfig[];
}

/**
 * The allowed naming convention for subspace names
 */
export const SubspaceRegex: RegExp = new RegExp('/^[a-z][a-z0-9]*([-][a-z0-9]+)*$/');

/**
 * This represents the subspace configurations for a repository, based on the "subspaces.json"
 * configuration file.
 * @beta
 */
export class SubspaceConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

  /**
   * The absolute path to the "subspaces.json" configuration file that was loaded to construct this object.
   */
  public readonly subspaceJsonFile: string;

  /**
   * Gets the JSON data structure for the "subspaces.json" configuration file.
   *
   * @internal
   */
  public readonly configuration: Readonly<ISubspaceConfigurationJson>;

  /**
   * A set of the available subspaces
   */
  public readonly availableSubspaceSet: Set<string>;

  private constructor(subspaceJsonFilename: string) {
    this.configuration = {
      enabled: false,
      availableSubspaces: []
    };
    this.subspaceJsonFile = subspaceJsonFilename;
    this.availableSubspaceSet = new Set();

    if (FileSystem.exists(this.subspaceJsonFile)) {
      this.configuration = JsonFile.loadAndValidate(this.subspaceJsonFile, SubspaceConfiguration._jsonSchema);
    }

    for (const { subspaceName } of Object.values(this.configuration.availableSubspaces)) {
      if (SubspaceRegex.test(subspaceName)) {
        this.availableSubspaceSet.add(subspaceName);
      } else {
        throw new Error(
          `Invalid subspace name: ${subspaceName}. Subspace names must only consist of lowercase letters, numbers, and hyphens (-).`
        );
      }
    }
  }

  public static loadFromConfigurationFile(subspaceJsonFilename: string): SubspaceConfiguration {
    let resolvedSubspaceJsonFilename: string = path.resolve(subspaceJsonFilename);

    try {
      resolvedSubspaceJsonFilename = trueCasePathSync(resolvedSubspaceJsonFilename);
    } catch (error) {
      /* ignore errors from true-case-path */
    }

    return new SubspaceConfiguration(resolvedSubspaceJsonFilename);
  }

  public static loadFromDefaultLocation(): SubspaceConfiguration | undefined {
    const rushJsonLocation: string | undefined = RushConfiguration.tryFindRushJsonLocation();
    if (rushJsonLocation) {
      const subspaceJsonLocation: string = path.join(path.dirname(rushJsonLocation), 'subspaces.json');
      return SubspaceConfiguration.loadFromConfigurationFile(subspaceJsonLocation);
    }
  }
}
