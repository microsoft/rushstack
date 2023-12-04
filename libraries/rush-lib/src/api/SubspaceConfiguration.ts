// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile } from '@rushstack/node-core-library';
import path from 'path';
import { trueCasePathSync } from 'true-case-path';
import { RushConfiguration } from './RushConfiguration';

export interface ISubspaceConfig {
  subspaceName: string;
}

/**
 * This represents the JSON data structure for the "subspace.json" configuration file.
 * See subspace.schema.json for documentation.
 */
export interface ISubspaceConfigurationJson {
  $schema: string;
  enabled: boolean;
  depreciatedTTSupport?: boolean;
  availableSubspaces: ISubspaceConfig;
}

/**
 * This represents the subspace configurations for a repository, based on the "subspace.json"
 * configuration file.
 * @beta
 */
export class SubspaceConfiguration {
  /**
   * The absolute path to the "subspace.json" configuration file that was loaded to construct this object.
   */
  public readonly subspaceJsonFile: string;

  /**
   * Gets the JSON data structure for the "subspace.json" configuration file.
   *
   * @internal
   */
  public readonly subspaceConfigurationJson: ISubspaceConfigurationJson;

  /**
   * A set of the available subspaces
   */
  public readonly availableSubspaceSet: Set<string>;

  private constructor(subspaceConfigurationJson: ISubspaceConfigurationJson, subspaceJsonFilename: string) {
    this.subspaceConfigurationJson = subspaceConfigurationJson;
    this.subspaceJsonFile = subspaceJsonFilename;
    this.availableSubspaceSet = new Set();

    for (const { subspaceName } of Object.values(subspaceConfigurationJson.availableSubspaces)) {
      this.availableSubspaceSet.add(subspaceName);
    }
  }

  public static loadFromConfigurationFile(subspaceJsonFilename: string): SubspaceConfiguration {
    let resolvedSubspaceJsonFilename: string = path.resolve(subspaceJsonFilename);

    const subspaceConfigurationJson: ISubspaceConfigurationJson = JsonFile.load(resolvedSubspaceJsonFilename);

    try {
      resolvedSubspaceJsonFilename = trueCasePathSync(resolvedSubspaceJsonFilename);
    } catch (error) {
      /* ignore errors from true-case-path */
    }

    return new SubspaceConfiguration(subspaceConfigurationJson, resolvedSubspaceJsonFilename);
  }

  public static loadFromDefaultLocation(): SubspaceConfiguration | undefined {
    const rushJsonLocation: string | undefined = RushConfiguration.tryFindRushJsonLocation();
    if (rushJsonLocation) {
      const subspaceJsonLocation: string = path.join(path.dirname(rushJsonLocation), 'subspace.json');
      return SubspaceConfiguration.loadFromConfigurationFile(subspaceJsonLocation);
    }
  }
}
