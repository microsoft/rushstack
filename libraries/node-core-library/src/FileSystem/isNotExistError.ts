// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { isFileDoesNotExistError } from './isFileDoesNotExistError';
import { isFolderDoesNotExistError } from './isFolderDoesNotExistError';

/**
 * Returns true if the error object indicates the file or folder does not exist (`ENOENT` or `ENOTDIR`)
 */
export function isNotExistError(error: Error): boolean {
  return isFileDoesNotExistError(error) || isFolderDoesNotExistError(error);
}
