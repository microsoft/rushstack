// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { z } from 'zod';

const basicSchema = z.object({
  name: z.string().describe('The name of the item.'),
  count: z.number().int().describe('The number of items.').optional(),
  enabled: z.boolean().describe('Whether the feature is enabled.').optional()
});

export type IBasicConfig = z.infer<typeof basicSchema>;

export default basicSchema;
