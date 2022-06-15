// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { dirname } from 'path';
import { moveSync } from 'fs-extra';

import type { IFileSystemMoveOptions } from './interfaces';
import { isNotExistError } from './isNotExistError';
import { ensureFolder } from './ensureFolder';
import { wrapException } from './wrapException';

/**
 * Moves a file. The folder must exist, unless the `ensureFolderExists` option is provided.
 * Behind the scenes it uses `fs-extra.moveSync()`
 */
export function move(options: IFileSystemMoveOptions): void {
  wrapException(() => {
    const { overwrite = true, ensureFolderExists = true, sourcePath, destinationPath } = options;

    try {
      moveSync(sourcePath, destinationPath, { overwrite });
    } catch (error) {
      if (ensureFolderExists) {
        if (!isNotExistError(error as Error)) {
          throw error;
        }

        const folderPath: string = dirname(destinationPath);
        ensureFolder(folderPath);
        moveSync(sourcePath, destinationPath, { overwrite });
      } else {
        throw error;
      }
    }
  });
}
