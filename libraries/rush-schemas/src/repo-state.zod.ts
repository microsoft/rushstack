// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { z } from 'zod';

import { withSchemaMeta } from '@rushstack/heft-zod-schema-plugin/lib/SchemaMetaHelpers';

/**
 * The zod schema describing the structure of `repo-state.json`.
 *
 * @beta
 */
// eslint-disable-next-line @typescript-eslint/typedef
export const repoStateSchema = withSchemaMeta(
  z
    .object({
      $schema: z
        .string()
        .describe(
          'Part of the JSON Schema standard, this optional keyword declares the URL of the schema that the file conforms to. ' +
            'Editors may download the schema and use it to perform syntax highlighting.'
        )
        .optional(),
      pnpmShrinkwrapHash: z
        .string()
        .describe(
          'A hash of the contents of the PNPM shrinkwrap file for the repository. ' +
            'This hash is used to determine whether or not the shrinkwrap has been modified prior to install.'
        )
        .optional(),
      preferredVersionsHash: z
        .string()
        .describe(
          'A hash of "preferred versions" for the repository. ' +
            'This hash is used to determine whether or not preferred versions have been modified prior to install.'
        )
        .optional(),
      packageJsonInjectedDependenciesHash: z
        .string()
        .describe(
          'A hash of the injected dependencies in related package.json. ' +
            'This hash is used to determine whether or not the shrinkwrap needs to updated prior to install.'
        )
        .optional(),
      pnpmCatalogsHash: z
        .string()
        .describe(
          'A hash of the PNPM catalog definitions for the repository. ' +
            'This hash is used to determine whether or not the catalog has been modified prior to install.'
        )
        .optional()
    })
    .strict(),
  {
    $schema: 'http://json-schema.org/draft-04/schema#',
    title: 'Rush repo-state.json file',
    description:
      'For use with the Rush tool, this file tracks the state of various features in the Rush repo. See http://rushjs.io for details.',
    releaseTag: '@internal'
  }
);

/**
 * Raw shape of `repo-state.json`. This file is internal state managed by Rush
 * and is not part of the public API surface, so the `z.infer` form is used
 * directly as the source of truth.
 *
 * @internal
 */
export type IRepoStateJson = Omit<z.infer<typeof repoStateSchema>, '$schema'>;

export default repoStateSchema;
