// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { isErrnoException } from './isErrnoException';

/**
 * Returns true if the error object indicates the folder does not exist (`ENOTDIR`).
 */
export function isFolderDoesNotExistError(error: Error): boolean {
  return isErrnoException(error) && error.code === 'ENOTDIR';
}
