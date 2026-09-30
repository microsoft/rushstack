// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { unlinkIfPresent } from '../DaemonUnlink';

const FOLDER_PREFIX: string = 'rushd-unlink-';

describe(unlinkIfPresent.name, () => {
  let folder: string;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), FOLDER_PREFIX));
  });

  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it('deletes a file', () => {
    const filePath: string = path.join(folder, 'file');
    fs.writeFileSync(filePath, 'content');
    unlinkIfPresent(filePath);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('does nothing when nothing is at the path', () => {
    expect(() => unlinkIfPresent(path.join(folder, 'missing'))).not.toThrow();
  });

  it('throws for a folder, and leaves it', () => {
    const child: string = path.join(folder, 'child');
    fs.mkdirSync(child);
    expect(() => unlinkIfPresent(child)).toThrow();
    expect(fs.statSync(child).isDirectory()).toBe(true);
  });
});
