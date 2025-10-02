// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { z } from 'zod';
import { FileSystem, JsonFile } from '@rushstack/node-core-library';

import { BaseTool, type CallToolResult } from './base.tool';
import { getRushConfiguration } from '../utilities/common';
import path from 'node:path';
import type { ISubspacesConfigurationJson } from '@rushstack/rush-sdk/lib/api/SubspacesConfiguration';
import type { RushConfiguration, RushConfigurationProject } from '@rushstack/rush-sdk';
import type { IRushConfigurationProjectJson } from '@rushstack/rush-sdk/lib/api/RushConfigurationProject';
import type { IRushConfigurationJson } from '@rushstack/rush-sdk/lib/api/RushConfiguration';

export class RushMigrateProjectTool extends BaseTool {
  private _rushWorkspacePath: string;

  public constructor(rushWorkspacePath: string) {
    super({
      name: 'rush_migrate_project',
      description: 'Migrate a project to a different location or subspace within the Rush monorepo.',
      schema: {
        projectName: z.string().describe('The name of the project to be migrated'),
        targetProjectPath: z.string().optional().describe('The target path to migrate the project to'),
        targetSubspaceName: z.string().optional().describe('The target subspace to migrate the project to')
      }
    });

    this._rushWorkspacePath = rushWorkspacePath;
  }

  private async _modifyAndSaveSubspaceJsonFileAsync(
    rushConfiguration: RushConfiguration,
    cb: (subspaceNames: string[]) => Promise<string[]> | string[]
  ): Promise<void> {
    const subspacesFolderPath: string = path.resolve(
      rushConfiguration.commonRushConfigFolder,
      'subspaces.json'
    );
    const subspacesConfiguration: ISubspacesConfigurationJson = await JsonFile.loadAsync(subspacesFolderPath);
    const newSubspaceNames: string[] = await cb(subspacesConfiguration.subspaceNames);
    subspacesConfiguration.subspaceNames = newSubspaceNames;
    await JsonFile.saveAsync(subspacesConfiguration, subspacesFolderPath, {
      updateExistingFile: true
    });
  }

  private async _modifyAndSaveRushConfigurationAsync(
    rushConfiguration: RushConfiguration,
    cb: (
      projects: IRushConfigurationProjectJson[]
    ) => Promise<IRushConfigurationProjectJson[]> | IRushConfigurationProjectJson[]
  ): Promise<void> {
    const rushConfigurationJson: IRushConfigurationJson = rushConfiguration.rushConfigurationJson;
    const rushConfigurationFile: string = rushConfiguration.rushJsonFile;
    const newRushConfigurationProjectJson: IRushConfigurationProjectJson[] = await cb(
      rushConfigurationJson.projects
    );
    rushConfigurationJson.projects = newRushConfigurationProjectJson;
    await JsonFile.saveAsync(rushConfigurationJson, rushConfigurationFile, { updateExistingFile: true });
  }

  public async executeAsync({
    projectName,
    targetSubspaceName,
    targetProjectPath
  }: {
    projectName: string;
    targetProjectPath: string;
    targetSubspaceName: string;
  }): Promise<CallToolResult> {
    const rushConfiguration: RushConfiguration = await getRushConfiguration();
    const project: RushConfigurationProject | undefined = rushConfiguration.getProjectByName(projectName);

    if (!project) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Project "${projectName}" not found` }]
      };
    }

    const rootPath: string = this._rushWorkspacePath;
    const sourceProjectSubspaceName: string = project.subspace.subspaceName;
    const sourceProjectPath: string = project.projectFolder;
    const destinationPath: string = path.resolve(rootPath, targetProjectPath);
    const subspacehasOnlyOneProject: boolean = project.subspace.getProjects().length === 1;

    // 1. Remove source subspace folder
    if (subspacehasOnlyOneProject) {
      const subspaceConfigFolderPath: string = project.subspace.getSubspaceConfigFolderPath();
      await FileSystem.deleteFolderAsync(subspaceConfigFolderPath);
    }

    // 2. Move project to target subspace
    await FileSystem.moveAsync({
      sourcePath: sourceProjectPath,
      destinationPath
    });

    // 3. Update rush configuration
    await this._modifyAndSaveRushConfigurationAsync(rushConfiguration, (projects) => {
      const projectIndex: number = projects.findIndex(({ packageName }) => packageName === projectName);
      projects[projectIndex] = {
        ...projects[projectIndex],
        subspaceName: targetSubspaceName,
        projectFolder: path.relative(rootPath, destinationPath)
      };
      return projects;
    });

    // 4. Update `subspaces.json`
    await this._modifyAndSaveSubspaceJsonFileAsync(rushConfiguration, (subspaceNames) => {
      if (subspacehasOnlyOneProject) {
        subspaceNames.splice(subspaceNames.indexOf(sourceProjectSubspaceName), 1);
      }
      if (!subspaceNames.includes(targetSubspaceName)) {
        subspaceNames.push(targetSubspaceName);
      }
      return subspaceNames;
    });

    return {
      content: [
        {
          type: 'text',
          text:
            `Project "${projectName}" migrated to subspace "${targetSubspaceName}" successfully. ` +
            `You can ask whether the user wants to run "rush update --subspace ${targetSubspaceName}" to update the project. ` +
            `If the user says "yes", you can run "rush update --subspace ${targetSubspaceName}" directly for them.`
        }
      ]
    };
  }
}
