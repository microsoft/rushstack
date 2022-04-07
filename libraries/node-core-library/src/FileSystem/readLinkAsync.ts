// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { readlink } from 'fs-extra';

import { wrapExceptionAsync } from './wrapExceptionAsync';

/**
 * An async version of {@link FileSystem.getLinkStatistics}.
 */
export async function readLinkAsync(path: string): Promise<string> {
  return await wrapExceptionAsync(() => {
    return readlink(path);
  });
}
