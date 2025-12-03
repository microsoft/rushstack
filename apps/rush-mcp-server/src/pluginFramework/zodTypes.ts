// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as zod from 'zod';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types';

export type { zod as zodModule };
export { CallToolResultSchema };

/**
 * @public
 */
export type CallToolResult = zod.infer<typeof CallToolResultSchema>;
