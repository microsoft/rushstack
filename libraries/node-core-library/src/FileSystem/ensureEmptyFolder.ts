// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { emptyDirSync } from 'fs-extra';

import { wrapException } from './wrapException';

/**
 * Deletes the content of a folder, but not the folder itself. Also ensures the folder exists.
 * Behind the scenes it uses `fs-extra.emptyDirSync()`.
 * @remarks
 * This is a workaround for a common race condition, where the virus scanner holds a lock on the folder
 * for a brief period after it was deleted, causing EBUSY errors for any code that tries to recreate the folder.
 * @param folderPath - The absolute or relative path to the folder which should have its contents deleted.
 */
export function ensureEmptyFolder(folderPath: string): void {
  wrapException(() => {
    emptyDirSync(folderPath);
  });
}
