// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { chmodSync } from 'fs-extra';
import { PosixModeBits } from '../PosixModeBits';
import { wrapException } from './wrapException';

/**
 * Changes the permissions (i.e. file mode bits) for a filesystem object.
 * Behind the scenes it uses `fs.chmodSync()`.
 * @param path - The absolute or relative path to the object that should be updated.
 * @param modeBits - POSIX-style file mode bits specified using the {@link PosixModeBits} enum
 */
export function changePosixModeBits(path: string, mode: PosixModeBits): void {
  wrapException(() => {
    chmodSync(path, mode);
  });
}
