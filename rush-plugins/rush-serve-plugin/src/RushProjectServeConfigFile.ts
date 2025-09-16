// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'path';

import { ProjectConfigurationFile, InheritanceType } from '@rushstack/heft-config-file';
import { Async } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import { RigConfig } from '@rushstack/rig-package';
import type { RushConfigurationProject } from '@rushstack/rush-sdk';

import rushProjectServeSchema from './schemas/rush-project-serve.schema.json';
import type { IRushProjectServeJson, IRoutingRule } from './types';

export class RushServeConfiguration {
  private readonly _loader: ProjectConfigurationFile<IRushProjectServeJson>;

  public constructor() {
    this._loader = new ProjectConfigurationFile<IRushProjectServeJson>({
      projectRelativeFilePath: 'config/rush-project-serve.json',
      jsonSchemaObject: rushProjectServeSchema,
      propertyInheritance: {
        routing: {
          inheritanceType: InheritanceType.append
        }
      }
    });
  }

  public async loadProjectConfigsAsync(
    projects: Iterable<RushConfigurationProject>,
    terminal: ITerminal,
    workspaceRoutingRules: Iterable<IRoutingRule>
  ): Promise<IRoutingRule[]> {
    const rules: IRoutingRule[] = Array.from(workspaceRoutingRules);

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
            const { projectRelativeFile, projectRelativeFolder } = rule;
            const diskPath: string = projectRelativeFolder ?? projectRelativeFile;
            rules.push({
              type: projectRelativeFile ? 'file' : 'folder',
              diskPath: path.resolve(project.projectFolder, diskPath),
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
