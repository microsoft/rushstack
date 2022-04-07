// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Detects if the provided error object is a `NodeJS.ErrnoException`
 */
export function isErrnoException(error: Error): error is NodeJS.ErrnoException {
  const typedError: NodeJS.ErrnoException = error;
  return (
    typeof typedError.code === 'string' &&
    typeof typedError.errno === 'number' &&
    typeof typedError.path === 'string' &&
    typeof typedError.syscall === 'string'
  );
}
