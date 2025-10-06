// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import readPackageJson from '../ReadPackageJson';
import type { INpmCheckPackageJson } from '../interfaces/INpmCheck';

describe('readPackageJson', () => {
  it('should return valid packageJson if it exists', async () => {
    const fileName: string = path.join(process.cwd(), 'package.json');
    const result: INpmCheckPackageJson = await readPackageJson(fileName);

    expect(result).toBeDefined();
    expect(result).toHaveProperty('name');
  });
});
