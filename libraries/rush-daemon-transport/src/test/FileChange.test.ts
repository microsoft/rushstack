// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { compareFileIdentity } from '../DaemonFileChange';
import type { IDaemonFileIdentity } from '../DaemonFileIdentity';

const CONTENT: string = 'content';
const MOVED_SUFFIX: string = '.moved';
const OTHER_DEVICE_OFFSET: number = 1;

let folder: string;
let filePath: string;
let created: IDaemonFileIdentity;

beforeEach(() => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-file-change-'));
  filePath = path.join(folder, 'file');
  fs.writeFileSync(filePath, CONTENT);
  const { dev, ino } = fs.lstatSync(filePath);
  created = { dev, ino };
});

afterEach(() => fs.rmSync(folder, { recursive: true, force: true }));

// The moved file keeps its inode in use, so a new file at the name cannot get the same number.
function moveAway(): void {
  fs.renameSync(filePath, `${filePath}${MOVED_SUFFIX}`);
}

it('reports no change while the name has the file that was created there', () => {
  expect(compareFileIdentity(filePath, created)).toBeUndefined();
});

it('reports a name that no file has any more as removed', () => {
  moveAway();
  expect(compareFileIdentity(filePath, created)).toBe('removed');
});

it('reports a name that another file took as replaced', () => {
  moveAway();
  fs.writeFileSync(filePath, CONTENT);
  expect(compareFileIdentity(filePath, created)).toBe('replaced');
});

it('tells files apart by device as well as by inode', () => {
  const otherDevice: IDaemonFileIdentity = { dev: created.dev + OTHER_DEVICE_OFFSET, ino: created.ino };
  expect(compareFileIdentity(filePath, otherDevice)).toBe('replaced');
});

it('reports a name whose folder became a file as removed', () => {
  fs.rmSync(folder, { recursive: true });
  fs.writeFileSync(folder, CONTENT);
  expect(compareFileIdentity(filePath, created)).toBe('removed');
});

it('reports no change when the name cannot be read for another reason', () => {
  // Node.js rejects a path that contains a NUL character on every platform, before it looks for the file.
  const invalid: string = path.join(folder, 'invalid\0name');
  expect(() => fs.lstatSync(invalid)).toThrow();
  expect(compareFileIdentity(invalid, created)).toBeUndefined();
});
