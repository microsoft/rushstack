// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as zod from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp';

import type { IRushMcpTool } from './IRushMcpTool.ts';
import type { zodModule } from './zodTypes.ts';

/**
 * Each plugin gets its own session.
 *
 * @public
 */
export interface IRegisterToolOptions {
  toolName: string;
  description?: string;
}

/**
 * Each plugin gets its own session.
 *
 * @public
 */
export abstract class RushMcpPluginSession {
  public readonly zod: typeof zodModule = zod;
  public abstract registerTool(options: IRegisterToolOptions, tool: IRushMcpTool): void;
}

export class RushMcpPluginSessionInternal extends RushMcpPluginSession {
  private readonly _mcpServer: McpServer;

  public constructor(mcpServer: McpServer) {
    super();
    this._mcpServer = mcpServer;
  }

  public override registerTool(options: IRegisterToolOptions, tool: IRushMcpTool): void {
    if (options.description) {
      this._mcpServer.tool(
        options.toolName,
        options.description,
        tool.schema.shape,
        tool.executeAsync.bind(tool)
      );
    } else {
      this._mcpServer.tool(options.toolName, tool.schema.shape, tool.executeAsync.bind(tool));
    }
  }
}
