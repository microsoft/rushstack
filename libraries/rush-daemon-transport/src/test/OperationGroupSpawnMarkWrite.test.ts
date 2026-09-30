// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readSpawnMarks, readUptimeTicks, withSpawnMark } from '../DaemonOperationGroupSpawnMark';

// These tests start no process. A callback stands in for the spawn, and it only reads or changes the folder.
const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;
const DETACHED: boolean = true;
const NOT_DETACHED: boolean = false;
const FIRST_INDEX: number = 0;
const TEMP_PREFIX: string = 'rushd-spawn-mark-';
const MARK_FOLDER: string = 'groups';
const MARK_PREFIX: string = 'spawn-';
const EMPTY_FILE: string = '';
const RETURNED: string = 'returned';

const createdFolders: string[] = [];

afterEach(() => {
  for (const folder of createdFolders.splice(FIRST_INDEX)) {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

// A new mark folder, which doesn't exist yet: the mark's writer creates it, as it does a daemon's record folder.
function createMarkFolder(): string {
  const temp: string = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  createdFolders.push(temp);
  return path.join(temp, MARK_FOLDER);
}

linuxIt('marks a detached spawn with the clock tick it began at, and only while it runs', () => {
  const folder: string = createMarkFolder();
  const before: number = readUptimeTicks();
  const marks: number[] = withSpawnMark(folder, DETACHED, () => readSpawnMarks(folder));
  const after: number = readUptimeTicks();
  expect(marks).toEqual([expect.any(Number)]);
  const [mark] = marks;
  expect({ notBefore: mark >= before, notAfter: mark <= after }).toEqual({ notBefore: true, notAfter: true });
  expect(readSpawnMarks(folder)).toEqual([]);
});

linuxIt('marks nothing for a spawn that is not detached', () => {
  const folder: string = createMarkFolder();
  expect(withSpawnMark(folder, NOT_DETACHED, () => readSpawnMarks(folder))).toEqual([]);
});

linuxIt('removes the mark when the spawn throws, and throws what it threw', () => {
  const folder: string = createMarkFolder();
  const error: Error = new Error('spawn EINVAL');
  const marksInSpawn: number[][] = [];
  const throwing = (): never => {
    marksInSpawn.push(readSpawnMarks(folder));
    throw error;
  };
  expect(() => withSpawnMark(folder, DETACHED, throwing)).toThrow(error);
  expect({ marksInSpawn, marksAfter: readSpawnMarks(folder) }).toEqual({
    marksInSpawn: [[expect.any(Number)]],
    marksAfter: []
  });
});

linuxIt('runs the spawn and returns what it returns when no mark can be written', () => {
  // A file where the mark folder belongs, so the folder can't be created.
  const folder: string = createMarkFolder();
  fs.writeFileSync(folder, EMPTY_FILE);
  expect(withSpawnMark(folder, DETACHED, () => RETURNED)).toBe(RETURNED);
});

linuxIt('returns what the spawn returns when its mark cannot be removed', () => {
  const folder: string = createMarkFolder();
  // Puts a folder where the mark file was, so removing the mark fails.
  const replaceMark = (): string => {
    const [mark] = readSpawnMarks(folder);
    const markPath: string = path.join(folder, `${MARK_PREFIX}${mark}`);
    fs.rmSync(markPath);
    fs.mkdirSync(markPath);
    return RETURNED;
  };
  expect(withSpawnMark(folder, DETACHED, replaceMark)).toBe(RETURNED);
});
