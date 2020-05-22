// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { JsonFile } from '../JsonFile';
import { FileSystemNotExistError } from '../FileSystemNotExistError';

test('Throws FileSystemNotExistError', () => {
  expect(() => JsonFile.load(path.join(__dirname, 'fileThatDoesntExist.json'))).toThrowError(FileSystemNotExistError);
});

test('Throws FileSystemNotExistError async', async () => {
  try {
    await JsonFile.loadAsync(path.join(__dirname, 'fileThatDoesntExist.json'));
  } catch (error) {
    if (!(error instanceof FileSystemNotExistError)) {
      fail();
    }
  }
});
