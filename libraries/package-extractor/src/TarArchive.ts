// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { pipeline } from 'node:stream/promises';

import * as tar from 'tar';

import { FileSystem, type FileSystemWriteStream, Path } from '@rushstack/node-core-library';

/**
 * An in-memory tar archive member.
 * @beta
 */
export interface ITarArchiveEntry {
  archivePath: string;
  data: Buffer | string;
  permissions: number;
  isSymbolicLink: boolean;
}

/**
 * Options for JavaScript tar archive creation.
 * @beta
 */
export interface ITarArchiveOptions {
  archivePath: string;
  gzip?: boolean;
  abortSignal?: AbortSignal;
}

/**
 * Options for archiving files from disk.
 * @beta
 */
export interface ITarArchiveFromPathsOptions extends ITarArchiveOptions {
  baseFolderPath: string;
  paths: string[];
}

/**
 * JavaScript tar creation shared by deployment and build caching.
 * @beta
 */
export class TarArchive {
  public static async createFromPathsAsync(options: ITarArchiveFromPathsOptions): Promise<void> {
    const { baseFolderPath, paths, gzip = true } = options;
    options.abortSignal?.throwIfAborted();
    const pack: tar.Pack = tar.create({ cwd: baseFolderPath, gzip, strict: true, noDirRecurse: true }, paths);
    await writeAsync(pack, options);
  }

  public static async createFromEntriesAsync(
    options: ITarArchiveOptions,
    entries: Iterable<ITarArchiveEntry>
  ): Promise<void> {
    const { gzip = true } = options;
    options.abortSignal?.throwIfAborted();
    const pack: tar.Pack = new tar.Pack({ gzip });
    const writePromise: Promise<void> = writeAsync(pack, options);
    for (const { archivePath, data, permissions, isSymbolicLink } of entries) {
      const content: Buffer = isSymbolicLink
        ? Buffer.alloc(0)
        : typeof data === 'string'
          ? Buffer.from(data)
          : data;
      // ReadEntry archives generated assets without staging them on disk.
      const entry: tar.ReadEntry = new tar.ReadEntry(
        new tar.Header({
          path: archivePath,
          mode: permissions,
          type: isSymbolicLink ? 'SymbolicLink' : 'File',
          linkpath: isSymbolicLink ? Path.convertToSlashes(data.toString()) : undefined,
          size: content.length
        })
      );
      pack.add(entry);
      entry.end(content);
    }

    pack.end();
    await writePromise;
  }
}

async function writeAsync(pack: tar.Pack, options: ITarArchiveOptions): Promise<void> {
  const { archivePath, abortSignal } = options;
  const output: FileSystemWriteStream = FileSystem.createWriteStream(archivePath);
  await pipeline(pack, output, { signal: abortSignal });
}
