// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { copySync } from 'fs-extra';

import { AlreadyExistsBehavior } from './AlreadyExistsBehavior';
import type { IFileSystemCopyFilesOptions } from './interfaces';
import { wrapException } from './wrapException';

/**
 * Copies a file or folder from one location to another, recursively copying any folder contents.
 * By default, destinationPath is overwritten if it already exists.
 *
 * @remarks
 * If you only intend to copy a single file, it is recommended to use {@link FileSystem.copyFile}
 * instead to more clearly communicate the intended operation.
 *
 * The implementation is based on `copySync()` from the `fs-extra` package.
 */
export function copyFiles(options: IFileSystemCopyFilesOptions): void {
  wrapException(() => {
    const {
      alreadyExistsBehavior = AlreadyExistsBehavior.Overwrite,
      sourcePath,
      destinationPath,
      dereferenceSymlinks = false,
      preserveTimestamps = false,
      filter
    } = options;

    copySync(sourcePath, destinationPath, {
      dereference: dereferenceSymlinks,
      errorOnExist: alreadyExistsBehavior === AlreadyExistsBehavior.Error,
      overwrite: alreadyExistsBehavior === AlreadyExistsBehavior.Overwrite,
      preserveTimestamps: preserveTimestamps,
      filter
    });
  });
}
