// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { dirname } from 'path';

import { AlreadyExistsBehavior } from './AlreadyExistsBehavior';
import { deleteFileAsync } from './deleteFileAsync';
import { ensureFolderAsync } from './ensureFolderAsync';
import { existsAsync } from './existsAsync';
import type { _IInternalFileSystemCreateLinkOptions } from './interfaces';
import { isExistError } from './isExistError';
import { isNotExistError } from './isNotExistError';

export async function handleLinkAsync(
  linkFn: () => Promise<void>,
  options: _IInternalFileSystemCreateLinkOptions
): Promise<void> {
  try {
    await linkFn();
  } catch (error) {
    if (isExistError(error as Error)) {
      // Link exists, handle it
      switch (options.alreadyExistsBehavior) {
        case AlreadyExistsBehavior.Ignore:
          break;
        case AlreadyExistsBehavior.Overwrite:
          // fsx.linkSync does not allow overwriting so we must manually delete. If it's
          // a folder, it will throw an error.
          await deleteFileAsync(options.newLinkPath);
          await linkFn();
          break;
        case AlreadyExistsBehavior.Error:
        default:
          throw error;
      }
    } else {
      // When attempting to create a link in a directory that does not exist, an ENOENT
      // or ENOTDIR error is thrown, so we should ensure the directory exists before
      // retrying. There are also cases where the target file must exist, so validate in
      // those cases to avoid confusing the missing directory with the missing target file.
      if (
        isNotExistError(error as Error) &&
        (!options.linkTargetMustExist || (await existsAsync(options.linkTargetPath)))
      ) {
        await ensureFolderAsync(dirname(options.newLinkPath));
        await linkFn();
      } else {
        throw error;
      }
    }
  }
}
