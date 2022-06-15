// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { isErrnoException } from './isErrnoException';
import { isExistError } from './isExistError';
import { isFileDoesNotExistError } from './isFileDoesNotExistError';
import { isFolderDoesNotExistError } from './isFolderDoesNotExistError';
import { isUnlinkNotPermittedError } from './isUnlinkNotPermittedError';

export function updateErrorMessage(error: Error): void {
  if (isErrnoException(error)) {
    if (isFileDoesNotExistError(error)) {
      // eslint-disable-line @typescript-eslint/no-use-before-define
      error.message = `File does not exist: ${error.path}\n${error.message}`;
    } else if (isFolderDoesNotExistError(error)) {
      // eslint-disable-line @typescript-eslint/no-use-before-define
      error.message = `Folder does not exist: ${error.path}\n${error.message}`;
    } else if (isExistError(error)) {
      // Oddly, the typing does not include the `dest` property even though the documentation
      // indicates it is there: https://nodejs.org/docs/latest-v10.x/api/errors.html#errors_error_dest
      const extendedError: NodeJS.ErrnoException & { dest?: string } = error;
      // eslint-disable-line @typescript-eslint/no-use-before-define
      error.message = `File or folder already exists: ${extendedError.dest}\n${error.message}`;
    } else if (isUnlinkNotPermittedError(error)) {
      // eslint-disable-line @typescript-eslint/no-use-before-define
      error.message = `File or folder could not be deleted: ${error.path}\n${error.message}`;
    }
  }
}
