// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { utimes } from 'fs-extra';
import { IFileSystemUpdateTimeParameters } from './interfaces';
import { wrapExceptionAsync } from './wrapExceptionAsync';

/**
 * An async version of {@link FileSystem.updateTimes}.
 */
export async function updateTimesAsync(path: string, times: IFileSystemUpdateTimeParameters): Promise<void> {
  await wrapExceptionAsync(() => {
    // This cast is needed because the fs-extra typings require both parameters
    // to have the same type (number or Date), whereas Node.js does not require that.
    return utimes(path, times.accessedTime as number, times.modifiedTime as number);
  });
}
