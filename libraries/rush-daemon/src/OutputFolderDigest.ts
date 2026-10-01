// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash, type Hash } from 'node:crypto';
import type * as fs from 'node:fs';

import {
  walkOperationOutputFolders,
  type IOperationOutputFolderWalkEntry
} from '@microsoft/rush-lib/lib/logic/operations/OperationOutputManifest';

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
    walkOperationOutputFolders(projectFolder, folderNames, (entry: IOperationOutputFolderWalkEntry): void => {
      if (!entry.isOutputFolder) {
        state.entryCount++;
      }
      switch (entry.kind) {
        case 'missing': {
          state.hash.update(`${entry.relativePath}\0missing\n`);
          break;
        }
        case 'folder': {
          const identity: string = entry.isOutputFolder ? `\0${entry.stats!.ino}` : '';
          state.hash.update(`${entry.relativePath}\0folder${identity}\n`);
          break;
        }
        case 'replaced': {
          state.hash.update(`${entry.relativePath}\0replaced\n`);
          break;
        }
        case 'file': {
          state.hash.update(`${entry.relativePath}\0${describeEntry(entry.stats)}\n`);
          break;
        }
      }
    });
  } catch {
    return { digest: undefined, entryCount: state.entryCount };
  }
  return { digest: state.hash.digest('hex'), entryCount: state.entryCount };
}

function describeEntry(stats: fs.Stats | undefined): string {
  return stats
    ? `${stats.isSymbolicLink() ? 'link' : 'file'}\0${stats.size}\0${stats.mtimeMs}\0${stats.ino}`
    : 'deleted';
}
