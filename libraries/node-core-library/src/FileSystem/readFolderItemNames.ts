// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { resolve } from 'path';
import { readdirSync } from 'fs-extra';

import type { IFileSystemReadFolderOptions } from './interfaces';
import { wrapException } from './wrapException';

/**
 * Reads the names of folder entries, not including "." or "..".
 * Behind the scenes it uses `fs.readdirSync()`.
 * @param folderPath - The absolute or relative path to the folder which should be read.
 * @param options - Optional settings that can change the behavior. Type: `IReadFolderOptions`
 */
export function readFolderItemNames(folderPath: string, options?: IFileSystemReadFolderOptions): string[] {
  return wrapException(() => {
    const absolutePaths: boolean = options?.absolutePaths ?? false;

    const fileNames: string[] = readdirSync(folderPath);
    if (absolutePaths) {
      return fileNames.map((fileName) => resolve(folderPath, fileName));
    } else {
      return fileNames;
    }
  });
}
