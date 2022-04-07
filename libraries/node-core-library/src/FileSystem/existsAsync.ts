// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { exists } from 'fs-extra';
import { wrapExceptionAsync } from './wrapExceptionAsync';

/**
 * An async version of {@link FileSystem.exists}.
 */
export async function existsAsync(path: string): Promise<boolean> {
  return await wrapExceptionAsync(() => {
    return new Promise<boolean>((resolve: (result: boolean) => void) => {
      exists(path, resolve);
    });
  });
}
