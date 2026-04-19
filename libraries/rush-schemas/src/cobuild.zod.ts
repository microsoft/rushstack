// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { z } from 'zod';

import { withSchemaMeta } from '@rushstack/heft-zod-schema-plugin/lib/SchemaMetaHelpers';

/**
 * The zod schema describing the structure of `cobuild.json`. Use this to
 * validate raw config input.
 *
 * @beta
 */
// eslint-disable-next-line @typescript-eslint/typedef
export const cobuildSchema = withSchemaMeta(
  z
    .object({
      $schema: z
        .string()
        .describe(
          'Part of the JSON Schema standard, this optional keyword declares the URL of the schema that the file conforms to. ' +
            'Editors may download the schema and use it to perform syntax highlighting.'
        )
        .optional(),
      cobuildFeatureEnabled: z.boolean().describe('Set this to true to enable the cobuild feature.'),
      cobuildLockProvider: z.string().describe('Specify the cobuild lock provider to use')
    })
    .strict(),
  {
    $schema: 'http://json-schema.org/draft-04/schema#',
    title: "Configuration for Rush's cobuild.",
    description:
      "For use with the Rush tool, this file provides configuration options for cobuild feature. See http://rushjs.io for details.",
    releaseTag: '@beta'
  }
);

/**
 * Raw shape of `cobuild.json`, excluding the optional top-level `$schema`
 * pointer. The shape is derived from {@link cobuildSchema} via `z.infer` to
 * keep the schema and the type from drifting.
 *
 * @remarks
 * For tiny `@beta` interfaces like this, the `z.infer` form is the source of
 * truth and the published `.d.ts` will reference zod's type computation. For
 * marquee public interfaces such as {@link IExperimentsJson}, prefer the
 * hand-authored interface + drift-check pattern instead so that per-property
 * TSDoc is preserved.
 *
 * @beta
 */
export type ICobuildJson = Omit<z.infer<typeof cobuildSchema>, '$schema'>;

export default cobuildSchema;
