// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import { FileSystem, JsonFile, JsonSchema } from '@rushstack/node-core-library';

import schema from '../schemas/shard-result-manifest.schema.json';
import type { IShardResultManifest } from './IShardResultManifest';
import {
  invalidateShardFileAsync,
  writeShardFileAtomicallyAsync,
  type IShardFilePublication,
  type IShardFilePublicationGuard
} from './ShardFileSystem';

/**
 * The name of the file each shard writes into its output directory to report what it did.
 *
 * @public
 */
export const SHARD_MANIFEST_FILENAME: 'shard-manifest.json' = 'shard-manifest.json';

const MANIFEST_SCHEMA: JsonSchema = JsonSchema.fromLoadedObject(schema);

/**
 * Validates an already-parsed manifest without reading files.
 * @public
 */
export function validateShardResultManifest(
  value: unknown,
  filename: string = 'Shard result manifest'
): IShardResultManifest {
  MANIFEST_SCHEMA.validateObject(value, filename);
  return value as IShardResultManifest;
}

/**
 * Returns the path of the manifest file within the specified shard output folder.
 *
 * @public
 */
export function getShardManifestPath(shardFolderPath: string): string {
  return path.join(shardFolderPath, SHARD_MANIFEST_FILENAME);
}

/**
 * Invalidates only this shard's commit marker before starting a new attempt.
 * A crash or configuration error must not leave an earlier success visible.
 *
 * @public
 */
export async function invalidateShardResultManifestAsync(shardFolderPath: string): Promise<void> {
  await invalidateShardFileAsync(getShardManifestPath(shardFolderPath));
}

/**
 * Writes a shard's manifest into its output folder.
 *
 * @remarks
 * A shard must call this on every path where it exits successfully, including when its workload
 * reported failures. The collator cannot distinguish a shard that ran and left nothing behind
 * from a shard that never ran at all.
 *
 * @public
 */
export async function writeShardResultManifestAsync(
  shardFolderPath: string,
  manifest: IShardResultManifest,
  abortSignal?: AbortSignal,
  publicationGuard?: IShardFilePublicationGuard
): Promise<void> {
  abortSignal?.throwIfAborted();
  const manifestPath: string = getShardManifestPath(shardFolderPath);
  const serialized: string = JSON.stringify(manifest);
  validateShardResultManifest(JSON.parse(serialized), manifestPath);
  // The manifest is a commit marker: publish it only after every payload/report is complete.
  const publication: IShardFilePublication = await writeShardFileAtomicallyAsync(
    manifestPath,
    serialized,
    abortSignal,
    publicationGuard
  );
  if (abortSignal?.aborted) {
    publication.invalidateIfOwned();
    abortSignal.throwIfAborted();
  }
}

/**
 * Reads and validates the manifest in the specified shard output folder.
 *
 * @remarks
 * Throws if the manifest is absent, unparseable, or does not satisfy the manifest schema.
 *
 * @public
 */
export async function readShardResultManifestAsync(shardFolderPath: string): Promise<IShardResultManifest> {
  const manifestPath: string = getShardManifestPath(shardFolderPath);
  return (await JsonFile.loadAndValidateAsync(manifestPath, MANIFEST_SCHEMA)) as IShardResultManifest;
}

/**
 * Reads and validates the manifest in the specified shard output folder, returning `undefined`
 * if no manifest is present.
 *
 * @remarks
 * Only absence produces `undefined`. A manifest that exists but is unparseable or invalid still
 * throws, because a corrupt result must never be quietly downgraded to a missing one -- the
 * collator reacts to those two cases differently.
 *
 * @public
 */
export async function tryReadShardResultManifestAsync(
  shardFolderPath: string
): Promise<IShardResultManifest | undefined> {
  try {
    return await readShardResultManifestAsync(shardFolderPath);
  } catch (error) {
    if (FileSystem.isNotExistError(error as Error)) {
      return undefined;
    }

    throw error;
  }
}
