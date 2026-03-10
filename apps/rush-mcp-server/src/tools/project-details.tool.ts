// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { z } from 'zod';

import type { RushConfiguration, RushConfigurationProject } from '@rushstack/rush-sdk';

import { getRushConfiguration } from '../utilities/common.ts';
import { BaseTool, type CallToolResult } from './base.tool';

export class RushProjectDetailsTool extends BaseTool {
  public constructor() {
    super({
      name: 'rush_project_details',
      description: 'Returns the complete project details in JSON format for a given rush project.',
      schema: {
        projectName: z.string().describe('The name of the project to get details for')
      }
    });
  }

  public async executeAsync({ projectName }: { projectName: string }): Promise<CallToolResult> {
    const rushConfiguration: RushConfiguration = await getRushConfiguration();
    const project: RushConfigurationProject | undefined = rushConfiguration.getProjectByName(projectName);

    if (!project) {
      throw new Error(`Project ${projectName} not found`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              packageJson: project.packageJson,
              /**
               * Example: `C:\MyRepo\libraries\my-project`
               */
              projectFolder: project.projectFolder,
              /**
               * Example: `libraries/my-project`
               */
              projectRelativeFolder: project.projectRelativeFolder,
              /**
               * Example: `C:\MyRepo\libraries\my-project\config\rush`
               */
              projectRushConfigFolder: project.projectRushConfigFolder,
              /**
               * Example: `my-subspace`
               */
              projectSubspaceName: project.subspace.subspaceName
            },
            null,
            2
          )
        }
      ]
    };
  }
}
