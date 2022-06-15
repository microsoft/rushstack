// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { isErrnoException } from './isErrnoException';

/**
 * Returns true if the error object indicates that the `unlink` system call failed
 * due to a permissions issue (`EPERM`).
 */
export function isUnlinkNotPermittedError(error: Error): boolean {
  return isErrnoException(error) && error.code === 'EPERM' && error.syscall === 'unlink';
}
