// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';
import { removeTestFolderAsync } from './TestProcessExit';

it('uses the physical fixture folder even when the temporary root is reached through an alias', async () => {
  const root: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-fixture-path-'));
  const physical: string = path.join(root, 'physical temporary directory');
  const alias: string = path.join(root, 'alias');
  let temporaryRoot: jest.SpyInstance | undefined;
  let fixture: DaemonGraphTestFixture | undefined;
  try {
    fs.mkdirSync(physical);
    fs.symlinkSync(physical, alias, process.platform === 'win32' ? 'junction' : 'dir');
    const realOs = jest.requireActual<typeof import('node:os')>('node:os');
    temporaryRoot = jest.spyOn(realOs, 'tmpdir').mockReturnValue(alias);
    fixture = new DaemonGraphTestFixture();
    expect(fixture.folder).toBe(fs.realpathSync.native(fixture.folder));
    expect(path.dirname(fixture.folder)).toBe(fs.realpathSync.native(physical));
  } finally {
    temporaryRoot?.mockRestore();
    await fixture?.[Symbol.asyncDispose]();
    await removeTestFolderAsync(root);
  }
});
