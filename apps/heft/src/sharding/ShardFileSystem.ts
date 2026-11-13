// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs/promises';
import fsSync, { type BigIntStats } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { FileSystem } from '@rushstack/node-core-library';

/**
 * Identifies an atomic publication so cancellation cannot invalidate a replacement file.
 * Callers must retain exclusive destination ownership through their final cancellation check.
 * @public
 */
export interface IShardFilePublication {
  invalidateIfOwned(): void;
}

/**
 * An exclusive live claim that serializes revocation and final promotion.
 * The callback must execute synchronously and cannot release the claim.
 * @public
 */
export interface IShardFilePublicationGuard {
  commit(action: () => void): void;
}

/**
 * Rejects paths outside the build folder and symbolic links/junctions below it.
 * The build folder itself may be a symlinked workspace.
 * @public
 */
export async function validateShardPathAsync(
  buildFolderPath: string,
  targetPath: string,
  abortSignal?: AbortSignal
): Promise<void> {
  const relative: string = path.relative(buildFolderPath, targetPath);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Shard paths must be below the build folder: "${targetPath}".`);
  }
  let current: string = buildFolderPath;
  for (const segment of relative.split(path.sep)) {
    abortSignal?.throwIfAborted();
    current = path.join(current, segment);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) {
        throw new Error(`Shard paths must not traverse a symbolic link: "${current}".`);
      }
    } catch (error) {
      if (!FileSystem.isNotExistError(error as Error)) throw error;
    }
    abortSignal?.throwIfAborted();
  }
}

/**
 * Removes only a known output file, tolerating absence but not other filesystem errors.
 * @public
 */
export async function invalidateShardFileAsync(filename: string): Promise<void> {
  try {
    await fs.unlink(filename);
  } catch (error) {
    if (!FileSystem.isNotExistError(error as Error)) throw error;
  }
}

/**
 * Publishes a complete file by same-directory atomic rename. Callers must invalidate their
 * previous output before starting work, and validate the destination before calling this helper.
 * @public
 */
export async function writeShardFileAtomicallyAsync(
  filename: string,
  contents: string,
  abortSignal?: AbortSignal,
  publicationGuard?: IShardFilePublicationGuard
): Promise<IShardFilePublication> {
  abortSignal?.throwIfAborted();
  const folder: string = path.dirname(filename);
  await fs.mkdir(folder, { recursive: true });
  abortSignal?.throwIfAborted();
  const temporaryPath: string = path.join(folder, `.${path.basename(filename)}.${randomUUID()}.tmp`);
  const handle: fs.FileHandle = await fs.open(temporaryPath, 'wx');
  let published: boolean = false;
  let identity: BigIntStats;
  try {
    try {
      abortSignal?.throwIfAborted();
      identity = await handle.stat({ bigint: true });
      await handle.writeFile(contents);
      await handle.sync();
      abortSignal?.throwIfAborted();
    } finally {
      await handle.close();
    }
    abortSignal?.throwIfAborted();
    const publication: IShardFilePublication = {
      invalidateIfOwned: () => {
        let current: BigIntStats;
        try {
          current = fsSync.lstatSync(filename, { bigint: true });
        } catch (error) {
          if (!FileSystem.isNotExistError(error as Error)) throw error;
          return;
        }
        if (
          current.isFile() &&
          current.ino === identity.ino &&
          // Windows lstat reports dev=0; fstat reports the volume serial number.
          (process.platform === 'win32' || current.dev === identity.dev)
        ) {
          fsSync.unlinkSync(filename);
        }
      }
    };
    if (publicationGuard) {
      // No await between the ownership check and rename: revocation/release in this process
      // cannot interleave, and other processes cannot acquire the exclusively held claim.
      publicationGuard.commit(() => {
        abortSignal?.throwIfAborted();
        fsSync.renameSync(temporaryPath, filename);
        published = true;
      });
    } else {
      await fs.rename(temporaryPath, filename);
      published = true;
    }
    if (abortSignal?.aborted) {
      publication.invalidateIfOwned();
      abortSignal.throwIfAborted();
    }
    return publication;
  } finally {
    // Rename consumes the staging file. No asynchronous cleanup may follow the final
    // cancellation check on the success path.
    if (!published) await FileSystem.deleteFileAsync(temporaryPath);
  }
}
