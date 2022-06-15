// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { dirname } from 'path';

import { AlreadyExistsBehavior } from './AlreadyExistsBehavior';
import { deleteFile } from './deleteFile';
import { ensureFolder } from './ensureFolder';
import { exists } from './exists';
import type { _IInternalFileSystemCreateLinkOptions } from './interfaces';
import { isExistError } from './isExistError';
import { isNotExistError } from './isNotExistError';

export function handleLink(linkFn: () => void, options: _IInternalFileSystemCreateLinkOptions): void {
  try {
    linkFn();
  } catch (error) {
    if (isExistError(error as Error)) {
      // Link exists, handle it
      switch (options.alreadyExistsBehavior) {
        case AlreadyExistsBehavior.Ignore:
          break;
        case AlreadyExistsBehavior.Overwrite:
          // fsx.linkSync does not allow overwriting so we must manually delete. If it's
          // a folder, it will throw an error.
          deleteFile(options.newLinkPath);
          linkFn();
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
        (!options.linkTargetMustExist || exists(options.linkTargetPath))
      ) {
        ensureFolder(dirname(options.newLinkPath));
        linkFn();
      } else {
        throw error;
      }
    }
  }
}
