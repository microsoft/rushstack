// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { symlinkSync } from 'fs-extra';

import { handleLink } from './handleLink';
import type { IFileSystemCreateLinkOptions } from './interfaces';
import { wrapException } from './wrapException';

/**
 * Creates an NTFS "directory junction" on Windows operating systems; for other operating systems, it
 * creates a regular symbolic link.  The link target must be a folder, not a file.
 * Behind the scenes it uses `fs.symlinkSync()`.
 *
 * @remarks
 * For security reasons, Windows operating systems by default require administrator elevation to create
 * symbolic links.  As a result, on Windows it's generally recommended for Node.js tools to use hard links
 * (for files) or NTFS directory junctions (for folders), since regular users are allowed to create them.
 * Hard links and junctions are less vulnerable to symlink attacks because they cannot reference a network share,
 * and their target must exist at the time of link creation.  Non-Windows operating systems generally don't
 * restrict symlink creation, and as such are more vulnerable to symlink attacks.  Note that Windows can be
 * configured to permit regular users to create symlinks, for example by enabling Windows 10 "developer mode."
 *
 * A directory junction requires the link source and target to both be located on local disk volumes;
 * if not, use a symbolic link instead.
 */
export function createSymbolicLinkJunction(options: IFileSystemCreateLinkOptions): void {
  wrapException(() => {
    return handleLink(() => {
      // For directories, we use a Windows "junction".  On POSIX operating systems, this produces a regular symlink.
      return symlinkSync(options.linkTargetPath, options.newLinkPath, 'junction');
    }, options);
  });
}
