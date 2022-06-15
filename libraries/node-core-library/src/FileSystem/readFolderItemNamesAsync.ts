// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { resolve } from 'path';
import { readdir } from 'fs-extra';

import type { IFileSystemReadFolderOptions } from './interfaces';
import { wrapExceptionAsync } from './wrapExceptionAsync';

/**
 * An async version of {@link FileSystem.readFolderItemNames}.
 */
export async function readFolderItemNamesAsync(
  folderPath: string,
  options?: IFileSystemReadFolderOptions
): Promise<string[]> {
  return await wrapExceptionAsync(async () => {
    const absolutePaths: boolean = options?.absolutePaths ?? false;

    const fileNames: string[] = await readdir(folderPath);
    if (absolutePaths) {
      return fileNames.map((fileName) => resolve(folderPath, fileName));
    } else {
      return fileNames;
    }
  });
}
