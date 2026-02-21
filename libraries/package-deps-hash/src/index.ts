// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This package builds a JSON object containing the git hashes of all files used to produce a given NPM package.
 * The {@link https://rushjs.io/ | Rush} tool uses this library to implement incremental build detection.
 *
 * @remarks
 *
 * For more info, please see the package {@link https://www.npmjs.com/package/@rushstack/package-deps-hash
 * | README}.
 *
 * @packageDocumentation
 */

export { getPackageDeps, getGitHashForFiles } from './getPackageDeps.ts';
export {
  type IFileDiffStatus,
  type IDetailedRepoState,
  getDetailedRepoStateAsync,
  getRepoChanges,
  getRepoRoot,
  getRepoStateAsync,
  ensureGitMinimumVersion,
  hashFilesAsync
} from './getRepoState.ts';
