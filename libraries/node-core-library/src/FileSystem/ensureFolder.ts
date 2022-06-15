// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ensureDirSync } from 'fs-extra';
import { wrapException } from './wrapException';

/**
 * Recursively creates a folder at a given path.
 * Behind the scenes is uses `fs-extra.ensureDirSync()`.
 * @remarks
 * Throws an exception if anything in the folderPath is not a folder.
 * @param folderPath - The absolute or relative path of the folder which should be created.
 */
export function ensureFolder(folderPath: string): void {
  wrapException(() => {
    ensureDirSync(folderPath);
  });
}
