// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { removeSync } from 'fs-extra';

import { wrapException } from './wrapException';

/**
 * Deletes a folder, including all of its contents.
 * Behind the scenes is uses `fs-extra.removeSync()`.
 * @remarks
 * Does not throw if the folderPath does not exist.
 * @param folderPath - The absolute or relative path to the folder which should be deleted.
 */
export function deleteFolder(folderPath: string): void {
  wrapException(() => {
    removeSync(folderPath);
  });
}
