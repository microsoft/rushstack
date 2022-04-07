// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { resolve } from 'path';
import { readdir } from 'fs-extra';

import type { FolderItem, IFileSystemReadFolderOptions } from './interfaces';
import { wrapExceptionAsync } from './wrapExceptionAsync';
import { LegacyAdapters } from '../LegacyAdapters';

/**
 * An async version of {@link FileSystem.readFolderItems}.
 */
export async function readFolderItemsAsync(
  folderPath: string,
  options?: IFileSystemReadFolderOptions
): Promise<FolderItem[]> {
  return await wrapExceptionAsync(async () => {
    const absolutePaths: boolean = options?.absolutePaths ?? false;

    const folderEntries: FolderItem[] = await LegacyAdapters.convertCallbackToPromise(readdir, folderPath, {
      withFileTypes: true
    });
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
