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
  #rushWorkspacePath: string;
  #tools: BaseTool[] = [];
  #pluginLoader: RushMcpPluginLoader;

  public constructor(rushWorkspacePath: string) {
    super({
      name: 'rush',
      version: '1.0.0'
    });

    this.#rushWorkspacePath = rushWorkspacePath;
    this.#pluginLoader = new RushMcpPluginLoader(this.#rushWorkspacePath, this);
  }

  public async startAsync(): Promise<void> {
    this._initializeTools();
    this._registerTools();

    await this.#pluginLoader.loadAsync();
  }

  private _initializeTools(): void {
    this.#tools.push(new RushConflictResolverTool());
    this.#tools.push(new RushMigrateProjectTool(this.#rushWorkspacePath));
    this.#tools.push(new RushCommandValidatorTool());
    this.#tools.push(new RushWorkspaceDetailsTool());
    this.#tools.push(new RushProjectDetailsTool());
  }

  private _registerTools(): void {
    process.chdir(this.#rushWorkspacePath);

    for (const tool of this.#tools) {
      tool.register(this);
    }
  }
}
