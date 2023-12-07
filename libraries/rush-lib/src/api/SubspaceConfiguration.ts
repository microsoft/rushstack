// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, JsonFile, JsonSchema } from '@rushstack/node-core-library';
import path from 'path';

import type { RushConfiguration } from './RushConfiguration';
import schemaJson from '../schemas/subspaces.schema.json';
import { RushConstants } from '../logic/RushConstants';

/**
 * This represents the JSON data structure for the "subspaces.json" configuration file.
 * See subspace.schema.json for documentation.
 * @beta
 */
export interface ISubspaceConfigurationJson {
  enabled: boolean;
  splitWorkspaceCompatibility?: boolean;
  subspaceNames: string[];
}

/**
 * The allowed naming convention for subspace names.
 * Allows for names to be formed of letters, numbers, and hyphens (-)
 */
export const SUBSPACE_NAME_REGEXP: RegExp = new RegExp('/^[a-z][a-z0-9]*([-][a-z0-9]+)*$/');

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
  private readonly _configuration: Readonly<ISubspaceConfigurationJson>;

  /**
   * A set of the available subspaces
   */
  public readonly subspaceNames: Set<string>;

  private constructor(subspaceJsonFilename: string) {
    this._configuration = {
      enabled: false,
      subspaceNames: []
    };
    this.subspaceJsonFile = subspaceJsonFilename;
    this.subspaceNames = new Set();

    try {
      this._configuration = JsonFile.loadAndValidate(
        this.subspaceJsonFile,
        SubspaceConfiguration._jsonSchema
      );
    } catch (e) {
      if (!FileSystem.isNotExistError(e)) {
        throw e;
      }
    }

    for (const subspaceName of this._configuration.subspaceNames) {
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
    subspaceJsonFilename: string
  ): SubspaceConfiguration | undefined {
    if (FileSystem.exists(subspaceJsonFilename)) {
      return undefined;
    }
    return new SubspaceConfiguration(subspaceJsonFilename);
  }

  public static loadFromDefaultLocation(
    rushConfiguration: RushConfiguration
  ): SubspaceConfiguration | undefined {
    const rushJsonLocation: string = rushConfiguration.rushJsonFolder;
    if (rushJsonLocation) {
      const subspaceJsonLocation: string = path.join(
        path.dirname(rushJsonLocation),
        'common/config/rush',
        RushConstants.subspacesFilename
      );
      return SubspaceConfiguration.tryLoadFromConfigurationFile(subspaceJsonLocation);
    }
  }
}
