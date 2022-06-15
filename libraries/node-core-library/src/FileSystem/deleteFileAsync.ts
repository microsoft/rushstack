// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { unlink } from 'fs-extra';

import type { IFileSystemDeleteFileOptions } from './interfaces';
import { isNotExistError } from './isNotExistError';
import { wrapExceptionAsync } from './wrapExceptionAsync';

/**
 * An async version of {@link FileSystem.deleteFile}.
 */
export async function deleteFileAsync(
  filePath: string,
  options?: IFileSystemDeleteFileOptions
): Promise<void> {
  await wrapExceptionAsync(async () => {
    const throwIfNotExists: boolean = options?.throwIfNotExists ?? false;

    try {
      await unlink(filePath);
    } catch (error) {
      if (throwIfNotExists || !isNotExistError(error as Error)) {
        throw error;
      }
    }
  });
}
