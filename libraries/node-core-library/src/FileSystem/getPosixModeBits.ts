// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PosixModeBits } from '../PosixModeBits';
import { getStatistics } from './getStatistics';
import { wrapException } from './wrapException';

/**
 * Retrieves the permissions (i.e. file mode bits) for a filesystem object.
 * Behind the scenes it uses `fs.chmodSync()`.
 * @param path - The absolute or relative path to the object that should be updated.
 *
 * @remarks
 * This calls {@link FileSystem.getStatistics} to get the POSIX mode bits.
 * If statistics in addition to the mode bits are needed, it is more efficient
 * to call {@link FileSystem.getStatistics} directly instead.
 */
export function getPosixModeBits(path: string): PosixModeBits {
  return wrapException(() => {
    return getStatistics(path).mode;
  });
}
