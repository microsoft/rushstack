// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { readFileSync } from 'fs-extra';

import { wrapException } from './wrapException';

/**
 * Reads the contents of a file into a buffer.
 * Behind the scenes is uses `fs.readFileSync()`.
 * @param filePath - The relative or absolute path to the file whose contents should be read.
 */
export function readFileToBuffer(filePath: string): Buffer {
  return wrapException(() => {
    return readFileSync(filePath);
  });
}
