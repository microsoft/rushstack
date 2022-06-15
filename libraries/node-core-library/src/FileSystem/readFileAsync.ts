// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IFileSystemReadFileOptions } from './interfaces';
import { readFileToBufferAsync } from './readFileToBufferAsync';
import { wrapExceptionAsync } from './wrapExceptionAsync';
import { Encoding, Text } from '../Text';

/**
 * An async version of {@link FileSystem.readFile}.
 */
export async function readFileAsync(filePath: string, options?: IFileSystemReadFileOptions): Promise<string> {
  return await wrapExceptionAsync(async () => {
    const { convertLineEndings, encoding = Encoding.Utf8 } = options || {};

    let contents: string = (await readFileToBufferAsync(filePath)).toString(encoding);
    if (convertLineEndings) {
      contents = Text.convertTo(contents, convertLineEndings);
    }

    return contents;
  });
}
