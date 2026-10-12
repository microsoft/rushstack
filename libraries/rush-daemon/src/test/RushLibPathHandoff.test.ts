// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { getRushLibPathHandoff } from '../RushLibPathHandoff';

describe(getRushLibPathHandoff.name, () => {
  let folder: string;
  let entryPoint: string;
  let linkedEntryPoint: string;

  beforeEach(() => {
    folder = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-lib-path-')));
    const rushLibFolder: string = path.join(folder, 'libraries', 'rush-lib');
    fs.mkdirSync(path.join(rushLibFolder, 'lib-commonjs'), { recursive: true });
    entryPoint = path.join(rushLibFolder, 'lib-commonjs', 'index.js');
    fs.writeFileSync(entryPoint, '');
    const rushLibLink: string = path.join(folder, 'daemon', 'node_modules', '@microsoft', 'rush-lib');
    fs.mkdirSync(path.dirname(rushLibLink), { recursive: true });
    fs.symlinkSync(rushLibFolder, rushLibLink, 'junction');
    linkedEntryPoint = path.join(rushLibLink, 'lib-commonjs', 'index.js');
  });

  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it('uses the entry point when nothing is set', () => {
    expect(getRushLibPathHandoff(entryPoint, undefined)).toBe(entryPoint);
  });

  it('keeps a linked spelling of the same entry point', () => {
    expect(getRushLibPathHandoff(entryPoint, linkedEntryPoint)).toBe(linkedEntryPoint);
  });

  it('replaces a different or missing engine', () => {
    const otherEntryPoint: string = path.join(folder, 'other', 'index.js');
    fs.mkdirSync(path.dirname(otherEntryPoint), { recursive: true });
    fs.writeFileSync(otherEntryPoint, '');

    expect(getRushLibPathHandoff(entryPoint, otherEntryPoint)).toBe(entryPoint);
    expect(getRushLibPathHandoff(entryPoint, path.join(folder, 'missing.js'))).toBe(entryPoint);
  });
});
