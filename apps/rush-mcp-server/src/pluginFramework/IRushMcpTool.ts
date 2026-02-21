// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as zod from 'zod';

import type { CallToolResult } from './zodTypes.ts';

/**
 * MCP plugins should implement this interface.
 * @public
 */
export interface IRushMcpTool<
  TSchema extends zod.ZodObject<zod.ZodRawShape> = zod.ZodObject<zod.ZodRawShape>
> {
  readonly schema: TSchema;
  executeAsync(input: zod.infer<TSchema>): Promise<CallToolResult>;
}
