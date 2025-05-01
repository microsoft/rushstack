// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol';
import type {
  CallToolResultSchema,
  ServerNotification,
  ServerRequest
} from '@modelcontextprotocol/sdk/types';
import type { z, ZodRawShape, ZodTypeAny } from 'zod';

export type CallToolResult = z.infer<typeof CallToolResultSchema>;

type ToolCallback<Args extends undefined | ZodRawShape = undefined> = Args extends ZodRawShape
  ? (
      args: z.objectOutputType<Args, ZodTypeAny>,
      extra: RequestHandlerExtra<ServerRequest, ServerNotification>
    ) => CallToolResult | Promise<CallToolResult>
  : (
      extra: RequestHandlerExtra<ServerRequest, ServerNotification>
    ) => CallToolResult | Promise<CallToolResult>;

export interface IBaseToolOptions<Args extends ZodRawShape = ZodRawShape> {
  name: string;
  description: string;
  schema: Args;
}

export abstract class BaseTool<Args extends ZodRawShape = ZodRawShape> {
  private _options: IBaseToolOptions<Args>;

  protected constructor(options: IBaseToolOptions<Args>) {
    this._options = options;
  }

  protected abstract executeAsync(...args: Parameters<ToolCallback<Args>>): ReturnType<ToolCallback<Args>>;

  public register(server: McpServer): void {
    // TODO: remove ts-ignore
    // @ts-ignore
    server.tool(this._options.name, this._options.description, this._options.schema, async (...args) => {
      try {
        const result: CallToolResult = await this.executeAsync(...(args as Parameters<ToolCallback<Args>>));
        return result;
      } catch (error: unknown) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: error instanceof Error ? error.message : error
            }
          ]
        };
      }
    });
  }
}
