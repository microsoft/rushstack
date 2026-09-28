// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash, type Hash } from 'node:crypto';
import type * as fs from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import * as path from 'node:path';

/**
 * The files in an operation's declared output folders.
 */
export interface IOperationOutputManifest {
  /**
   * Covers the path of every file and folder in the output folders, and the identity, modification time and status
   * change time of every folder. It changes if an output is added, deleted or renamed, if a file is replaced by a
   * rename (as atomic writes do), or if a folder is recreated. It does not change if a file is rewritten in place.
   */
  readonly signature: string;
  /**
   * Project-relative paths, with `/` separators, of the files and symbolic links in the output folders.
   */
  readonly files: ReadonlySet<string>;
  /**
   * If defined, the incremental command must never be used for this operation, and this says why.
   */
  readonly cleanOnlyReason: string | undefined;
}

const MAX_CONCURRENT_READS: number = 8;

// A content or chunk hash in a JavaScript or CSS file name, e.g. `chunk.main_1a2b3c4d.js` or `0dd8cf755e5195a5.js`.
// The hash must contain a digit, so that words such as `facade` are not mistaken for one.
const HASHED_BUNDLE_FILE_REGEXP: RegExp =
  /(?:^|[._-])([0-9a-f]{8,})(?:\.min)?\.(?:js|mjs|cjs|css)(?:\.map|\.LICENSE\.txt)?$/i;
const BUNDLE_FILE_REGEXP: RegExp = /\.(?:js|mjs|cjs|css)$/i;
const BUNDLE_FOLDER_REGEXP: RegExp = /^(?:dist|release)(?:[-_.][^/]*)?(?:\/|$)/i;
// A path with a long hexadecimal run names a cache entry by the hash of its content, e.g. Jest's transform cache
// `temp/test/jest/jest-transform-cache-<hash>-<hash>/7f/index_<hash>`. A run adds such entries without changing
// what it builds.
const CONTENT_ADDRESSED_PATH_REGEXP: RegExp = /[0-9a-f]{16,}/i;

/**
 * Lists the files in the output folders of an operation.
 *
 * @param projectFolder - The absolute path of the project folder
 * @param outputFolderNames - The project-relative output folders of the operation
 */
export async function readOperationOutputManifestAsync(
  projectFolder: string,
  outputFolderNames: ReadonlyArray<string>
): Promise<IOperationOutputManifest> {
  const entries: string[] = [];
  const files: Set<string> = new Set();
  const limitAsync: <T>(fn: () => Promise<T>) => Promise<T> = createConcurrencyLimiter(MAX_CONCURRENT_READS);

  const readFolderAsync = async (relativeFolder: string, stats: fs.Stats): Promise<void> => {
    entries.push(`${relativeFolder}/ ${stats.ino} ${stats.mtimeMs} ${stats.ctimeMs}`);
    const children: fs.Dirent[] = await limitAsync(() =>
      tryReaddirAsync(path.resolve(projectFolder, relativeFolder))
    );
    const subfolderPromises: Promise<void>[] = [];
    for (const child of children) {
      const relativePath: string = `${relativeFolder}/${child.name}`;
      if (child.isDirectory()) {
        subfolderPromises.push(
          limitAsync(() => tryLstatAsync(path.resolve(projectFolder, relativePath))).then(
            async (childStats: fs.Stats | undefined) => {
              if (childStats?.isDirectory()) {
                await readFolderAsync(relativePath, childStats);
              } else {
                // It was deleted or replaced after its parent was read.
                entries.push(`${relativePath}/ replaced`);
              }
            }
          )
        );
      } else {
        entries.push(relativePath);
        files.add(relativePath);
      }
    }
    await Promise.all(subfolderPromises);
  };

  await Promise.all(
    outputFolderNames.map(async (folderName: string) => {
      const relativePath: string = folderName.replace(/\\/g, '/').replace(/\/+$/, '');
      const stats: fs.Stats | undefined = await limitAsync(() =>
        tryLstatAsync(path.resolve(projectFolder, relativePath))
      );
      if (!stats) {
        entries.push(`missing ${relativePath}`);
      } else if (stats.isDirectory()) {
        await readFolderAsync(relativePath, stats);
      } else {
        entries.push(`${relativePath} ${stats.ino} ${stats.mtimeMs} ${stats.ctimeMs} ${stats.size}`);
        files.add(relativePath);
      }
    })
  );

  entries.sort();
  const hash: Hash = createHash('sha1');
  for (const entry of entries) {
    hash.update(entry);
    hash.update('\n');
  }

  return {
    signature: hash.digest('hex'),
    files,
    cleanOnlyReason: getCleanOnlyReason(files)
  };
}

