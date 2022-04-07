// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { symlinkSync } from 'fs-extra';

import { handleLink } from './handleLink';
import type { IFileSystemCreateLinkOptions } from './interfaces';
import { wrapException } from './wrapException';

/**
 * Creates a symbolic link to a file.  On Windows operating systems, this may require administrator elevation.
 * Behind the scenes it uses `fs.symlinkSync()`.
 *
 * @remarks
 * To avoid administrator elevation on Windows, use {@link FileSystem.createHardLink} instead.
 *
 * On Windows operating systems, the NTFS file system distinguishes file symlinks versus directory symlinks:
 * If the target is not the correct type, the symlink will be created successfully, but will fail to resolve.
 * Other operating systems do not make this distinction, in which case {@link FileSystem.createSymbolicLinkFile}
 * and {@link FileSystem.createSymbolicLinkFolder} can be used interchangeably, but doing so will make your
 * tool incompatible with Windows.
 */
export function createSymbolicLinkFile(options: IFileSystemCreateLinkOptions): void {
  wrapException(() => {
    return handleLink(() => {
      return symlinkSync(options.linkTargetPath, options.newLinkPath, 'file');
    }, options);
  });
}
