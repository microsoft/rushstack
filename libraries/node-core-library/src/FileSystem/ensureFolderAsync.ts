// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ensureDir } from 'fs-extra';
import { wrapExceptionAsync } from './wrapExceptionAsync';

/**
 * An async version of {@link FileSystem.ensureFolder}.
 */
export async function ensureFolderAsync(folderPath: string): Promise<void> {
  await wrapExceptionAsync(() => {
    return ensureDir(folderPath);
  });
}
