// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { copySync } from 'fs-extra';

import { AlreadyExistsBehavior } from './AlreadyExistsBehavior';
import { getStatistics } from './getStatistics';
import type { IFileSystemCopyFileOptions } from './interfaces';
import { wrapException } from './wrapException';

/**
 * Copies a single file from one location to another.
 * By default, destinationPath is overwritten if it already exists.
 *
 * @remarks
 * The `copyFile()` API cannot be used to copy folders.  It copies at most one file.
 * Use {@link FileSystem.copyFiles} if you need to recursively copy a tree of folders.
 *
 * The implementation is based on `copySync()` from the `fs-extra` package.
 */
export function copyFile(options: IFileSystemCopyFileOptions): void {
  const { alreadyExistsBehavior = AlreadyExistsBehavior.Overwrite, sourcePath, destinationPath } = options;

  if (getStatistics(sourcePath).isDirectory()) {
    throw new Error(
      'The specified path refers to a folder; this operation expects a file object:\n' + sourcePath
    );
  }

  wrapException(() => {
    copySync(sourcePath, destinationPath, {
      errorOnExist: alreadyExistsBehavior === AlreadyExistsBehavior.Error,
      overwrite: alreadyExistsBehavior === AlreadyExistsBehavior.Overwrite
    });
  });
}
