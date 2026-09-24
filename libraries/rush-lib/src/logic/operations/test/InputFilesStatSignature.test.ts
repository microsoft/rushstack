// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  captureInputFilesState,
  getNewFolderEntries,
  hasUntrackedGitFiles,
  haveInputFilesChanged,
  type IInputFilesState
} from '../InputFilesStatSignature';

describe('InputFilesStatSignature', () => {
  let tempFolder: string;
  let srcFolder: string;
  let fileA: string;
  let fileB: string;
  let noNewInputs: jest.Mock<boolean, [ReadonlyArray<string>]>;

  function capture(...absolutePaths: string[]): IInputFilesState {
    return captureInputFilesState(
      tempFolder,
      absolutePaths.map((filePath: string) => path.relative(tempFolder, filePath))
    );
  }

  beforeEach(() => {
    tempFolder = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rush-input-stat-')));
    srcFolder = path.join(tempFolder, 'src');
    fs.mkdirSync(srcFolder);
    fileA = path.join(srcFolder, 'a.ts');
    fileB = path.join(srcFolder, 'b.ts');
    fs.writeFileSync(fileA, 'export const a = 1;');
    fs.writeFileSync(fileB, 'export const b = 1;');
    noNewInputs = jest.fn().mockReturnValue(false);
  });

  afterEach(() => {
    fs.rmSync(tempFolder, { recursive: true, force: true });
  });

  describe(haveInputFilesChanged.name, () => {
    it('reports no change when the input files are unchanged', () => {
      const state: IInputFilesState = capture(fileA, fileB);
      expect(state.filePaths).toEqual([fileA, fileB]);
      expect(haveInputFilesChanged(state, noNewInputs)).toBe(false);
      expect(noNewInputs).not.toHaveBeenCalled();
    });

    it('detects a modified input file', () => {
      const state: IInputFilesState = capture(fileA, fileB);
      fs.writeFileSync(fileB, 'export const b = 2; // edited during the build');
      expect(haveInputFilesChanged(state, noNewInputs)).toBe(true);
    });

    it('detects a same-size edit with a different modification time', () => {
      const state: IInputFilesState = capture(fileA);
      fs.writeFileSync(fileA, 'export const a = 2;');
      const future: Date = new Date(Date.now() + 60 * 1000);
      fs.utimesSync(fileA, future, future);
      expect(haveInputFilesChanged(state, noNewInputs)).toBe(true);
    });

    it('detects a deleted input file', () => {
      const state: IInputFilesState = capture(fileA, fileB);
      fs.unlinkSync(fileA);
      expect(haveInputFilesChanged(state, noNewInputs)).toBe(true);
    });

    it('asks whether files created in an input folder are inputs', () => {
      const state: IInputFilesState = capture(fileA, fileB);
      const fileC: string = path.join(srcFolder, 'c.ts');
      fs.writeFileSync(fileC, 'export const c = 1;');

      expect(haveInputFilesChanged(state, noNewInputs)).toBe(false);
      expect(noNewInputs).toHaveBeenCalledWith([fileC]);

      expect(haveInputFilesChanged(state, () => true)).toBe(true);
    });

    it('reports a folder created in an input folder', () => {
      const state: IInputFilesState = capture(fileA);
      fs.mkdirSync(path.join(srcFolder, 'nested'));
      fs.writeFileSync(path.join(srcFolder, 'nested', 'd.ts'), 'export const d = 1;');
      expect(getNewFolderEntries(state.folderEntries)).toEqual([path.join(srcFolder, 'nested')]);
    });

    it('ignores files created outside of the input folders', () => {
      const state: IInputFilesState = capture(fileA);
      fs.writeFileSync(path.join(tempFolder, 'unrelated.txt'), 'not an input');
      expect(haveInputFilesChanged(state, noNewInputs)).toBe(false);
      expect(noNewInputs).not.toHaveBeenCalled();
    });

    it('resolves absolute input paths as-is and does not watch their folders', () => {
      const state: IInputFilesState = captureInputFilesState(path.join(tempFolder, 'other-root'), [fileA]);
      expect(state.filePaths).toEqual([fileA]);
      expect(state.folderEntries.size).toBe(0);
      fs.writeFileSync(fileA, 'export const a = 3; // edited during the build');
      expect(haveInputFilesChanged(state, noNewInputs)).toBe(true);
    });
  });

  describe(hasUntrackedGitFiles.name, () => {
    const gitPath: string = 'git';

    function git(...args: string[]): void {
      child_process.execFileSync(gitPath, args, { cwd: tempFolder, stdio: 'ignore' });
    }

    beforeEach(() => {
      git('init', '-q');
      fs.writeFileSync(path.join(tempFolder, '.gitignore'), 'temp/\n*.log\n');
      git('add', '-A');
    });

    it('returns false for ignored files and excluded folders', () => {
      fs.mkdirSync(path.join(srcFolder, 'temp'));
      fs.writeFileSync(path.join(srcFolder, 'temp', 'x.ts'), '');
      fs.writeFileSync(path.join(srcFolder, 'build.log'), '');
      fs.mkdirSync(path.join(srcFolder, 'lib'));
      fs.writeFileSync(path.join(srcFolder, 'lib', 'a.js'), '');

      expect(
        hasUntrackedGitFiles(
          gitPath,
          tempFolder,
          [path.join(srcFolder, 'temp'), path.join(srcFolder, 'build.log'), path.join(srcFolder, 'lib')],
          [path.join(srcFolder, 'lib')]
        )
      ).toBe(false);
    });

    it('returns true for new untracked files and folders that are not ignored', () => {
      fs.writeFileSync(path.join(srcFolder, 'c.ts'), '');
      fs.mkdirSync(path.join(srcFolder, 'nested'));
      fs.writeFileSync(path.join(srcFolder, 'nested', 'd.ts'), '');

      expect(hasUntrackedGitFiles(gitPath, tempFolder, [path.join(srcFolder, 'c.ts')], [])).toBe(true);
      expect(hasUntrackedGitFiles(gitPath, tempFolder, [path.join(srcFolder, 'nested')], [])).toBe(true);
    });
  });
});