// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { existsSync } from 'fs-extra';
import { wrapException } from './wrapException';

/**
 * Returns true if the path exists on disk.
 * Behind the scenes it uses `fs.existsSync()`.
 * @remarks
 * There is a debate about the fact that after `fs.existsSync()` returns true,
 * the file might be deleted before fs.readSync() is called, which would imply that everybody
 * should catch a `readSync()` exception, and nobody should ever use `fs.existsSync()`.
 * We find this to be unpersuasive, since "unexceptional exceptions" really hinder the
 * break-on-exception debugging experience. Also, throwing/catching is generally slow.
 * @param path - The absolute or relative path to the filesystem object.
 */
export function exists(path: string): boolean {
  return wrapException(() => {
    return existsSync(path);
  });
}