/**
 * Returns why an operation with these output files must always run its initial command, if it must.
 *
 * @remarks
 * The incremental command does not delete outputs that a run no longer produces. Bundlers name chunks after
 * their content or their place in the module graph, so an edit can replace a chunk with a differently named one
 * and leave the old one behind, which a full build would not produce.
 */
export function getCleanOnlyReason(files: Iterable<string>): string | undefined {
  let bundleFile: string | undefined;
  for (const file of files) {
    const baseName: string = file.slice(file.lastIndexOf('/') + 1);
    const match: RegExpExecArray | null = HASHED_BUNDLE_FILE_REGEXP.exec(baseName);
    if (match && /\d/.test(match[1])) {
      return `its outputs include the content-hashed file "${file}"`;
    }
    if (bundleFile === undefined && BUNDLE_FILE_REGEXP.test(baseName) && BUNDLE_FOLDER_REGEXP.test(file)) {
      bundleFile = file;
    }
  }
  return bundleFile === undefined ? undefined : `its outputs include the bundle "${bundleFile}"`;
}

/**
 * Describes how two sets of output files differ, e.g. `2 added ("lib/a.js", ...), 1 removed ("lib/b.js")`.
 * Files whose paths contain a content hash, such as cache entries, are ignored.
 */
export function describeOutputFileChanges(
  before: ReadonlySet<string>,
  after: ReadonlySet<string>
): string | undefined {
  const added: string[] = [];
  const removed: string[] = [];
  for (const file of after) {
    if (!before.has(file) && !CONTENT_ADDRESSED_PATH_REGEXP.test(file)) {
      added.push(file);
    }
  }
  for (const file of before) {
    if (!after.has(file) && !CONTENT_ADDRESSED_PATH_REGEXP.test(file)) {
      removed.push(file);
    }
  }
  if (added.length === 0 && removed.length === 0) {
    return undefined;
  }
  const describe = (files: string[], verb: string): string =>
    `${files.length} ${verb} (${files
      .sort()
      .slice(0, 3)
      .map((file: string) => JSON.stringify(file))
      .join(', ')}${files.length > 3 ? ', ...' : ''})`;
  return [added.length ? describe(added, 'added') : '', removed.length ? describe(removed, 'removed') : '']
    .filter(Boolean)
    .join(', ');
}

function createConcurrencyLimiter(maxConcurrency: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let active: number = 0;
  const waiting: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active < maxConcurrency) {
      active++;
    } else {
      // The slot of a finishing call is handed over directly, so `active` is not incremented here.
      await new Promise<void>((resolve: () => void) => waiting.push(resolve));
    }
    try {
      return await fn();
    } finally {
      const next: (() => void) | undefined = waiting.shift();
      if (next) {
        next();
      } else {
        active--;
      }
    }
  };
}

async function tryLstatAsync(filePath: string): Promise<fs.Stats | undefined> {
  try {
    return await lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function tryReaddirAsync(folderPath: string): Promise<fs.Dirent[]> {
  try {
    return await readdir(folderPath, { withFileTypes: true });
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    // The folder was deleted or replaced by a file after its parent was read; the signature still changes.
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return [];
    }
    throw error;
  }
}
