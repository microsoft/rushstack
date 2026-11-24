// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs/promises';
import fsSync, { type BigIntStats } from 'node:fs';
import path from 'node:path';

import { FileSystem } from '@rushstack/node-core-library';

/**
 * Identifies an atomic publication so cancellation cannot invalidate a replacement file.
 * The orchestrator must keep a single writer for each destination until work and cleanup settle.
 * @public
 */
export interface IShardFilePublication {
  invalidateIfOwned(): void;
}

/**
 * Checks a project-relative configuration path lexically, without resolving or creating it.
 * @public
 */
export function validateShardRelativePath(relativePath: string): void {
  if (
    !relativePath ||
    path.posix.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath) ||
    /^[a-z]:/i.test(relativePath) ||
    /[<>:"|?*{}]/.test(relativePath) ||
    Array.from(relativePath).some((character) => character.charCodeAt(0) < 32)
  ) {
    throw new Error(`Expected a project-relative shard path: "${relativePath}".`);
  }
  let depth: number = 0;
  for (const segment of relativePath.split(/[/\\]/)) {
    if (segment === '..') {
      if (--depth < 0) {
        throw new Error(`Shard paths must not walk outside the project root: "${relativePath}".`);
      }
    } else if (segment && segment !== '.') {
      if (/[. ]$/.test(segment)) {
        throw new Error(`Shard path components must not end in a dot or space: "${relativePath}".`);
      }
      if (
        /^(?:con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3]|conin\$|conout\$)(?: *\.|$)/i.test(
          segment
        )
      ) {
        throw new Error(`Shard paths must not contain reserved Windows device names: "${relativePath}".`);
      }
      depth++;
    }
  }
  if (depth === 0) {
    throw new Error(`Shard paths must be below the project root: "${relativePath}".`);
  }
}

/**
 * Checks normalized absolute I/O paths by prefix. This is lexical containment, not a symlink sandbox.
 * @public
 */
export function validateShardPath(buildFolderPath: string, targetPath: string): void {
  const prefix: string = buildFolderPath.endsWith(path.sep)
    ? buildFolderPath
    : `${buildFolderPath}${path.sep}`;
  if (
    !path.isAbsolute(buildFolderPath) ||
    !path.isAbsolute(targetPath) ||
    path.normalize(buildFolderPath) !== buildFolderPath ||
    path.normalize(targetPath) !== targetPath ||
    targetPath === buildFolderPath ||
    !targetPath.startsWith(prefix)
  ) {
    throw new Error(`Shard paths must be below the build folder: "${targetPath}".`);
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
 * Publishes by same-directory atomic rename using a caller-supplied deterministic staging path.
 * The caller owns both paths, invalidates its old completion marker before work, and schedules
 * only one writer until cancellation and cleanup settle. A retry may overwrite its abandoned staging file.
 * @public
 */
export async function writeShardFileAtomicallyAsync(
  filename: string,
  contents: string,
  stagingFilePath: string,
  abortSignal?: AbortSignal
): Promise<IShardFilePublication> {
  abortSignal?.throwIfAborted();
  const folder: string = path.dirname(filename);
  if (
    path.dirname(stagingFilePath) !== folder ||
    path.normalize(filename) !== filename ||
    path.normalize(stagingFilePath) !== stagingFilePath ||
    filename.toLowerCase() === stagingFilePath.toLowerCase()
  ) {
    throw new Error('Shard publication requires a distinct staging file in the destination directory.');
  }
  await fs.mkdir(folder, { recursive: true });
  abortSignal?.throwIfAborted();
  const handle: fs.FileHandle = await fs.open(stagingFilePath, 'w');
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
    await fs.rename(stagingFilePath, filename);
    published = true;
    if (abortSignal?.aborted) {
      publication.invalidateIfOwned();
      abortSignal.throwIfAborted();
    }
    return publication;
  } finally {
    // Rename consumes the staging file. No asynchronous cleanup may follow the final
    // cancellation check on the success path.
    if (!published) await FileSystem.deleteFileAsync(stagingFilePath);
  }
}
