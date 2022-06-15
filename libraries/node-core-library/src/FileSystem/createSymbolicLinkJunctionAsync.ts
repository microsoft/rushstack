// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { symlink } from 'fs-extra';

import { handleLinkAsync } from './handleLinkAsync';
import type { IFileSystemCreateLinkOptions } from './interfaces';
import { wrapExceptionAsync } from './wrapExceptionAsync';

/**
 * An async version of {@link FileSystem.createSymbolicLinkJunction}.
 */
export async function createSymbolicLinkJunctionAsync(options: IFileSystemCreateLinkOptions): Promise<void> {
  await wrapExceptionAsync(() => {
    return handleLinkAsync(() => {
      // For directories, we use a Windows "junction".  On POSIX operating systems, this produces a regular symlink.
      return symlink(options.linkTargetPath, options.newLinkPath, 'junction');
    }, options);
  });
}
