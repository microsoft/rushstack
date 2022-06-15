// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { emptyDir } from 'fs-extra';

import { wrapExceptionAsync } from './wrapExceptionAsync';

/**
 * An async version of {@link FileSystem.ensureEmptyFolder}.
 */
export async function ensureEmptyFolderAsync(folderPath: string): Promise<void> {
  await wrapExceptionAsync(() => {
    return emptyDir(folderPath);
  });
}
