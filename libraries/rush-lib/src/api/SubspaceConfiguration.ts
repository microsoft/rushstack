// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, JsonFile, JsonSchema } from '@rushstack/node-core-library';

import type { RushConfiguration } from './RushConfiguration';
import schemaJson from '../schemas/subspaces.schema.json';
import { RushConstants } from '../logic/RushConstants';

/**
 * The allowed naming convention for subspace names.
 * Allows for names to be formed of letters, numbers, and hyphens (-)
 */
export const SUBSPACE_NAME_REGEXP: RegExp = new RegExp('/^[a-z][a-z0-9]*([-][a-z0-9]+)*$/');

/**
 * This represents the JSON data structure for the "subspaces.json" configuration file.
 * See subspace.schema.json for documentation.
 */
interface ISubspaceConfigurationJson {
  enabled: boolean;
  splitWorkspaceCompatibility?: boolean;
  subspaceNames: string[];
}

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
  public readonly subspaceJsonFilePath: string;

  /**
   * A set of the available subspaces
   */
  public readonly subspaceNames: Set<string>;

  private constructor(configuration: Readonly<ISubspaceConfigurationJson>, subspaceJsonFilePath: string) {
    this.subspaceJsonFilePath = subspaceJsonFilePath;
    this.subspaceNames = new Set();
    for (const subspaceName of configuration.subspaceNames) {
      if (SUBSPACE_NAME_REGEXP.test(subspaceName)) {
        this.subspaceNames.add(subspaceName);
      } else {
        throw new Error(
          `Invalid subspace name: ${subspaceName}. Subspace names must only consist of lowercase letters, numbers, and hyphens (-).`
        );
      }
    }
  }

  public static tryLoadFromConfigurationFile(
    subspaceJsonFilePath: string
  ): SubspaceConfiguration | undefined {
    let configuration: Readonly<ISubspaceConfigurationJson> | undefined;
    try {
      configuration = JsonFile.loadAndValidate(subspaceJsonFilePath, SubspaceConfiguration._jsonSchema);
    } catch (e) {
      if (!FileSystem.isNotExistError(e)) {
        throw e;
      }
    }
    if (configuration) {
      return new SubspaceConfiguration(configuration, subspaceJsonFilePath);
    }
  }

  public static tryLoadFromDefaultLocation(
    rushConfiguration: RushConfiguration
  ): SubspaceConfiguration | undefined {
    const commonRushConfigFolder: string = rushConfiguration.commonRushConfigFolder;
    const subspaceJsonLocation: string = `${commonRushConfigFolder}/${RushConstants.subspacesConfigFilename}`;
    return SubspaceConfiguration.tryLoadFromConfigurationFile(subspaceJsonLocation);
  }
}
