// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

const NO_ENTRY: string = 'ENOENT';

/**
 * Deletes the file (never a folder) at `filePath`, if there is one.
 *
 * @remarks
 * Unlike `fs.rmSync`, it does not stat the file first. A plain stat of a socket leaves the socket's type in the
 * stat array that Node 22's cached `fs.realpathSync` reads (nodejs/node#65113), and the next `require()` in the
 * process could then load a package through its symbolic link, where the package's dependencies are not found.
 */
export function unlinkIfPresent(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== NO_ENTRY) throw error;
  }
}
