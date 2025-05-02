// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as zod from 'zod';

import type { CallToolResult } from './zodTypes';

/**
 * MCP plugins should implement this interface.
 * @public
 */
export interface IRushMcpTool<TSchema extends zod.ZodTypeAny = zod.ZodTypeAny> {
  readonly schema: TSchema;
  executeAsync(input: zod.infer<TSchema>): Promise<CallToolResult>;
}
