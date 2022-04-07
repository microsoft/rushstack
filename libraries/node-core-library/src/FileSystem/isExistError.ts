// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { isErrnoException } from './isErrnoException';

/**
 * Returns true if the error object indicates the file or folder already exists (`EEXIST`).
 */
export function isExistError(error: Error): boolean {
  return isErrnoException(error) && error.code === 'EEXIST';
}
