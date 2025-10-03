// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  type BaseTool,
  RushConflictResolverTool,
  RushMigrateProjectTool,
  RushCommandValidatorTool,
  RushWorkspaceDetailsTool,
  RushProjectDetailsTool
} from './tools';
import { RushMcpPluginLoader } from './pluginFramework/RushMcpPluginLoader';

export class RushMCPServer extends McpServer {
  private _rushWorkspacePath: string;
  private _tools: BaseTool[] = [];
  private _pluginLoader: RushMcpPluginLoader;

  public constructor(rushWorkspacePath: string) {
    super({
      name: 'rush',
      version: '1.0.0'
    });

    this._rushWorkspacePath = rushWorkspacePath;
    this._pluginLoader = new RushMcpPluginLoader(this._rushWorkspacePath, this);
  }

  public async startAsync(): Promise<void> {
    this._initializeTools();
    this._registerTools();

    await this._pluginLoader.loadAsync();
  }

  private _initializeTools(): void {
    this._tools.push(new RushConflictResolverTool());
    this._tools.push(new RushMigrateProjectTool(this._rushWorkspacePath));
    this._tools.push(new RushCommandValidatorTool());
    this._tools.push(new RushWorkspaceDetailsTool());
    this._tools.push(new RushProjectDetailsTool());
  }

  private _registerTools(): void {
    process.chdir(this._rushWorkspacePath);

    for (const tool of this._tools) {
      tool.register(this);
    }
  }
}
