// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { realpathSync } from 'fs-extra';

import { wrapException } from './wrapException';

/**
 * Follows a link to its destination and returns the absolute path to the final target of the link.
 * Behind the scenes it uses `fs.realpathSync()`.
 * @param linkPath - The path to the link.
 */
export function getRealPath(path: string): string {
  return wrapException(() => {
    return realpathSync(path);
  });
}
