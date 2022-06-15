// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { lstatSync } from 'fs-extra';

import type { FileSystemStats } from './interfaces';
import { wrapException } from './wrapException';

/**
 * Gets the statistics of a filesystem object. Does NOT follow the link to its target.
 * Behind the scenes it uses `fs.lstatSync()`.
 * @param path - The absolute or relative path to the filesystem object.
 */
export function getLinkStatistics(path: string): FileSystemStats {
  return wrapException(() => {
    return lstatSync(path);
  });
}
