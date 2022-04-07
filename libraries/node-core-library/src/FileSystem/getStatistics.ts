// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { statSync } from 'fs-extra';
import { FileSystemStats } from './interfaces';
import { wrapException } from './wrapException';

/**
 * Gets the statistics for a particular filesystem object.
 * If the path is a link, this function follows the link and returns statistics about the link target.
 * Behind the scenes it uses `fs.statSync()`.
 * @param path - The absolute or relative path to the filesystem object.
 */
export function getStatistics(path: string): FileSystemStats {
  return wrapException(() => {
    return statSync(path);
  });
}
