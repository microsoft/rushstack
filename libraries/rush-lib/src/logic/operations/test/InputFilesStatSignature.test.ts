// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('@rushstack/package-deps-hash', () => {
  const actual: typeof import('@rushstack/package-deps-hash') = jest.requireActual(
    '@rushstack/package-deps-hash'
  );
  return { ...actual, hashFilesAsync: jest.fn(actual.hashFilesAsync) };
});

import * as child_process from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { hashFilesAsync } from '@rushstack/package-deps-hash';

import {
  captureInputFilesState,
  FILE_TIME_TOLERANCE_MS,
  getNewFolderEntries,
  hasUntrackedGitFiles,
  haveInputFilesChanged,
  haveSnapshotHashesChangedAsync,
  type IInputFilesState,
  MAX_IN_PROCESS_HASH_FILE_SIZE
} from '../InputFilesStatSignature';

const NANOSECONDS_PER_MILLISECOND: bigint = BigInt(1000000);

function getLatestFileTimeMs(filePath: string): number {
  const { mtimeNs, ctimeNs } = fs.statSync(filePath, { bigint: true });
  return Number((mtimeNs > ctimeNs ? mtimeNs : ctimeNs) / NANOSECONDS_PER_MILLISECOND);
}

describe('InputFilesStatSignature', () => {
  let tempFolder: string;
  let srcFolder: string;
  let fileA: string;
  let fileB: string;
  let noNewInputs: jest.Mock<boolean, [ReadonlyArray<string>]>;

  // Returns a snapshot start time whose window starts after the times of every existing file, once the clock of the
  // file system has passed the start of the window, so that the files saved afterwards are inside the window.
  function waitForNextWindow(): number {
    const probeFile: string = path.join(tempFolder, 'probe.txt');
    fs.writeFileSync(probeFile, '');
    const windowStartTimeMs: number = getLatestFileTimeMs(probeFile) + 1;
    const deadlineMs: number = Date.now() + 10000;
    do {
      fs.writeFileSync(probeFile, `${Date.now()}`);
    } while (getLatestFileTimeMs(probeFile) < windowStartTimeMs && Date.now() < deadlineMs);
    return windowStartTimeMs + FILE_TIME_TOLERANCE_MS;
  }

  function capture(...absolutePaths: string[]): IInputFilesState {
    return captureAt(undefined, ...absolutePaths);
  }

  function captureAt(snapshotStartTimeMs: number | undefined, ...absolutePaths: string[]): IInputFilesState {
    return captureInputFilesState(
      tempFolder,
      absolutePaths.map((filePath: string) => path.relative(tempFolder, filePath)),
      snapshotStartTimeMs
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

    it('does not ask about new folders that hold no files', () => {
      const state: IInputFilesState = capture(fileA);
      fs.mkdirSync(path.join(srcFolder, 'empty'));
      fs.mkdirSync(path.join(srcFolder, 'nested', 'empty'), { recursive: true });
      expect(haveInputFilesChanged(state, noNewInputs)).toBe(false);
      expect(noNewInputs).not.toHaveBeenCalled();

      fs.writeFileSync(path.join(srcFolder, 'nested', 'empty', 'd.ts'), 'export const d = 1;');
      expect(haveInputFilesChanged(state, noNewInputs)).toBe(false);
      expect(noNewInputs).toHaveBeenCalledWith([path.join(srcFolder, 'nested')]);
    });
  });

  describe('filesChangedDuringSnapshot', () => {
    function getStatusChangeTimeMs(filePath: string): number {
      return Number(fs.statSync(filePath, { bigint: true }).ctimeNs / NANOSECONDS_PER_MILLISECOND);
    }

    it('is empty if the snapshot start time is unknown', () => {
      expect(capture(fileA, fileB).filesChangedDuringSnapshot).toEqual([]);
    });

    it('lists a file modified at or after the snapshot start, within the tolerance', () => {
      const fileTimeMs: number = getLatestFileTimeMs(fileA);
      expect(captureAt(fileTimeMs + FILE_TIME_TOLERANCE_MS, fileA).filesChangedDuringSnapshot).toEqual([
        path.relative(tempFolder, fileA)
      ]);
      expect(captureAt(fileTimeMs + FILE_TIME_TOLERANCE_MS + 1, fileA).filesChangedDuringSnapshot).toEqual(
        []
      );
    });

    it('lists only the files that changed after the snapshot start', () => {
      const snapshotStartTimeMs: number = getLatestFileTimeMs(fileB) + FILE_TIME_TOLERANCE_MS + 1;
      // Wait for the file system clock to pass the start of the window
      const deadlineMs: number = Date.now() + 10000;
      do {
        fs.writeFileSync(fileB, `export const b = ${Date.now()}; // saved during the snapshot`);
      } while (
        getLatestFileTimeMs(fileB) < snapshotStartTimeMs - FILE_TIME_TOLERANCE_MS &&
        Date.now() < deadlineMs
      );

      expect(captureAt(snapshotStartTimeMs, fileA, fileB).filesChangedDuringSnapshot).toEqual([
        path.relative(tempFolder, fileB)
      ]);
    });

    it('uses the status change time if the modification time was set back', () => {
      const past: Date = new Date(Date.now() - 3600 * 1000);
      fs.utimesSync(fileA, past, past);
      const statusChangeTimeMs: number = getStatusChangeTimeMs(fileA);
      expect(fs.statSync(fileA).mtimeMs).toBeLessThan(statusChangeTimeMs - FILE_TIME_TOLERANCE_MS);

      expect(captureAt(statusChangeTimeMs, fileA).filesChangedDuringSnapshot).toEqual([
        path.relative(tempFolder, fileA)
      ]);
    });

    it('ignores file times after the end of the window', () => {
      const future: Date = new Date(Date.now() + 3600 * 1000);
      fs.utimesSync(fileA, future, future);
      // Only the modification time, which is in the future, is at or after the start of the window
      const snapshotStartTimeMs: number = getStatusChangeTimeMs(fileA) + FILE_TIME_TOLERANCE_MS + 1;

      expect(captureAt(snapshotStartTimeMs, fileA).filesChangedDuringSnapshot).toEqual([]);
    });

    it('skips missing files', () => {
      const missingFile: string = path.join(srcFolder, 'missing.ts');
      expect(captureAt(0, missingFile, fileA).filesChangedDuringSnapshot).toEqual([
        path.relative(tempFolder, fileA)
      ]);
    });
  });

  describe('filesDeletedDuringSnapshot', () => {
    it('is empty if the snapshot start time is unknown', () => {
      fs.unlinkSync(fileA);
      expect(capture(fileA, fileB).filesDeletedDuringSnapshot).toEqual([]);
    });

    it('lists a file that was deleted after the snapshot start, which counts as a change', () => {
      const snapshotStartTimeMs: number = Date.now();
      fs.unlinkSync(fileA);

      const state: IInputFilesState = captureAt(snapshotStartTimeMs, fileA, fileB);
      expect(state.filesDeletedDuringSnapshot).toEqual([path.relative(tempFolder, fileA)]);
      // Although the file is still missing
      expect(haveInputFilesChanged(state, noNewInputs)).toBe(true);
    });

    it('does not list a file that was missing before the snapshot start', () => {
      fs.unlinkSync(fileA);
      const snapshotStartTimeMs: number = getLatestFileTimeMs(srcFolder) + FILE_TIME_TOLERANCE_MS + 1;

      const state: IInputFilesState = captureAt(snapshotStartTimeMs, fileA, fileB);
      expect(state.filesDeletedDuringSnapshot).toEqual([]);
      expect(haveInputFilesChanged(state, noNewInputs)).toBe(false);
    });

    it('judges a missing folder by the nearest folder above it that exists', () => {
      const subFolder: string = path.join(srcFolder, 'sub');
      const fileC: string = path.join(subFolder, 'c.ts');
      fs.mkdirSync(subFolder);
      fs.writeFileSync(fileC, 'export const c = 1;');
      const snapshotStartTimeMs: number = Date.now();
      fs.rmSync(subFolder, { recursive: true });

      expect(captureAt(snapshotStartTimeMs, fileC).filesDeletedDuringSnapshot).toEqual([
        path.relative(tempFolder, fileC)
      ]);
      expect(
        captureAt(getLatestFileTimeMs(srcFolder) + FILE_TIME_TOLERANCE_MS + 1, fileC)
          .filesDeletedDuringSnapshot
      ).toEqual([]);
    });
  });

  describe('folderEntries of a folder that changed after the snapshot start', () => {
    it('are the entries from before the snapshot start, so that later ones are new', () => {
      // Not an input file
      fs.writeFileSync(path.join(srcFolder, 'old.txt'), '');
      const snapshotStartTimeMs: number = waitForNextWindow();
      const newFile: string = path.join(srcFolder, 'new.ts');
      fs.writeFileSync(newFile, 'export const n = 1;');

      const state: IInputFilesState = captureAt(snapshotStartTimeMs, fileA);
      expect(getNewFolderEntries(state.folderEntries)).toEqual([newFile]);
      expect(haveInputFilesChanged(state, noNewInputs)).toBe(false);
      expect(noNewInputs).toHaveBeenCalledWith([newFile]);
    });

    it('include the names that lead to the input files, even if those entries changed', () => {
      const subFolder: string = path.join(srcFolder, 'sub');
      const fileC: string = path.join(subFolder, 'c.ts');
      fs.mkdirSync(subFolder);
      fs.writeFileSync(fileC, 'export const c = 1;');
      const snapshotStartTimeMs: number = waitForNextWindow();
      // Like an editor that saves a file by renaming a temporary file, which changes both folders
      for (const filePath of [fileA, fileC]) {
        fs.writeFileSync(`${filePath}.tmp`, fs.readFileSync(filePath));
        fs.renameSync(`${filePath}.tmp`, filePath);
      }

      const state: IInputFilesState = captureAt(snapshotStartTimeMs, fileA, fileC);
      expect(getNewFolderEntries(state.folderEntries)).toEqual([]);
      expect(haveInputFilesChanged(state, noNewInputs)).toBe(false);
      expect(noNewInputs).not.toHaveBeenCalled();
    });
  });

  describe(haveSnapshotHashesChangedAsync.name, () => {
    const gitPath: string = 'git';
    const pathA: string = 'src/a.ts';
    const pathB: string = 'src/b.ts';

    function getBlobHash(content: string | Buffer, algorithm: string = 'sha1'): string {
      return crypto
        .createHash(algorithm)
        .update(`blob ${Buffer.byteLength(content)}\0`)
        .update(content)
        .digest('hex');
    }

    function haveHashesChangedAsync(
      snapshotHashes: ReadonlyMap<string, string>,
      filePaths: ReadonlyArray<string>
    ): Promise<boolean> {
      return haveSnapshotHashesChangedAsync(gitPath, tempFolder, filePaths, snapshotHashes);
    }

    const hashA: string = getBlobHash('export const a = 1;');
    const hashB: string = getBlobHash('export const b = 1;');

    beforeEach(() => {
      jest.mocked(hashFilesAsync).mockClear();
    });

    it('does not start Git if every file has its snapshot hash', async () => {
      const snapshotHashes: Map<string, string> = new Map([
        [pathA, hashA],
        [pathB, hashB]
      ]);
      expect(await haveHashesChangedAsync(snapshotHashes, [pathA, pathB])).toBe(false);
      expect(jest.mocked(hashFilesAsync)).not.toHaveBeenCalled();
    });

    it('does not start Git for an unchanged file that was saved in the second before the snapshot started', async () => {
      const { mtimeMs, ctimeMs } = fs.statSync(fileA);
      const { filesChangedDuringSnapshot } = captureAt(Math.max(mtimeMs, ctimeMs) + 1000, fileA);
      expect(filesChangedDuringSnapshot).toEqual([path.relative(tempFolder, fileA)]);

      const snapshotHashes: Map<string, string> = new Map([[filesChangedDuringSnapshot[0], hashA]]);
      expect(await haveHashesChangedAsync(snapshotHashes, filesChangedDuringSnapshot)).toBe(false);
      expect(jest.mocked(hashFilesAsync)).not.toHaveBeenCalled();
    });

    it('asks Git only about the files that do not have their snapshot hashes', async () => {
      fs.writeFileSync(fileB, 'export const b = 2;');
      const snapshotHashes: Map<string, string> = new Map([
        [pathA, hashA],
        [pathB, hashB]
      ]);
      expect(await haveHashesChangedAsync(snapshotHashes, [pathA, pathB])).toBe(true);
      expect(jest.mocked(hashFilesAsync).mock.calls).toEqual([[tempFolder, [pathB], gitPath]]);
    });

    it('uses the hash from Git, which applies clean filters, for a file that does not have its snapshot hash', async () => {
      child_process.execFileSync(gitPath, ['init', '-q'], { cwd: tempFolder, stdio: 'ignore' });
      fs.writeFileSync(path.join(tempFolder, '.gitattributes'), '*.ts text\n');
      // Git stores the file with LF line endings
      const snapshotHashes: Map<string, string> = new Map([[pathA, getBlobHash('export const a = 1;\n')]]);

      fs.writeFileSync(fileA, 'export const a = 1;\r\n');
      expect(await haveHashesChangedAsync(snapshotHashes, [pathA])).toBe(false);
      expect(jest.mocked(hashFilesAsync)).toHaveBeenCalledTimes(1);

      fs.writeFileSync(fileA, 'export const a = 2;\r\n');
      expect(await haveHashesChangedAsync(snapshotHashes, [pathA])).toBe(true);
      expect(jest.mocked(hashFilesAsync)).toHaveBeenCalledTimes(2);
    });

    it('reports a change without starting Git if a file has no snapshot hash', async () => {
      expect(await haveHashesChangedAsync(new Map([[pathA, hashA]]), [pathA, pathB])).toBe(true);
      expect(jest.mocked(hashFilesAsync)).not.toHaveBeenCalled();
    });

    it('hashes a file with the algorithm of its snapshot hash', async () => {
      const snapshotHashes: Map<string, string> = new Map([
        [pathA, getBlobHash('export const a = 1;', 'sha256')]
      ]);
      expect(await haveHashesChangedAsync(snapshotHashes, [pathA])).toBe(false);
      expect(jest.mocked(hashFilesAsync)).not.toHaveBeenCalled();
    });

    it(`asks Git about a file larger than ${MAX_IN_PROCESS_HASH_FILE_SIZE} bytes`, async () => {
      const largestContent: Buffer = Buffer.alloc(MAX_IN_PROCESS_HASH_FILE_SIZE, 'a');
      fs.writeFileSync(fileA, largestContent);
      const largestHashes: Map<string, string> = new Map([[pathA, getBlobHash(largestContent)]]);
      expect(await haveHashesChangedAsync(largestHashes, [pathA])).toBe(false);
      expect(jest.mocked(hashFilesAsync)).not.toHaveBeenCalled();

      const largerContent: Buffer = Buffer.alloc(MAX_IN_PROCESS_HASH_FILE_SIZE + 1, 'a');
      fs.writeFileSync(fileA, largerContent);
      const largerHashes: Map<string, string> = new Map([[pathA, getBlobHash(largerContent)]]);
      expect(await haveHashesChangedAsync(largerHashes, [pathA])).toBe(false);
      expect(jest.mocked(hashFilesAsync)).toHaveBeenCalledTimes(1);
    });

    it('reports a change if a file was deleted', async () => {
      fs.unlinkSync(fileA);
      expect(await haveHashesChangedAsync(new Map([[pathA, hashA]]), [pathA])).toBe(true);
    });

    // E.g. a FIFO, which would block the event loop if it were read in process
    (process.platform === 'win32' ? it.skip : it)('asks Git about a path that is not a file', async () => {
      const devicePath: string = '/dev/null';
      const snapshotHashes: Map<string, string> = new Map([[devicePath, getBlobHash('')]]);
      expect(await haveHashesChangedAsync(snapshotHashes, [devicePath])).toBe(false);
      expect(jest.mocked(hashFilesAsync)).toHaveBeenCalledTimes(1);
    });

    it('reports a change if Git was not found', async () => {
      expect(
        await haveSnapshotHashesChangedAsync(undefined, tempFolder, [pathA], new Map([[pathA, hashA]]))
      ).toBe(true);
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

    it('does not count untracked files that the inputs snapshot hashed', () => {
      fs.writeFileSync(path.join(srcFolder, 'c.ts'), '');
      fs.mkdirSync(path.join(srcFolder, 'nested'));
      fs.writeFileSync(path.join(srcFolder, 'nested', 'd.ts'), '');
      const candidatePaths: string[] = [path.join(srcFolder, 'c.ts'), path.join(srcFolder, 'nested')];
      const snapshotHashes: Map<string, string> = new Map([
        ['src/c.ts', 'c'],
        ['src/nested/d.ts', 'd']
      ]);

      expect(hasUntrackedGitFiles(gitPath, tempFolder, candidatePaths, [], snapshotHashes)).toBe(false);

      snapshotHashes.delete('src/nested/d.ts');
      expect(hasUntrackedGitFiles(gitPath, tempFolder, candidatePaths, [], snapshotHashes)).toBe(true);
    });
  });
});
