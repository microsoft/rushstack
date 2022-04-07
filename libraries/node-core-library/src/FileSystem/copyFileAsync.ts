// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { copy } from 'fs-extra';

import { AlreadyExistsBehavior } from './AlreadyExistsBehavior';
import { getStatisticsAsync } from './getStatisticsAsync';
import type { IFileSystemCopyFileOptions } from './interfaces';
import { wrapExceptionAsync } from './wrapExceptionAsync';

/**
 * An async version of {@link FileSystem.copyFile}.
 */
export async function copyFileAsync(options: IFileSystemCopyFileOptions): Promise<void> {
  const { alreadyExistsBehavior = AlreadyExistsBehavior.Overwrite, sourcePath, destinationPath } = options;

  if ((await getStatisticsAsync(sourcePath)).isDirectory()) {
    throw new Error(
      'The specified path refers to a folder; this operation expects a file object:\n' + sourcePath
    );
  }

  await wrapExceptionAsync(() => {
    return copy(sourcePath, destinationPath, {
      errorOnExist: alreadyExistsBehavior === AlreadyExistsBehavior.Error,
      overwrite: alreadyExistsBehavior === AlreadyExistsBehavior.Overwrite
    });
  });
}
