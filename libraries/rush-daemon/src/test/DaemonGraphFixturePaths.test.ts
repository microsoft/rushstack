// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import os from 'node:os';
import * as path from 'node:path';

import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';

it('uses the physical temporary workspace for watcher expectations even when TEMP is an alias', async () => {
  const root: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-fixture-path-'));
  const physical: string = path.join(root, 'physical temporary directory');
  const alias: string = path.join(root, 'alias');
  fs.mkdirSync(physical);
  fs.symlinkSync(physical, alias, 'junction');
  const temporaryDirectory = jest.spyOn(os, 'tmpdir').mockReturnValue(alias);
  let fixture: DaemonGraphTestFixture | undefined;
  try {
    fixture = new DaemonGraphTestFixture();
    expect(path.dirname(fixture.folder)).toBe(fs.realpathSync.native(physical));
    expect(fixture.folder).toBe(fs.realpathSync.native(fixture.folder));
  } finally {
    temporaryDirectory.mockRestore();
    await fixture?.[Symbol.asyncDispose]();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
