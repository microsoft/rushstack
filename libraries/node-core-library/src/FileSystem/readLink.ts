// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { readlinkSync } from 'fs-extra';

import { wrapException } from './wrapException';

/**
 * If `path` refers to a symbolic link, this returns the path of the link target, which may be
 * an absolute or relative path.
 *
 * @remarks
 * If `path` refers to a filesystem object that is not a symbolic link, then an `ErrnoException` is thrown
 * with code 'UNKNOWN'.  If `path` does not exist, then an `ErrnoException` is thrown with code `ENOENT`.
 *
 * @param path - The absolute or relative path to the symbolic link.
 * @returns the path of the link target
 */
export function readLink(path: string): string {
  return wrapException(() => {
    return readlinkSync(path);
  });
}
