// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { unlinkSync } from 'fs-extra';

import type { IFileSystemDeleteFileOptions } from './interfaces';
import { isNotExistError } from './isNotExistError';
import { wrapException } from './wrapException';

/**
 * Deletes a file. Can optionally throw if the file doesn't exist.
 * Behind the scenes it uses `fs.unlinkSync()`.
 * @param filePath - The absolute or relative path to the file that should be deleted.
 * @param options - Optional settings that can change the behavior. Type: `IDeleteFileOptions`
 */
export function deleteFile(filePath: string, options?: IFileSystemDeleteFileOptions): void {
  wrapException(() => {
    const throwIfNotExists: boolean = options?.throwIfNotExists ?? false;

    try {
      unlinkSync(filePath);
    } catch (error) {
      if (throwIfNotExists || !isNotExistError(error as Error)) {
        throw error;
      }
    }
  });
}
