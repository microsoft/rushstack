// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, JsonFile, JsonSchema } from '@rushstack/node-core-library';

import type { RushConfiguration } from './RushConfiguration';
import schemaJson from '../schemas/subspaces.schema.json';
import { RushConstants } from '../logic/RushConstants';

/**
 * The allowed naming convention for subspace names.
 * Allows for names to be formed of identifiers separated by hyphens (-)
 *
 * Example: "my-subspace"
 */
export const SUBSPACE_NAME_REGEXP: RegExp = /^[a-z0-9]*([+_a-z0-9]+)*$/;

/**
 * This represents the JSON data structure for the "subspaces.json" configuration file.
 * See subspace.schema.json for documentation.
 */
interface ISubspacesConfigurationJson {
  enabled: boolean;
  splitWorkspaceCompatibility?: boolean;
  subspaceNames: string[];
}

/**
 * This represents the subspace configurations for a repository, based on the "subspaces.json"
 * configuration file.
 * @beta
 */
export class SubspacesConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

  /**
   * The absolute path to the "subspaces.json" configuration file that was loaded to construct this object.
   */
  public readonly subspaceJsonFilePath: string;

  /**
   * Determines if the subspace feature is enabled
   */
  public readonly enabled: boolean;

  /**
   * This determines if the subspaces feature supports adding configuration files under the project folder itself
   */
  public readonly splitWorkspaceCompatibility: boolean;

  /**
   * A set of the available subspaces
   */
  public readonly subspaceNames: ReadonlySet<string>;

  private constructor(configuration: Readonly<ISubspacesConfigurationJson>, subspaceJsonFilePath: string) {
    this.subspaceJsonFilePath = subspaceJsonFilePath;
    this.enabled = configuration.enabled;
    this.splitWorkspaceCompatibility = !!configuration.splitWorkspaceCompatibility;
    const subspaceNames: Set<string> = new Set();
    for (const subspaceName of configuration.subspaceNames) {
      SubspacesConfiguration.requireValidSubspaceName(subspaceName);
      subspaceNames.add(subspaceName);
    }
    // Add the default subspace if it wasn't explicitly declared
    subspaceNames.add(RushConstants.defaultSubspaceName);
    this.subspaceNames = subspaceNames;
  }

  /**
   * Checks whether the provided string could be used as a subspace name.
   * Returns `undefined` if the name is valid; otherwise returns an error message.
   * @remarks
   * This is a syntax check only; it does not test whether the subspace is actually defined in the Rush configuration.
   */
  public static explainIfInvalidSubspaceName(subspaceName: string): string | undefined {
    if (subspaceName.length === 0) {
      return `The subspace name cannot be empty`;
    }
    if (!SUBSPACE_NAME_REGEXP.test(subspaceName)) {
      return (
        `Invalid name "${subspaceName}". ` +
        `Subspace names must consist of lowercase letters and numbers separated by hyphens or underscores.`
      );
    }

    return undefined; // name is okay
  }

  /**
   * Checks whether the provided string could be used as a subspace name.
   * If not, an exception is thrown.
   * @remarks
   * This is a syntax check only; it does not test whether the subspace is actually defined in the Rush configuration.
   */
  public static requireValidSubspaceName(subspaceName: string): void {
    const message: string | undefined = SubspacesConfiguration.explainIfInvalidSubspaceName(subspaceName);
    if (message) {
      throw new Error(message);
    }
  }

  public static tryLoadFromConfigurationFile(
    subspaceJsonFilePath: string
  ): SubspacesConfiguration | undefined {
    let configuration: Readonly<ISubspacesConfigurationJson> | undefined;
    try {
      configuration = JsonFile.loadAndValidate(subspaceJsonFilePath, SubspacesConfiguration._jsonSchema);
    } catch (e) {
      if (!FileSystem.isNotExistError(e)) {
        throw e;
      }
    }
    if (configuration) {
      return new SubspacesConfiguration(configuration, subspaceJsonFilePath);
    }
  }

  public static tryLoadFromDefaultLocation(
    rushConfiguration: RushConfiguration
  ): SubspacesConfiguration | undefined {
    const commonRushConfigFolder: string = rushConfiguration.commonRushConfigFolder;
    const subspaceJsonLocation: string = `${commonRushConfigFolder}/${RushConstants.subspacesConfigFilename}`;
    return SubspacesConfiguration.tryLoadFromConfigurationFile(subspaceJsonLocation);
  }
}
