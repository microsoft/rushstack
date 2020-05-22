// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fs from 'fs';
import { FileSystemNotExistError } from '../FileSystemNotExistError';

test('FileSystemNotExistError correctly overrides instance', () => {
  try {
    fs.statSync(path.join(__dirname, 'fileThatDoesntExist'));
  } catch (error) {
    if (!(error instanceof FileSystemNotExistError)) {
      fail();
    }
  }
});