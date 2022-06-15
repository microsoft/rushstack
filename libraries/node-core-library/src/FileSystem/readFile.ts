// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IFileSystemReadFileOptions } from './interfaces';
import { readFileToBuffer } from './readFileToBuffer';
import { wrapException } from './wrapException';
import { Encoding, Text } from '../Text';

/**
 * Reads the contents of a file into a string.
 * Behind the scenes it uses `fs.readFileSync()`.
 * @param filePath - The relative or absolute path to the file whose contents should be read.
 * @param options - Optional settings that can change the behavior. Type: `IReadFileOptions`
 */
export function readFile(filePath: string, options?: IFileSystemReadFileOptions): string {
  return wrapException(() => {
    const { convertLineEndings, encoding = Encoding.Utf8 } = options || {};

    let contents: string = readFileToBuffer(filePath).toString(encoding);
    if (convertLineEndings) {
      contents = Text.convertTo(contents, convertLineEndings);
    }

    return contents;
  });
}
