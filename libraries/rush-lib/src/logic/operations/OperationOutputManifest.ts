// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash, type Hash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * The files in an operation's declared output folders.
 */
export interface IOperationOutputManifest {
  /**
   * Covers the path of every file and folder in the output folders, the identity, size and modification time of
   * every file, and the identity, modification time and status change time of every folder. It changes if an output
   * is added, deleted, renamed or rewritten, including in place, or if a folder is recreated. It does not change if
   * a hard link to a file is created or removed elsewhere.
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

// A content or chunk hash in a JavaScript or CSS file name, e.g. `chunk.main_1a2b3c4d.js` or `0dd8cf755e5195a5.js`.
// The hash must contain a digit, so that words such as `facade` are not mistaken for one.
const HASHED_BUNDLE_FILE_REGEXP: RegExp =
  /(?:^|[._-])([0-9a-f]{8,})(?:\.min)?\.(?:js|mjs|cjs|css)(?:\.map|\.LICENSE\.txt)?$/i;
const BUNDLE_FILE_REGEXP: RegExp = /\.(?:js|mjs|cjs|css)$/i;
const BUNDLE_FOLDER_REGEXP: RegExp = /^(?:dist|release)(?:[-_.][^/]*)?(?:\/|$)/i;
const CACHE_FOLDER_REGEXP: RegExp = /(?:^|\/)(?:temp|\.cache)(?:\/|$)/i;
// A path with a long hexadecimal run names a cache entry by the hash of its content, e.g. Jest's transform cache
// `temp/test/jest/jest-transform-cache-<hash>-<hash>/7f/index_<hash>`. A run adds such entries without changing
// what it builds.
const CONTENT_ADDRESSED_PATH_REGEXP: RegExp = /[0-9a-f]{16,}/i;

export type OperationOutputFolderEntryKind = 'missing' | 'folder' | 'file' | 'replaced';

export interface IOperationOutputFolderWalkEntry {
  readonly kind: OperationOutputFolderEntryKind;
  readonly relativePath: string;
  readonly stats: fs.Stats | undefined;
  readonly isOutputFolder: boolean;
}

/**
 * Walks the declared output folders of an operation.
 *
 * @remarks
 * A declared output folder that is a symbolic link or Windows junction to a folder is followed. Links that are
 * found inside an output folder are recorded as links and not followed.
 */
export function walkOperationOutputFolders(
  projectFolder: string,
  outputFolderNames: ReadonlyArray<string>,
  onEntry: (entry: IOperationOutputFolderWalkEntry) => void
): number {
  let entryCount: number = 0;

  const readFolder = (relativeFolder: string, stats: fs.Stats, isOutputFolder: boolean): void => {
    onEntry({ kind: 'folder', relativePath: relativeFolder, stats, isOutputFolder });
    const folderPath: string = path.resolve(projectFolder, relativeFolder);
    const children: fs.Dirent[] = tryReaddir(folderPath);
    children.sort((left: fs.Dirent, right: fs.Dirent) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0
    );
    entryCount += children.length;
    for (const child of children) {
      const relativePath: string = `${relativeFolder}/${child.name}`;
      const childPath: string = `${folderPath}${path.sep}${child.name}`;
      const childStats: fs.Stats | undefined = lstatIfExists(childPath);
      if (child.isDirectory()) {
        if (childStats?.isDirectory()) {
          readFolder(relativePath, childStats, false);
        } else {
          onEntry({ kind: 'replaced', relativePath, stats: childStats, isOutputFolder: false });
        }
      } else {
        onEntry({ kind: 'file', relativePath, stats: childStats, isOutputFolder: false });
      }
    }
  };

  for (const folderName of outputFolderNames) {
    const relativePath: string = folderName.replace(/\\/g, '/').replace(/\/+$/, '');
    const stats: fs.Stats | undefined = statIfExists(path.resolve(projectFolder, relativePath));
    if (!stats) {
      onEntry({ kind: 'missing', relativePath, stats: undefined, isOutputFolder: true });
    } else if (stats.isDirectory()) {
      readFolder(relativePath, stats, true);
    } else {
      onEntry({ kind: 'file', relativePath, stats, isOutputFolder: true });
    }
  }

  return entryCount;
}

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

