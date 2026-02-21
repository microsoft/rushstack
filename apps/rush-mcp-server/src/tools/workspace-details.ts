// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfiguration, RushConfigurationProject } from '@rushstack/rush-sdk';
import type { IRushConfigurationJson } from '@rushstack/rush-sdk/lib/api/RushConfiguration';

import { getRushConfiguration } from '../utilities/common.ts';
import { BaseTool, type CallToolResult } from './base.tool';

export class RushWorkspaceDetailsTool extends BaseTool {
  public constructor() {
    super({
      name: 'rush_workspace_details',
      description:
        'Retrieves a comprehensive overview of the Rush monorepo project graph in an LLM-friendly format. Use it to answer questions about the current Rush workspace and architecture.',
      schema: {}
    });
  }

  public async executeAsync(): Promise<CallToolResult> {
    const rushConfiguration: RushConfiguration = await getRushConfiguration();
    const projects: RushConfigurationProject[] = rushConfiguration.projects;

    return {
      content: [
        {
          type: 'text',
          text: this._getWorkspaceDetailsPrompt(rushConfiguration, projects)
        }
      ]
    };
  }

  private _getWorkspaceDetailsPrompt(
    rushConfiguration: RushConfiguration,
    projects: RushConfigurationProject[]
  ): string {
    return `
The following is a comprehensive representation of the Rush monorepo workspace. The information is organized into two sections:

1. WORKSPACE LEVEL: Contains global configuration information about the Rush workspace itself.
2. PROJECT LEVEL: Lists all projects in the monorepo with their detailed information.

WORKSPACE LEVEL information includes Rush version, pnpm version, and overall project count.

PROJECT LEVEL information is separated by <project_name></project_name> tags. Each project contains:
- its direct workspace dependencies package names, marked by "deps: [...]"
- its package name, marked by "packageName: [...]"
- its project type/category, marked by "projectType: [...]"
- its source file location, marked by "projectFolder: [...]"
- its scripts/commands, marked by "scripts: [...]"
- its version, marked by "version: [...]"
- additional metadata if available

This data is very important. Use it to analyze the workspace and understand the project graph. The user cannot see this data, so don't reference it directly. It is read-only information to help you understand the workspace.

${this._getRobotReadableWorkspaceDetails(rushConfiguration.rushConfigurationJson, projects)}
`.trim();
  }

  private _getRobotReadableWorkspaceDetails(
    rushConfiguration: IRushConfigurationJson,
    projects: RushConfigurationProject[]
  ): string {
    let serializedWorkspace: string = '';

    // Add workspace-level information with clearer section marking
    serializedWorkspace += `======== WORKSPACE LEVEL INFORMATION ========\n`;
    serializedWorkspace += `<RUSH_WORKSPACE>\n`;
    serializedWorkspace += `  rushVersion: [${rushConfiguration.rushVersion}]\n`;
    serializedWorkspace += `  pnpmVersion: [${rushConfiguration.pnpmVersion}]\n`;
    serializedWorkspace += `  projectCount: [${projects.length}]\n`;
    serializedWorkspace += `</RUSH_WORKSPACE>\n\n`;
    serializedWorkspace += `======== PROJECT LEVEL INFORMATION ========\n`;

    projects.forEach((project) => {
      serializedWorkspace += `<${project.packageName}>\n`;

      serializedWorkspace += `  packageName: [${project.packageName}]\n`;
      serializedWorkspace += `  version: [${project.packageJson.version}]\n`;
      serializedWorkspace += `  projectFolder: [${project.projectFolder}]\n`;
      serializedWorkspace += `  subspaceName: [${project.subspace.subspaceName}]\n`;

      const projectType: string = project.shouldPublish ? 'publishable' : 'local';
      serializedWorkspace += `  projectType: [${projectType}]\n`;

      const dependencies: ReadonlySet<RushConfigurationProject> = project.dependencyProjects;
      const depNames: string[] = Array.from(dependencies, (dep) => dep.packageName);

      if (depNames.length === 0) {
        serializedWorkspace += `  deps: []\n`;
      } else if (depNames.length <= 5) {
        serializedWorkspace += `  deps: [${depNames.join(', ')}]\n`;
      } else {
        serializedWorkspace += `  deps: [\n    ${depNames.join(',\n    ')}\n  ]\n`;
      }

      if (project.packageJson.scripts) {
        const scripts: string[] = Object.keys(project.packageJson.scripts);
        if (scripts.length === 0) {
          serializedWorkspace += `  scripts: []\n`;
        } else if (scripts.length <= 5) {
          serializedWorkspace += `  scripts: [${scripts.join(', ')}]\n`;
        } else {
          serializedWorkspace += `  scripts: [\n    ${scripts.join(',\n    ')}\n  ]\n`;
        }
      } else {
        serializedWorkspace += `  scripts: []\n`;
      }

      if (project.versionPolicyName) {
        serializedWorkspace += `  versionPolicy: [${project.versionPolicyName}]\n`;
      }

      if (project.reviewCategory) {
        serializedWorkspace += `  reviewCategory: [${project.reviewCategory}]\n`;
      }

      serializedWorkspace += `</${project.packageName}>\n\n`;
    });

    return serializedWorkspace;
  }
}
