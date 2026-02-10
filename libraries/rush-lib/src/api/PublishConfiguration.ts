// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ProjectConfigurationFile, InheritanceType } from '@rushstack/heft-config-file';

import publishSchemaJson from '../schemas/publish.schema.json';

/**
 * Represents the parsed contents of a project's `config/publish.json` file.
 * @public
 */
export interface IPublishJson {
  /**
   * An object whose keys are publish target names (e.g. 'npm', 'vsix') and whose
   * values are provider-specific configuration objects.
   */
  providers?: Record<string, Record<string, unknown>>;
}

/**
 * The `ProjectConfigurationFile` instance for loading `config/publish.json` with
 * rig resolution and property inheritance.
 *
 * @remarks
 * The `providers` property uses custom inheritance: child provider sections are
 * shallow-merged over parent provider sections. This means a project can override
 * specific provider configs from a rig while inheriting others.
 *
 * @internal
 */
export const PUBLISH_CONFIGURATION_FILE: ProjectConfigurationFile<IPublishJson> =
  new ProjectConfigurationFile<IPublishJson>({
    projectRelativeFilePath: 'config/publish.json',
    jsonSchemaObject: publishSchemaJson,
    propertyInheritance: {
      providers: {
        inheritanceType: InheritanceType.custom,
        inheritanceFunction: (
          child: Record<string, Record<string, unknown>> | undefined,
          parent: Record<string, Record<string, unknown>> | undefined
        ): Record<string, Record<string, unknown>> | undefined => {
          if (!child) {
            return parent;
          }
          if (!parent) {
            return child;
          }
          // Shallow merge: child provider sections override parent provider sections
          return { ...parent, ...child };
        }
      }
    }
  });
