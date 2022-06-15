// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { dirname } from 'path';
import { appendFileSync } from 'fs-extra';

import type { IFileSystemWriteFileOptions } from './interfaces';
import { isNotExistError } from './isNotExistError';
import { ensureFolder } from './ensureFolder';
import { wrapException } from './wrapException';
import { Encoding, Text } from '../Text';

/**
 * Writes a text string to a file on disk, appending to the file if it already exists.
 * Behind the scenes it uses `fs.appendFileSync()`.
 * @remarks
 * Throws an error if the folder doesn't exist, unless ensureFolder=true.
 * @param filePath - The absolute or relative path of the file.
 * @param contents - The text that should be written to the file.
 * @param options - Optional settings that can change the behavior. Type: `IWriteFileOptions`
 */
export function appendToFile(
  filePath: string,
  contents: string | Buffer,
  options?: IFileSystemWriteFileOptions
): void {
  wrapException(() => {
    const { ensureFolderExists = false, convertLineEndings, encoding = Encoding.Utf8 } = options || {};

    if (convertLineEndings) {
      contents = Text.convertTo(contents.toString(), convertLineEndings);
    }

    try {
      appendFileSync(filePath, contents, { encoding: encoding });
    } catch (error) {
      if (ensureFolderExists) {
        if (!isNotExistError(error as Error)) {
          throw error;
        }

        const folderPath: string = dirname(filePath);
        ensureFolder(folderPath);
        appendFileSync(filePath, contents, { encoding: encoding });
      } else {
        throw error;
      }
    }
  });
}
