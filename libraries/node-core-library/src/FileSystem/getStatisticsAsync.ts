// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { stat } from 'fs-extra';
import { FileSystemStats } from './interfaces';
import { wrapExceptionAsync } from './wrapExceptionAsync';

/**
 * An async version of {@link FileSystem.getStatistics}.
 */
export async function getStatisticsAsync(path: string): Promise<FileSystemStats> {
  return await wrapExceptionAsync(() => {
    return stat(path);
  });
}
