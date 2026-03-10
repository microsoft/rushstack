// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { validateSnapshots, getScssFiles } from './validateSnapshots.ts';

describe('SASS Typings', () => {
  const libFolder: string = path.join(__dirname, '../../temp/sass-ts');
  getScssFiles().forEach((fileName: string) => {
    it(fileName, () => {
      validateSnapshots(libFolder, fileName);
    });
  });
});
