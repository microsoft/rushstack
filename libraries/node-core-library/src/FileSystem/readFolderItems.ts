// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { resolve } from 'path';
import { readdirSync } from 'fs-extra';

import type { FolderItem, IFileSystemReadFolderOptions } from './interfaces';
import { wrapException } from './wrapException';

/**
 * Reads the contents of the folder, not including "." or "..", returning objects including the
 * entry names and types.
 * Behind the scenes it uses `fs.readdirSync()`.
 * @param folderPath - The absolute or relative path to the folder which should be read.
 * @param options - Optional settings that can change the behavior. Type: `IReadFolderOptions`
 */
export function readFolderItems(folderPath: string, options?: IFileSystemReadFolderOptions): FolderItem[] {
  return wrapException(() => {
    const absolutePaths: boolean = options?.absolutePaths ?? false;

    const folderEntries: FolderItem[] = readdirSync(folderPath, { withFileTypes: true });
    if (absolutePaths) {
      return folderEntries.map((folderEntry) => {
        folderEntry.name = resolve(folderPath, folderEntry.name);
        return folderEntry;
      });
    } else {
      return folderEntries;
    }
  });
}
