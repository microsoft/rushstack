// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { lstat } from 'fs-extra';

import type { FileSystemStats } from './interfaces';
import { wrapExceptionAsync } from './wrapExceptionAsync';

/**
 * An async version of {@link FileSystem.getLinkStatistics}.
 */
export async function getLinkStatisticsAsync(path: string): Promise<FileSystemStats> {
  return await wrapExceptionAsync(() => {
    return lstat(path);
  });
}
