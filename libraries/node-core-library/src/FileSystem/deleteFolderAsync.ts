// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { remove } from 'fs-extra';

import { wrapExceptionAsync } from './wrapExceptionAsync';

/**
 * An async version of {@link FileSystem.deleteFolder}.
 */
export async function deleteFolderAsync(folderPath: string): Promise<void> {
  await wrapExceptionAsync(() => {
    return remove(folderPath);
  });
}
