// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { utimesSync } from 'fs-extra';
import { IFileSystemUpdateTimeParameters } from './interfaces';
import { wrapException } from './wrapException';

/**
 * Updates the accessed and modified timestamps of the filesystem object referenced by path.
 * Behind the scenes it uses `fs.utimesSync()`.
 * The caller should specify both times in the `times` parameter.
 * @param path - The path of the file that should be modified.
 * @param times - The times that the object should be updated to reflect.
 */
export function updateTimes(path: string, times: IFileSystemUpdateTimeParameters): void {
  return wrapException(() => {
    utimesSync(path, times.accessedTime, times.modifiedTime);
  });
}
