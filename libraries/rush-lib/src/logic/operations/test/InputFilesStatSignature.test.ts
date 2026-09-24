// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  getInputFilesStatSignature,
  haveInputFilesChanged,
  type IInputFilesStatRecord
} from '../InputFilesStatSignature';

describe('InputFilesStatSignature', () => {
  let tempFolder: string;
  let fileA: string;
  let fileB: string;

  function recordInputs(filePaths: string[]): IInputFilesStatRecord {
    return { inputFilePaths: filePaths, inputFilesStatSignature: getInputFilesStatSignature(filePaths) };
  }

  beforeEach(() => {
    tempFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-input-stat-'));
    fileA = path.join(tempFolder, 'a.ts');
    fileB = path.join(tempFolder, 'b.ts');
    fs.writeFileSync(fileA, 'export const a = 1;');
    fs.writeFileSync(fileB, 'export const b = 1;');
  });

  afterEach(() => {
    fs.rmSync(tempFolder, { recursive: true, force: true });
  });

  it('is stable when the input files are unchanged', () => {
    const record: IInputFilesStatRecord = recordInputs([fileA, fileB]);
    expect(getInputFilesStatSignature([fileA, fileB])).toEqual(record.inputFilesStatSignature);
    expect(haveInputFilesChanged(record)).toBe(false);
  });

  it('detects a modified input file', () => {
    const record: IInputFilesStatRecord = recordInputs([fileA, fileB]);
    fs.writeFileSync(fileB, 'export const b = 2; // edited during the build');
    expect(haveInputFilesChanged(record)).toBe(true);
  });

  it('detects a same-size edit with a different modification time', () => {
    const record: IInputFilesStatRecord = recordInputs([fileA]);
    fs.writeFileSync(fileA, 'export const a = 2;');
    const future: Date = new Date(Date.now() + 60 * 1000);
    fs.utimesSync(fileA, future, future);
    expect(haveInputFilesChanged(record)).toBe(true);
  });

  it('detects a deleted input file', () => {
    const record: IInputFilesStatRecord = recordInputs([fileA, fileB]);
    fs.unlinkSync(fileA);
    expect(haveInputFilesChanged(record)).toBe(true);
  });

  it('detects a created input file that was missing when recorded', () => {
    const fileC: string = path.join(tempFolder, 'c.ts');
    const record: IInputFilesStatRecord = recordInputs([fileA, fileC]);
    fs.writeFileSync(fileC, 'export const c = 1;');
    expect(haveInputFilesChanged(record)).toBe(true);
  });

  it('ignores changes to files that are not tracked inputs', () => {
    const record: IInputFilesStatRecord = recordInputs([fileA]);
    fs.writeFileSync(fileB, 'export const b = 2; // not an input of this operation');
    expect(haveInputFilesChanged(record)).toBe(false);
  });

  it('reports no change when no inputs were recorded', () => {
    expect(haveInputFilesChanged({})).toBe(false);
    expect(haveInputFilesChanged({ inputFilePaths: [fileA] })).toBe(false);
  });
});
