// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { symlink } from 'fs-extra';

import { handleLinkAsync } from './handleLinkAsync';
import type { IFileSystemCreateLinkOptions } from './interfaces';
import { wrapExceptionAsync } from './wrapExceptionAsync';

/**
 * An async version of {@link FileSystem.createSymbolicLinkFolder}.
 */
export async function createSymbolicLinkFolderAsync(options: IFileSystemCreateLinkOptions): Promise<void> {
  await wrapExceptionAsync(() => {
    return handleLinkAsync(() => {
      return symlink(options.linkTargetPath, options.newLinkPath, 'dir');
    }, options);
  });
}
