// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * For example, retrieves `d` from `/a/b/c/d`.
 */
export function getBaseNameOf(importerPath: string): string {
  if (importerPath.length === 0) {
    return '';
  }

  const index: number = importerPath.lastIndexOf('/');
  if (index === importerPath.length - 1) {
    throw new Error('Error: Path has a trailing slash');
  }
  if (index >= 0) {
    return importerPath.substring(index + 1);
  }
  return importerPath;
}

/**
 * For example, retrieves `/a/b/c` from `/a/b/c/d`.
 */
export function getParentOf(importerPath: string): string {
  if (importerPath === '' || importerPath === '.' || importerPath === '/') {
    throw new Error('Error: Path has no parent');
  }

  const index: number = importerPath.lastIndexOf('/');
  if (index === importerPath.length - 1) {
    throw new Error('Error: Path has a trailing slash');
  }
  if (index === 0) {
    return '/';
  }
  if (index < 0) {
    return '.';
  }
  return importerPath.substring(0, index);
}

/**
 * Cheaply resolves a relative path against a base path, assuming the paths are delimited by `/`,
 * and assuming the basePath is already in normal form.  An error occurs if the relative path
 * goes above the root folder.
 *
 * @example
 * ```ts
 * getAbsolutePath(`a/b/c`,  `d/e`)         === `a/b/c/d/e`
 * getAbsolutePath(`/a/b/c`, `d/e`)         === `/a/b/c/d/e`
 * getAbsolutePath(`/a/b/c`, `/d/e`)        === `/d/e`
 * getAbsolutePath(`a/b/c`,  `../../f`)     === `a/f`
 * getAbsolutePath(`a/b/c`,  `.././/f`)     === `a/b/f`
 * getAbsolutePath(`a/b/c`,  `../../..`)    === `.`
 * getAbsolutePath(`C:/a/b`, `../d`)        === `C:/a/d`
 * getAbsolutePath(`a/b/c`,  `../../../..`) === ERROR
 *
 * // Degenerate cases:
 * getAbsolutePath(`a/b/c/`, `d/`)          === `a/b/c/d`   // trailing slashes are discarded
 * getAbsolutePath(`./../c`, `d`)           === `./../c/d`  // basePath assumed to be normal form
 * getAbsolutePath(`C:\\`,   `\\a`)         === `C:\\/\\a`  // backslashes not supported
 * ```
 */
export function getAbsolute(basePath: string, relativePath: string): string {
  let leadingSlash: boolean;
  let stack: string[];

  // Discard intermediary slashes
  const relativeParts: string[] = relativePath.split('/').filter((part: string) => part.length > 0);
  if (relativePath.startsWith('/')) {
    stack = [];
    leadingSlash = true;
  } else {
    // Discard intermediary slashes
    stack = basePath.split('/').filter((part: string) => part.length > 0);
    leadingSlash = basePath.startsWith('/');
  }

  for (const part of relativeParts) {
    if (part === '.') {
      // current directory, do nothing
      continue;
    } else if (part === '..') {
      if (stack.length === 0) {
        throw new Error('getAbsolutePath(): relativePath goes above the root folder');
      }
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  if (leadingSlash) {
    return '/' + stack.join('/');
  } else {
    return stack.length === 0 ? '.' : stack.join('/');
  }
}

/**
 * Returns the two parts joined by exactly one `/`, assuming the parts are already
 * in normalized form.  The `/` is not added if either part is an empty string.
 */
export function join(leftPart: string, rightPart: string): string {
  if (leftPart.length === 0) {
    return rightPart;
  }
  if (rightPart.length === 0) {
    return leftPart;
  }

  const leftEndsWithSlash: boolean = leftPart[leftPart.length - 1] === '/';
  const rightStartsWithSlash: boolean = rightPart[0] === '/';

  if (leftEndsWithSlash && rightStartsWithSlash) {
    return leftPart + rightPart.substring(1);
  }
  if (leftEndsWithSlash || rightStartsWithSlash) {
    return leftPart + rightPart;
  }
  return leftPart + '/' + rightPart;
}
