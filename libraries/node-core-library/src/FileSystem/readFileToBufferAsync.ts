// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { readFile } from 'fs-extra';

import { wrapExceptionAsync } from './wrapExceptionAsync';

/**
 * An async version of {@link FileSystem.readFileToBuffer}.
 */
export async function readFileToBufferAsync(filePath: string): Promise<Buffer> {
  return await wrapExceptionAsync(() => {
    return readFile(filePath);
  });
}
