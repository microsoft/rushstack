// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { dirname } from 'path';
import { move } from 'fs-extra';

import { ensureFolderAsync } from './ensureFolderAsync';
import type { IFileSystemMoveOptions } from './interfaces';
import { isNotExistError } from './isNotExistError';
import { wrapExceptionAsync } from './wrapExceptionAsync';

/**
 * An async version of {@link FileSystem.move}.
 */
export async function moveAsync(options: IFileSystemMoveOptions): Promise<void> {
  await wrapExceptionAsync(async () => {
    const { overwrite = true, ensureFolderExists = true, sourcePath, destinationPath } = options;

    try {
      await move(sourcePath, destinationPath, { overwrite });
    } catch (error) {
      if (ensureFolderExists) {
        if (!isNotExistError(error as Error)) {
          throw error;
        }

        const folderPath: string = dirname(destinationPath);
        await ensureFolderAsync(folderPath);
        await move(sourcePath, destinationPath, { overwrite });
      } else {
        throw error;
      }
    }
  });
}
