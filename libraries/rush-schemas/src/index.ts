// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * JSON Schema validators for Rush configuration files, authored as zod schemas.
 *
 * @remarks
 * Each schema module exports a default zod validator and the corresponding
 * TypeScript shape. The build also emits a `<name>.schema.json` JSON Schema
 * file alongside the compiled JavaScript module, accessible via the package's
 * `./lib/<name>.schema.json` exports map entry.
 *
 * @packageDocumentation
 */

export {
  experimentsSchema,
  type IExperimentsJson,
  default as defaultExperimentsSchema
} from './experiments.zod';

export { cobuildSchema, type ICobuildJson, default as defaultCobuildSchema } from './cobuild.zod';

export { repoStateSchema, default as defaultRepoStateSchema } from './repo-state.zod';

export { buildCacheSchema, default as defaultBuildCacheSchema } from './build-cache.zod';
