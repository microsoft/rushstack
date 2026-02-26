// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ProjectConfigurationFile, InheritanceType } from '@rushstack/heft-config-file';

import rushPublishSchemaJson from '../schemas/rush-publish.schema.json';

/**
 * Represents a single publish provider entry in the `providers` array.
 * @public
 */
export interface IRushPublishProviderEntry {
  /**
   * The name of the publish provider (e.g. 'npm', 'vsix').
   */
  name: string;

  /**
   * Provider-specific configuration options.
   */
  options?: Record<string, unknown>;
}

/**
 * Represents the parsed contents of a project's `config/rush-publish.json` file.
 * @public
 */
export interface IRushPublishJson {
  /**
   * An array of publish provider entries. Each entry specifies a provider name
   * and an optional set of provider-specific configuration options.
   */
  providers?: IRushPublishProviderEntry[];
}

/**
 * The `ProjectConfigurationFile` instance for loading `config/rush-publish.json` with
 * rig resolution and property inheritance.
 *
 * @remarks
 * The `providers` property uses custom inheritance with name-based deduplication:
 * parent entries whose name does not appear in the child array are prepended,
 * followed by the child entries. This means a project can override specific
 * provider configs from a rig while inheriting others.
 *
 * @internal
 */
export const RUSH_PUBLISH_CONFIGURATION_FILE: ProjectConfigurationFile<IRushPublishJson> =
  new ProjectConfigurationFile<IRushPublishJson>({
    projectRelativeFilePath: 'config/rush-publish.json',
    jsonSchemaObject: rushPublishSchemaJson,
    propertyInheritance: {
      providers: {
        inheritanceType: InheritanceType.custom,
        inheritanceFunction: (
          child: IRushPublishProviderEntry[] | undefined,
          parent: IRushPublishProviderEntry[] | undefined
        ): IRushPublishProviderEntry[] | undefined => {
          if (!child) {
            return parent;
          }
          if (!parent) {
            return child;
          }
          // Name-based deduplication: inherit parent entries not overridden by child
          const childNames: Set<string> = new Set(child.map((entry) => entry.name));
          const inherited: IRushPublishProviderEntry[] = parent.filter(
            (entry) => !childNames.has(entry.name)
          );
          return [...inherited, ...child];
        }
      }
    }
  });
