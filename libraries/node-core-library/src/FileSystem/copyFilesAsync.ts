// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { copy } from 'fs-extra';

import { AlreadyExistsBehavior } from './AlreadyExistsBehavior';
import type { IFileSystemCopyFilesOptions } from './interfaces';
import { wrapExceptionAsync } from './wrapExceptionAsync';

/**
 * An async version of {@link FileSystem.copyFiles}.
 */
export async function copyFilesAsync(options: IFileSystemCopyFilesOptions): Promise<void> {
  await wrapExceptionAsync(async () => {
    const {
      alreadyExistsBehavior = AlreadyExistsBehavior.Overwrite,
      sourcePath,
      destinationPath,
      dereferenceSymlinks = false,
      preserveTimestamps = false,
      filter
    } = options;

    await copy(sourcePath, destinationPath, {
      dereference: dereferenceSymlinks,
      errorOnExist: alreadyExistsBehavior === AlreadyExistsBehavior.Error,
      overwrite: alreadyExistsBehavior === AlreadyExistsBehavior.Overwrite,
      preserveTimestamps: preserveTimestamps,
      filter
    });
  });
}
