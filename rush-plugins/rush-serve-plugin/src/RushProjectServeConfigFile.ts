// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'path';

import { ConfigurationFile, InheritanceType } from '@rushstack/heft-config-file';
import { Async, ITerminal } from '@rushstack/node-core-library';
import { RigConfig } from '@rushstack/rig-package';
import type { RushConfigurationProject } from '@rushstack/rush-sdk';

export interface IRushProjectServeJson {
  routing: IRoutingRuleJson[];
}

export interface IRoutingRuleJson {
  projectRelativeFolder: string;
  servePath: string;
  immutable?: boolean;
}

export interface IRoutingRule {
  diskPath: string;
  servePath: string;
  immutable: boolean;
}

export class RushServeConfiguration {
  private readonly _loader: ConfigurationFile<IRushProjectServeJson>;

  public constructor() {
    const jsonSchemaPath: string = `${__dirname}/schemas/rush-project-serve.schema.json`;
    this._loader = new ConfigurationFile<IRushProjectServeJson>({
      projectRelativeFilePath: 'config/rush-project-serve.json',
      jsonSchemaPath,
      propertyInheritance: {
        routing: {
          inheritanceType: InheritanceType.append
        }
      }
    });
  }

  public async loadProjectConfigsAsync(
    projects: Iterable<RushConfigurationProject>,
    terminal: ITerminal
  ): Promise<Iterable<IRoutingRule>> {
    const rules: IRoutingRule[] = [];

    await Async.forEachAsync(
      projects,
      async (project: RushConfigurationProject) => {
        const rigConfig: RigConfig = await RigConfig.loadForProjectFolderAsync({
          projectFolderPath: project.projectFolder
        });

        const serveJson: IRushProjectServeJson | undefined =
          await this._loader.tryLoadConfigurationFileForProjectAsync(
            terminal,
            project.projectFolder,
            rigConfig
          );
        if (serveJson) {
          for (const rule of serveJson.routing) {
            rules.push({
              diskPath: path.resolve(project.projectFolder, rule.projectRelativeFolder),
              servePath: rule.servePath,
              immutable: !!rule.immutable
            });
          }
        }
      },
      {
        concurrency: 20
      }
    );

    return rules;
  }
}
