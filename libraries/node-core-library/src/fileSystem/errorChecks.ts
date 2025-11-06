// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Returns true if the error object indicates the file or folder already exists (`EEXIST`).
 * @public
 */
export function isExistError(error: Error): boolean {
  return isErrnoException(error) && error.code === 'EEXIST';
}

/**
 * Returns true if the error object indicates the file or folder does not exist (`ENOENT` or `ENOTDIR`)
 * @public
 */
export function isNotExistError(error: Error): boolean {
  return isFileDoesNotExistError(error) || isFolderDoesNotExistError(error);
}

/**
 * Returns true if the error object indicates the file does not exist (`ENOENT`).
 * @public
 */
export function isFileDoesNotExistError(error: Error): boolean {
  return isErrnoException(error) && error.code === 'ENOENT';
}

/**
 * Returns true if the error object indicates the folder does not exist (`ENOTDIR`).
 * @public
 */
export function isFolderDoesNotExistError(error: Error): boolean {
  return isErrnoException(error) && error.code === 'ENOTDIR';
}

/**
 * Returns true if the error object indicates the target is a directory (`EISDIR`).
 * @public
 */
export function isDirectoryError(error: Error): boolean {
  return isErrnoException(error) && error.code === 'EISDIR';
}

/**
 * Returns true if the error object indicates the target is not a directory (`ENOTDIR`).
 * @public
 */
export function isNotDirectoryError(error: Error): boolean {
  return isErrnoException(error) && error.code === 'ENOTDIR';
}

/**
 * Returns true if the error object indicates that the `unlink` system call failed
 * due to a permissions issue (`EPERM`).
 * @public
 */
export function isUnlinkNotPermittedError(error: Error): boolean {
  return isErrnoException(error) && error.code === 'EPERM' && error.syscall === 'unlink';
}

/**
 * Detects if the provided error object is a `NodeJS.ErrnoException`
 * @public
 */
export function isErrnoException(error: Error): error is NodeJS.ErrnoException {
  const typedError: NodeJS.ErrnoException = error;
  // Don't check for `path` because the syscall may not have a path.
  // For example, when invoked with a file descriptor.
  return (
    typeof typedError.code === 'string' &&
    typeof typedError.errno === 'number' &&
    typeof typedError.syscall === 'string'
  );
}
