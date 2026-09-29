// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash, type Hash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** The declared output folders of one operation. */
export interface IOutputFolderSet {
  /** The absolute path of the project folder that the folder names are relative to. */
  readonly projectFolder: string;
  readonly folderNames: ReadonlyArray<string>;
}

/** The content digest of one {@link IOutputFolderSet}. */
export interface IOutputFolderDigest {
  /**
   * Undefined if the folders could not be read (for example, because an entry was deleted during the walk).
   * An undefined digest never matches.
   */
  readonly digest: string | undefined;
  /** The number of entries that were read, which callers use to start the largest walks first. */
  readonly entryCount: number;
}

interface IWalkState {
  readonly hash: Hash;
  entryCount: number;
}

/**
 * Digests every entry below the given output folders: the sorted relative path of each nested entry, and the
 * size, modification time and identity of each entry that is not a folder.
 *
 * @remarks
 * Folder modification times are left out, because the sorted listing already captures added and removed
 * entries. Symbolic links are recorded, not followed.
 */
export function digestOutputFolders({ projectFolder, folderNames }: IOutputFolderSet): IOutputFolderDigest {
  const state: IWalkState = { hash: createHash('sha1'), entryCount: 0 };
  try {
    for (const folderName of folderNames) {
      const folderPath: string = path.resolve(projectFolder, folderName);
      const stats: fs.Stats | undefined = fs.statSync(folderPath, { throwIfNoEntry: false });
      if (!stats) {
        state.hash.update(`${folderName}\0missing\n`);
      } else if (stats.isDirectory()) {
        state.hash.update(`${folderName}\0folder\0${stats.ino}\n`);
        addFolderEntries(state, folderPath, `${folderName}/`);
      } else {
        state.hash.update(`${folderName}\0${describeEntry(stats)}\n`);
      }
    }
  } catch {
    return { digest: undefined, entryCount: state.entryCount };
  }
  return { digest: state.hash.digest('hex'), entryCount: state.entryCount };
}

function addFolderEntries(state: IWalkState, folderPath: string, relativePrefix: string): void {
  const entries: fs.Dirent[] = fs.readdirSync(folderPath, { withFileTypes: true });
  entries.sort((left: fs.Dirent, right: fs.Dirent) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0
  );
  state.entryCount += entries.length;
  for (const entry of entries) {
    const entryPath: string = path.join(folderPath, entry.name);
    const relativePath: string = `${relativePrefix}${entry.name}`;
    if (entry.isDirectory()) {
      state.hash.update(`${relativePath}\0folder\n`);
      addFolderEntries(state, entryPath, `${relativePath}/`);
    } else {
      state.hash.update(`${relativePath}\0${describeEntry(fs.lstatSync(entryPath))}\n`);
    }
  }
}

function describeEntry(stats: fs.Stats): string {
  return `${stats.isSymbolicLink() ? 'link' : 'file'}\0${stats.size}\0${stats.mtimeMs}\0${stats.ino}`;
}
