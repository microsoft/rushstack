// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { z } from 'zod';

import { withSchemaMeta } from '../../SchemaMetaHelpers';

const publicSchema = withSchemaMeta(
  z.object({
    value: z.string().describe('A value.').optional()
  }),
  {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'Public Config',
    releaseTag: '@public'
  }
);

export type IPublicConfig = z.infer<typeof publicSchema>;

export default publicSchema;
