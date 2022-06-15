// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { chmod } from 'fs-extra';
import { PosixModeBits } from '../PosixModeBits';
import { wrapExceptionAsync } from './wrapExceptionAsync';

/**
 * An async version of {@link FileSystem.changePosixModeBits}.
 */
export async function changePosixModeBitsAsync(path: string, mode: PosixModeBits): Promise<void> {
  await wrapExceptionAsync(() => {
    return chmod(path, mode);
  });
}
