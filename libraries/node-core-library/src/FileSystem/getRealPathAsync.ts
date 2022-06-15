// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { realpath } from 'fs-extra';

import { wrapExceptionAsync } from './wrapExceptionAsync';

/**
 * An async version of {@link FileSystem.getRealPath}.
 */
export async function getRealPathAsync(path: string): Promise<string> {
  return await wrapExceptionAsync(() => {
    return realpath(path);
  });
}