  walkOperationOutputFolders(
    projectFolder,
    outputFolderNames,
    ({ kind, relativePath, stats }: IOperationOutputFolderWalkEntry): void => {
      switch (kind) {
        case 'missing': {
          entries.push(`missing ${relativePath}`);
          break;
        }
        case 'folder': {
          entries.push(`${relativePath}/ ${stats!.ino} ${stats!.mtimeMs} ${stats!.ctimeMs}`);
          break;
        }
        case 'replaced': {
          entries.push(`${relativePath}/ replaced`);
          break;
        }
        case 'file': {
          entries.push(getFileEntry(relativePath, stats));
          files.add(relativePath);
          break;
        }
      }
    }
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
    if (isContentHashedBundleFile(baseName)) {
      return `its outputs include the content-hashed file "${file}"`;
    }
    if (bundleFile === undefined && BUNDLE_FILE_REGEXP.test(baseName) && BUNDLE_FOLDER_REGEXP.test(file)) {
      bundleFile = file;
    }
  }
  return bundleFile === undefined ? undefined : `its outputs include the bundle "${bundleFile}"`;
}

function isContentHashedBundleFile(baseName: string): boolean {
  const match: RegExpExecArray | null = HASHED_BUNDLE_FILE_REGEXP.exec(baseName);
  return !!match && /\d/.test(match[1]);
}

// A chunk or asset that a bundler named after its content, which it renames whenever the content changes.
function isContentHashedOutput(file: string): boolean {
  return (
    isContentHashedBundleFile(file.slice(file.lastIndexOf('/') + 1)) ||
    (CONTENT_ADDRESSED_PATH_REGEXP.test(file) && BUNDLE_FOLDER_REGEXP.test(file))
  );
}

// A content-hashed file that a bundler emits is not a cache entry: a full build would not leave an old one behind.
function isCacheEntry(file: string): boolean {
  return (
    CONTENT_ADDRESSED_PATH_REGEXP.test(file) && CACHE_FOLDER_REGEXP.test(file) && !isContentHashedOutput(file)
  );
}

/**
 * Whether a content-hashed chunk or asset, as bundlers emit, is among the files that were added or removed.
 */
export function hasContentHashedOutputChange(
  before: ReadonlySet<string>,
  after: ReadonlySet<string>
): boolean {
  for (const file of after) {
    if (!before.has(file) && isContentHashedOutput(file)) {
      return true;
    }
  }
  for (const file of before) {
    if (!after.has(file) && isContentHashedOutput(file)) {
      return true;
    }
  }
  return false;
}

/**
 * Describes how two sets of output files differ, e.g. `2 added ("lib/a.js", ...), 1 removed ("lib/b.js")`.
 * Cache entries whose paths contain a content hash are ignored. Content-hashed bundles, and files in a `dist` or
 * `release` folder, are not.
 */
export function describeOutputFileChanges(
  before: ReadonlySet<string>,
  after: ReadonlySet<string>
): string | undefined {
  const added: string[] = [];
  const removed: string[] = [];
  for (const file of after) {
    if (!before.has(file) && !isCacheEntry(file)) {
      added.push(file);
    }
  }
  for (const file of before) {
    if (!after.has(file) && !isCacheEntry(file)) {
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

// The status change time of a file is left out, because it also changes when a hard link to the file is created or
// removed elsewhere, e.g. by a tool that links outputs into another folder.
function getFileEntry(relativePath: string, stats: fs.Stats | undefined): string {
  return stats ? `${relativePath} ${stats.ino} ${stats.size} ${stats.mtimeMs}` : `${relativePath} deleted`;
}

// Synchronous, because every output file is stat'ed and an lstat call takes a few microseconds, far less than a
// round trip through the thread pool.
function statIfExists(filePath: string): fs.Stats | undefined {
  return fs.statSync(filePath, { throwIfNoEntry: false });
}

function lstatIfExists(filePath: string): fs.Stats | undefined {
  return fs.lstatSync(filePath, { throwIfNoEntry: false });
}

function tryReaddir(folderPath: string): fs.Dirent[] {
  try {
    return fs.readdirSync(folderPath, { withFileTypes: true });
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    // The folder was deleted or replaced by a file after its parent was read; the signature still changes.
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return [];
    }
    throw error;
  }
}
