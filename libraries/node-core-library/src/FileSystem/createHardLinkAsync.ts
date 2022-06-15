// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { link } from 'fs-extra';

import { handleLinkAsync } from './handleLinkAsync';
import type { IFileSystemCreateLinkOptions } from './interfaces';
import { wrapExceptionAsync } from './wrapExceptionAsync';

/**
 * An async version of {@link FileSystem.createHardLink}.
 */
export async function createHardLinkAsync(options: IFileSystemCreateLinkOptions): Promise<void> {
  await wrapExceptionAsync(() => {
    return handleLinkAsync(
      () => {
        return link(options.linkTargetPath, options.newLinkPath);
      },
      { ...options, linkTargetMustExist: true }
    );
  });
}
