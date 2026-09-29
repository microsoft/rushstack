// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  type IGitIndexExtension,
  type IGitIndexSummary,
  parseGitIndexLayout,
  summarizeGitIndex,
  tryCarryOverGitIndexCaches,
  tryGetGitIndexEntryCount,
  tryReadEwahBitmap,
  writeEwahBitmap
} from '../GitIndexFile';
import { createFsmonitorHook, type IFsmonitorHook } from './FsmonitorHook';

const SHA1_OBJECT_ID_LENGTH: number = 20;
const SHA256_OBJECT_ID_LENGTH: number = 32;
const LONG_FILE_PATH: string = `dir/sub/${'long-name-'.repeat(12)}.txt`;

function getGitEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  delete environment.GIT_DIR;
  delete environment.GIT_WORK_TREE;
  delete environment.GIT_INDEX_FILE;
  // Let "git status" save the index that it refreshes
  delete environment.GIT_OPTIONAL_LOCKS;
  return environment;
}

let repoPath: string;

function runGit(...args: string[]): string {
  return execFileSync('git', args, { cwd: repoPath, env: getGitEnvironment(), encoding: 'utf8' });
}

function runGitWithIndex(indexPath: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoPath,
    env: { ...getGitEnvironment(), GIT_INDEX_FILE: indexPath },
    encoding: 'utf8'
  });
}

function writeFile(relativePath: string, content: string): void {
  const filePath: string = path.join(repoPath, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function getIndexPath(): string {
  return path.join(repoPath, '.git', 'index');
}

function readIndex(): Buffer {
  return fs.readFileSync(getIndexPath());
}

function createRepo(...initArgs: string[]): void {
  runGit('init', '--quiet', ...initArgs);
  runGit('config', 'core.fsmonitor', 'false');
  runGit('config', 'core.untrackedCache', 'true');
  runGit('config', 'index.skipHash', 'false');
  writeFile('a.txt', 'a\n');
  writeFile('dir/b.txt', 'b\n');
  writeFile('dir/sub/c.txt', 'c\n');
  writeFile(LONG_FILE_PATH, 'd\n');
  runGit('add', '.');
}

function commit(): void {
  runGit('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'Commit');
}

// Git writes a version 3 index only if an entry has extended flags, and writes a version 2 index otherwise
function setIndexVersion(version: number): void {
  if (version === 3) {
    runGit('update-index', '--skip-worktree', LONG_FILE_PATH);
  }

  runGit('update-index', `--index-version=${version}`);
  expect(readIndex().readUInt32BE(4)).toBe(version);
}

describe(summarizeGitIndex.name, () => {
  function summarize(objectIdLength: number = SHA1_OBJECT_ID_LENGTH): IGitIndexSummary {
    return summarizeGitIndex(readIndex(), objectIdLength);
  }

  beforeEach(() => {
    repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'git-index-file-test-'));
  });

  afterEach(() => {
    fs.rmSync(repoPath, { recursive: true, force: true });
  });

  it.each([2, 3, 4])('summarizes a version %i index', (version: number) => {
    createRepo();
    setIndexVersion(version);

    const summary: IGitIndexSummary = summarize();
    expect(summary.entryCount).toBe(4);
    expect(summary.entriesDigest).toMatch(/^[0-9a-f]{40}$/);
    expect(summary.isSplit).toBe(false);
  });

  it('summarizes the index of a SHA-256 repository', () => {
    createRepo('--object-format=sha256');
    runGit('update-index', '--index-version=4');

    const summary: IGitIndexSummary = summarize(SHA256_OBJECT_ID_LENGTH);
    expect(summary.entryCount).toBe(4);
    expect(() => summarize(SHA1_OBJECT_ID_LENGTH)).toThrow();
  });

  it.each([2, 3, 4])('ignores what refreshing a version %i index changes', (version: number) => {
    createRepo();
    setIndexVersion(version);
    commit();
    const initialIndex: Buffer = readIndex();
    const initialSummary: IGitIndexSummary = summarize();

    // Change the recorded times of a file, and the untracked cache
    const time: number = Math.floor(Date.now() / 1000) - 100;
    fs.utimesSync(path.join(repoPath, 'a.txt'), time, time);
    writeFile('untracked.txt', 'untracked\n');
    runGit('status', '--porcelain');

    expect(readIndex().equals(initialIndex)).toBe(false);
    expect(summarize()).toEqual(initialSummary);
  });

  it.each([2, 3, 4])('changes when the entries of a version %i index change', (version: number) => {
    createRepo();
    setIndexVersion(version);
    const initialDigest: string = summarize().entriesDigest;
    const digests: Set<string> = new Set([initialDigest]);

    runGit('update-index', '--assume-unchanged', 'a.txt');
    digests.add(summarize().entriesDigest);
    runGit('update-index', '--no-assume-unchanged', 'a.txt');
    expect(summarize().entriesDigest).toBe(initialDigest);

    // Extended flags
    runGit('update-index', '--skip-worktree', 'dir/b.txt');
    digests.add(summarize().entriesDigest);
    runGit('update-index', '--no-skip-worktree', 'dir/b.txt');
    expect(summarize().entriesDigest).toBe(initialDigest);

    runGit('update-index', '--chmod=+x', 'a.txt');
    digests.add(summarize().entriesDigest);
    runGit('update-index', '--chmod=-x', 'a.txt');
    expect(summarize().entriesDigest).toBe(initialDigest);

    writeFile('a.txt', 'changed\n');
    runGit('add', 'a.txt');
    digests.add(summarize().entriesDigest);

    runGit('rm', '--cached', '--quiet', 'dir/sub/c.txt');
    const summary: IGitIndexSummary = summarize();
    expect(summary.entryCount).toBe(3);
    digests.add(summary.entriesDigest);

    expect(digests.size).toBe(6);
  });

  it.each([2, 3, 4])('digests the recorded sizes of a version %i index separately', (version: number) => {
    createRepo();
    setIndexVersion(version);
    commit();
    const initialSummary: IGitIndexSummary = summarize();
    expect(initialSummary.sizesDigest).toMatch(/^[0-9a-f]{40}$/);

    // Git writes the file with other line endings, and records its new size
    runGit('config', 'core.autocrlf', 'true');
    fs.unlinkSync(path.join(repoPath, 'a.txt'));
    runGit('checkout', '--', 'a.txt');
    expect(fs.readFileSync(path.join(repoPath, 'a.txt'), 'utf8')).toBe('a\r\n');
    let summary: IGitIndexSummary = summarize();
    expect(summary.entriesDigest).toBe(initialSummary.entriesDigest);
    expect(summary.sizesDigest).not.toBe(initialSummary.sizesDigest);

    runGit('config', 'core.autocrlf', 'false');
    fs.unlinkSync(path.join(repoPath, 'a.txt'));
    runGit('checkout', '--', 'a.txt');
    summary = summarize();
    expect(summary.entriesDigest).toBe(initialSummary.entriesDigest);
    expect(summary.sizesDigest).toBe(initialSummary.sizesDigest);
  });

  it('detects a split index', () => {
    createRepo();
    runGit('update-index', '--split-index');
    expect(summarize().isSplit).toBe(true);

    runGit('update-index', '--no-split-index');
    const summary: IGitIndexSummary = summarize();
    expect(summary.isSplit).toBe(false);
    expect(summary.entryCount).toBe(4);
  });

  it('rejects data that is not a supported index', () => {
    createRepo();
    const index: Buffer = readIndex();
    expect(() => summarizeGitIndex(Buffer.from('not an index'), SHA1_OBJECT_ID_LENGTH)).toThrow(
      'The file is not a Git index'
    );
    expect(() => summarizeGitIndex(index.subarray(0, index.length - 30), SHA1_OBJECT_ID_LENGTH)).toThrow();

    const unsupportedIndex: Buffer = Buffer.from(index);
    unsupportedIndex.writeUInt32BE(5, 4);
    expect(() => summarizeGitIndex(unsupportedIndex, SHA1_OBJECT_ID_LENGTH)).toThrow(
      'Unsupported Git index version 5'
    );
  });

  it('rejects an entry count that the index is too short to hold, before allocating memory for it', () => {
    createRepo();
    const index: Buffer = readIndex();
    index.writeUInt32BE(0xffffffff, 8);
    const allocSpy: jest.SpyInstance = jest.spyOn(Buffer, 'alloc').mockImplementation(() => {
      throw new Error('Unexpected allocation');
    });
    try {
      expect(() => summarizeGitIndex(index, SHA1_OBJECT_ID_LENGTH)).toThrow(
        'The Git index ends within an entry'
      );
      expect(allocSpy).not.toHaveBeenCalled();
    } finally {
      allocSpy.mockRestore();
    }
  });
});

describe(tryGetGitIndexEntryCount.name, () => {
  it('reads the entry count from the header of an index', () => {
    const header: Buffer = Buffer.alloc(12);
    header.write('DIRC', 0, 'latin1');
    header.writeUInt32BE(2, 4);
    header.writeUInt32BE(236074, 8);
    expect(tryGetGitIndexEntryCount(header)).toBe(236074);
  });

  it('returns undefined for data that is not the header of an index', () => {
    expect(tryGetGitIndexEntryCount(Buffer.alloc(0))).toBeUndefined();
    expect(tryGetGitIndexEntryCount(Buffer.from('DIRC'))).toBeUndefined();
    expect(tryGetGitIndexEntryCount(Buffer.from('PACK\0\0\0\x02\0\0\0\x01'))).toBeUndefined();
  });
});

interface ITrace2Event {
  category?: string;
  key?: string;
  value?: string;
}

interface IFsmonitorState {
  token: string;
  changedEntries: number[];
}

function getSetBits(bits: Uint8Array): number[] {
  const setBits: number[] = [];
  bits.forEach((bit: number, index: number) => {
    if (bit) {
      setBits.push(index);
    }
  });
  return setBits;
}

function createBits(bitCount: number, setBits: ReadonlyArray<number>): Uint8Array {
  const bits: Uint8Array = new Uint8Array(bitCount);
  for (const bit of setBits) {
    bits[bit] = 1;
  }

  return bits;
}

function getRange(start: number, end: number): number[] {
  const range: number[] = [];
  for (let i: number = start; i < end; i++) {
    range.push(i);
  }

  return range;
}

describe(tryCarryOverGitIndexCaches.name, () => {
  const replacedSignatures: ReadonlySet<string> = new Set(['EOIE', 'IEOT', 'UNTR', 'FSMN']);
  let copyPath: string;
  let newCopyPath: string;

  function getExtension(
    content: Buffer,
    signature: string,
    objectIdLength: number = SHA1_OBJECT_ID_LENGTH
  ): Buffer | undefined {
    const extension: IGitIndexExtension | undefined = parseGitIndexLayout(
      content,
      objectIdLength
    ).extensions.find((candidate: IGitIndexExtension) => candidate.signature === signature);
    return extension && content.subarray(extension.start, extension.end);
  }

  function getRequiredExtension(content: Buffer, signature: string): Buffer {
    const extension: Buffer | undefined = getExtension(content, signature);
    if (!extension) {
      throw new Error(`The index has no "${signature}" extension`);
    }

    return extension;
  }

  function getSignatures(content: Buffer): string[] {
    return parseGitIndexLayout(content, SHA1_OBJECT_ID_LENGTH).extensions.map(
      ({ signature }: IGitIndexExtension) => signature
    );
  }

  // Inserts an extension before the checksum, without updating the checksum
  function insertExtension(content: Buffer, signature: string, data: Buffer): Buffer {
    const header: Buffer = Buffer.alloc(8);
    header.write(signature, 0, 'latin1');
    header.writeUInt32BE(data.length, 4);
    const checksumOffset: number = content.length - SHA1_OBJECT_ID_LENGTH;
    return Buffer.concat([
      content.subarray(0, checksumOffset),
      header,
      data,
      content.subarray(checksumOffset)
    ]);
  }

  // Git doesn't trust the recorded times of a file or folder that changed in the same second as the index was saved
  function settleWorkingTree(folderPath: string, time: number): void {
    for (const entry of fs.readdirSync(folderPath, { withFileTypes: true })) {
      if (entry.name !== '.git') {
        const entryPath: string = path.join(folderPath, entry.name);
        if (entry.isDirectory()) {
          settleWorkingTree(entryPath, time);
        }

        fs.utimesSync(entryPath, time, time);
      }
    }

    fs.utimesSync(folderPath, time, time);
  }

  // Creates a repository with untracked files, and a copy of its index in which Git saved the untracked cache
  function createRepoWithCopy(version: number, objectIdLength: number = SHA1_OBJECT_ID_LENGTH): void {
    createRepo(...(objectIdLength === SHA256_OBJECT_ID_LENGTH ? ['--object-format=sha256'] : []));
    // Git then saves the "EOIE" extension
    runGit('config', 'index.threads', 'true');
    setIndexVersion(version);
    writeFile('untracked.txt', 'untracked\n');
    writeFile('dir/untracked.txt', 'untracked\n');
    settleWorkingTree(repoPath, Math.floor(Date.now() / 1000) - 100);
    runGit('update-index', '--refresh');
    commit();
    fs.copyFileSync(getIndexPath(), copyPath);
    runGitWithIndex(copyPath, 'status', '--porcelain');
    expect(getExtension(fs.readFileSync(copyPath), 'UNTR', objectIdLength)).toBeDefined();
  }

  function stageModifiedFile(): void {
    writeFile('a.txt', 'modified\n');
    runGit('add', 'a.txt');
  }

  function carryOver(objectIdLength: number = SHA1_OBJECT_ID_LENGTH): Buffer {
    const content: Buffer | undefined = tryCarryOverGitIndexCaches(
      readIndex(),
      fs.readFileSync(copyPath),
      objectIdLength
    );
    if (!content) {
      throw new Error('The new copy did not keep the caches of the previous copy');
    }

    fs.writeFileSync(newCopyPath, content);
    return content;
  }

  // Runs "git status", and counts the folders that it read rather than finding their untracked files in the cache
  function getStatus(indexPath: string, ...configArgs: string[]): [string, number[]] {
    const tracePath: string = path.join(repoPath, '.git', 'trace2.json');
    const output: string = execFileSync('git', [...configArgs, 'status', '--porcelain'], {
      cwd: repoPath,
      env: {
        ...getGitEnvironment(),
        GIT_INDEX_FILE: indexPath,
        GIT_TRACE2_EVENT: tracePath,
        // Git reports the statistics of the untracked cache in a nested region
        GIT_TRACE2_EVENT_NESTING: '10'
      },
      encoding: 'utf8'
    });
    const events: ITrace2Event[] = fs
      .readFileSync(tracePath, 'utf8')
      .split('\n')
      .filter((line: string) => line)
      .map((line: string) => JSON.parse(line));
    fs.unlinkSync(tracePath);
    const openedFolderCounts: number[] = events
      .filter(({ category, key }: ITrace2Event) => category === 'read_directory' && key === 'opendir')
      .map(({ value }: ITrace2Event) => Number(value));
    return [output, openedFolderCounts];
  }

  beforeEach(() => {
    repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'git-index-file-test-'));
    copyPath = path.join(repoPath, '.git', 'copy');
    newCopyPath = path.join(repoPath, '.git', 'new-copy');
  });

  afterEach(() => {
    fs.rmSync(repoPath, { recursive: true, force: true });
  });

  it.each([2, 3, 4])(
    'keeps the untracked cache of the previous copy of a version %i index',
    (version: number) => {
      createRepoWithCopy(version);
      stageModifiedFile();
      writeFile('dir/b.txt', 'modified\n');
      const index: Buffer = readIndex();
      expect(getSignatures(index)).toContain('EOIE');

      const content: Buffer = carryOver();
      expect(getSignatures(content)).toEqual([
        ...getSignatures(index).filter((signature: string) => !replacedSignatures.has(signature)),
        'UNTR'
      ]);
      expect(getExtension(content, 'UNTR')).toEqual(getExtension(fs.readFileSync(copyPath), 'UNTR'));
      expect(content.subarray(-SHA1_OBJECT_ID_LENGTH)).toEqual(
        createHash('sha1').update(content.subarray(0, -SHA1_OBJECT_ID_LENGTH)).digest()
      );
      expect(runGitWithIndex(newCopyPath, 'ls-files', '--stage', '--debug')).toBe(
        runGit('ls-files', '--stage', '--debug')
      );
      const [output, openedFolderCounts] = getStatus(newCopyPath);
      expect(openedFolderCounts).toEqual([0]);
      expect(output).toBe(runGit('status', '--porcelain'));
      expect(output).toBe('M  a.txt\n M dir/b.txt\n?? dir/untracked.txt\n?? untracked.txt\n');
    }
  );

  it('keeps the untracked cache of the previous copy of the index of a SHA-256 repository', () => {
    createRepoWithCopy(4, SHA256_OBJECT_ID_LENGTH);
    stageModifiedFile();

    const content: Buffer = carryOver(SHA256_OBJECT_ID_LENGTH);
    expect(getExtension(content, 'UNTR', SHA256_OBJECT_ID_LENGTH)).toEqual(
      getExtension(fs.readFileSync(copyPath), 'UNTR', SHA256_OBJECT_ID_LENGTH)
    );
    expect(content.subarray(-SHA256_OBJECT_ID_LENGTH)).toEqual(
      createHash('sha256').update(content.subarray(0, -SHA256_OBJECT_ID_LENGTH)).digest()
    );
    expect(getStatus(newCopyPath)).toEqual([runGit('status', '--porcelain'), [0]]);
  });

  it('writes no checksum when Git writes none', () => {
    createRepoWithCopy(4);
    runGit('config', 'index.skipHash', 'true');
    stageModifiedFile();
    expect(readIndex().subarray(-SHA1_OBJECT_ID_LENGTH)).toEqual(Buffer.alloc(SHA1_OBJECT_ID_LENGTH));

    const content: Buffer = carryOver();
    expect(content.subarray(-SHA1_OBJECT_ID_LENGTH)).toEqual(Buffer.alloc(SHA1_OBJECT_ID_LENGTH));
    expect(getStatus(newCopyPath)).toEqual([runGit('status', '--porcelain'), [0]]);
  });

  it.each<[string, () => void, number]>([
    ['adds a file', () => runGit('add', 'untracked.txt'), 5],
    ['removes a file', () => runGit('rm', '--cached', '--quiet', 'a.txt'), 3],
    ['renames a file', () => runGit('mv', 'a.txt', 'e.txt'), 4],
    [
      'records another file in place of one',
      () => {
        runGit('rm', '--cached', '--quiet', 'a.txt');
        runGit('add', 'dir/untracked.txt');
      },
      4
    ],
    [
      'records a symbolic link in place of a file',
      () => {
        const objectId: string = runGit('rev-parse', 'HEAD:a.txt').trim();
        runGit('update-index', '--cacheinfo', `120000,${objectId},a.txt`);
      },
      4
    ],
    [
      'records a conflict in place of a file',
      () => {
        const objectId: string = runGit('rev-parse', 'HEAD:a.txt').trim();
        execFileSync('git', ['update-index', '--index-info'], {
          cwd: repoPath,
          env: getGitEnvironment(),
          input: `0 ${'0'.repeat(40)}\ta.txt\n100644 ${objectId} 1\ta.txt\n`
        });
      },
      4
    ]
  ])('returns undefined when the index %s', (description: string, change: () => void, entryCount: number) => {
    createRepoWithCopy(4);
    change();
    expect(tryGetGitIndexEntryCount(readIndex())).toBe(entryCount);
    expect(
      tryCarryOverGitIndexCaches(readIndex(), fs.readFileSync(copyPath), SHA1_OBJECT_ID_LENGTH)
    ).toBeUndefined();
  });

  it('returns undefined when the index and the previous copy have different versions', () => {
    createRepoWithCopy(4);
    runGit('update-index', '--index-version=2');
    expect(
      tryCarryOverGitIndexCaches(readIndex(), fs.readFileSync(copyPath), SHA1_OBJECT_ID_LENGTH)
    ).toBeUndefined();
  });

  it('returns undefined when the previous copy has no untracked cache', () => {
    createRepoWithCopy(4);
    runGitWithIndex(copyPath, '-c', 'core.untrackedCache=false', 'status', '--porcelain');
    const previousContent: Buffer = fs.readFileSync(copyPath);
    expect(getExtension(previousContent, 'UNTR')).toBeUndefined();
    stageModifiedFile();
    expect(tryCarryOverGitIndexCaches(readIndex(), previousContent, SHA1_OBJECT_ID_LENGTH)).toBeUndefined();
  });

  it('keeps the extensions of the index that Git may ignore, but not those that it must understand', () => {
    createRepoWithCopy(4);
    stageModifiedFile();
    const index: Buffer = insertExtension(readIndex(), 'ZZZZ', Buffer.from('data'));
    const previousContent: Buffer = fs.readFileSync(copyPath);
    const content: Buffer | undefined = tryCarryOverGitIndexCaches(
      index,
      previousContent,
      SHA1_OBJECT_ID_LENGTH
    );
    expect(content && getSignatures(content)).toEqual(['TREE', 'ZZZZ', 'UNTR']);
    expect(content && getExtension(content, 'ZZZZ')).toEqual(getExtension(index, 'ZZZZ'));

    // The extensions of a split index and of a sparse index
    for (const signature of ['link', 'sdir']) {
      const extensionData: Buffer = Buffer.alloc(signature === 'link' ? SHA1_OBJECT_ID_LENGTH : 0);
      expect(
        tryCarryOverGitIndexCaches(
          insertExtension(index, signature, extensionData),
          previousContent,
          SHA1_OBJECT_ID_LENGTH
        )
      ).toBeUndefined();
      expect(
        tryCarryOverGitIndexCaches(
          index,
          insertExtension(previousContent, signature, extensionData),
          SHA1_OBJECT_ID_LENGTH
        )
      ).toBeUndefined();
    }
  });

  it('throws when the previous copy is not an index', () => {
    createRepoWithCopy(4);
    const previousContent: Buffer = fs.readFileSync(copyPath);
    expect(() =>
      tryCarryOverGitIndexCaches(readIndex(), previousContent.subarray(0, 100), SHA1_OBJECT_ID_LENGTH)
    ).toThrow('The Git index ends within an entry');
  });

  if (process.platform !== 'win32') {
    describe('with a file system monitor', () => {
      let hook: IFsmonitorHook;

      function runGitWithFsmonitor(indexPath: string, ...args: string[]): string {
        return runGitWithIndex(indexPath, '-c', `core.fsmonitor=${hook.hookPath}`, ...args);
      }

      function readFsmonitorState(content: Buffer): IFsmonitorState {
        const data: Buffer = getRequiredExtension(content, 'FSMN').subarray(8);
        expect(data.readUInt32BE(0)).toBe(2);
        const tokenEnd: number = data.indexOf(0, 4);
        const bitmap: Buffer = data.subarray(tokenEnd + 5);
        expect(bitmap.length).toBe(data.readUInt32BE(tokenEnd + 1));
        const bits: Uint8Array | undefined = tryReadEwahBitmap(bitmap, content.readUInt32BE(8));
        return {
          token: data.toString('latin1', 4, tokenEnd),
          changedEntries: bits ? getSetBits(bits) : []
        };
      }

      function modifyFile(relativePath: string): void {
        writeFile(relativePath, 'modified\n');
        hook.logChange(relativePath);
      }

      it('keeps the token of the previous copy, and marks the entries that differ from it as changed', () => {
        createRepoWithCopy(4);
        hook = createFsmonitorHook(path.join(repoPath, '.git'));
        // Git asks the hook for every change, since the copy has no token, and then saves the token of the hook
        runGitWithFsmonitor(copyPath, 'status', '--porcelain');
        runGitWithFsmonitor(copyPath, 'update-index', '--no-fsmonitor-valid', 'dir/b.txt');
        expect(readFsmonitorState(fs.readFileSync(copyPath))).toEqual({ token: 't:0', changedEntries: [1] });

        modifyFile('a.txt');
        runGit('add', 'a.txt');
        const content: Buffer = carryOver();
        expect(readFsmonitorState(content)).toEqual({ token: 't:0', changedEntries: [0, 1] });
        // Git lists the entries that the file system monitor considers unchanged in lowercase
        expect(runGitWithFsmonitor(newCopyPath, 'ls-files', '-f')).toBe(
          `H a.txt\nH dir/b.txt\nh dir/sub/c.txt\nh ${LONG_FILE_PATH}\n`
        );
        expect(getStatus(newCopyPath, '-c', `core.fsmonitor=${hook.hookPath}`)[0]).toBe(
          runGit('status', '--porcelain')
        );
      });

      it('reads and writes runs of entries that are all marked as changed', () => {
        const filePaths: string[] = getRange(0, 200).map(
          (index: number) => `f/${String(index).padStart(3, '0')}`
        );
        for (const filePath of filePaths) {
          writeFile(filePath, `${filePath}\n`);
        }

        createRepoWithCopy(4);
        hook = createFsmonitorHook(path.join(repoPath, '.git'));
        runGitWithFsmonitor(copyPath, 'status', '--porcelain');
        runGitWithFsmonitor(copyPath, 'update-index', '--no-fsmonitor-valid', ...filePaths);
        const previousContent: Buffer = fs.readFileSync(copyPath);
        const previousState: IFsmonitorState = readFsmonitorState(previousContent);
        expect(previousState).toEqual({ token: 't:0', changedEntries: getRange(4, 204) });

        modifyFile('a.txt');
        runGit('add', 'a.txt');
        const content: Buffer = carryOver();
        const state: IFsmonitorState = readFsmonitorState(content);
        expect(state).toEqual({ token: 't:0', changedEntries: [0, ...getRange(4, 204)] });
        // Git compresses runs of words whose bits are all set, but the new copy doesn't
        expect(getRequiredExtension(content, 'FSMN').length).toBeGreaterThan(
          getRequiredExtension(previousContent, 'FSMN').length
        );
        expect(runGitWithFsmonitor(newCopyPath, 'ls-files', '-f')).toBe(
          [
            'H a.txt',
            'h dir/b.txt',
            'h dir/sub/c.txt',
            `h ${LONG_FILE_PATH}`,
            ...filePaths.map((filePath: string) => `H ${filePath}`),
            ''
          ].join('\n')
        );
      });

      it('keeps the token of the previous copy rather than that of the index', () => {
        createRepoWithCopy(4);
        hook = createFsmonitorHook(path.join(repoPath, '.git'));
        runGitWithFsmonitor(copyPath, 'status', '--porcelain');
        // Git saves the index with a later token, after the untracked file was created
        writeFile('dir/new.txt', 'new\n');
        hook.logChange('dir/new.txt');
        runGitWithFsmonitor(getIndexPath(), 'status', '--porcelain');
        modifyFile('a.txt');
        runGitWithFsmonitor(getIndexPath(), 'add', 'a.txt');
        expect(readFsmonitorState(readIndex()).token).toBe('t:2');

        const content: Buffer = carryOver();
        expect(readFsmonitorState(content).token).toBe('t:0');
        const [output] = getStatus(newCopyPath, '-c', `core.fsmonitor=${hook.hookPath}`);
        expect(output).toBe(runGitWithFsmonitor(getIndexPath(), 'status', '--porcelain'));
        expect(output).toContain('?? dir/new.txt\n');
      });

      it('drops the state of the file system monitor of the index', () => {
        createRepoWithCopy(4);
        hook = createFsmonitorHook(path.join(repoPath, '.git'));
        modifyFile('a.txt');
        runGitWithFsmonitor(getIndexPath(), 'add', 'a.txt');
        expect(getExtension(readIndex(), 'FSMN')).toBeDefined();

        expect(getExtension(carryOver(), 'FSMN')).toBeUndefined();
      });

      it('returns undefined when the state of the file system monitor of the previous copy is malformed', () => {
        createRepoWithCopy(4);
        hook = createFsmonitorHook(path.join(repoPath, '.git'));
        runGitWithFsmonitor(copyPath, 'status', '--porcelain');
        stageModifiedFile();
        const previousContent: Buffer = fs.readFileSync(copyPath);
        expect(tryCarryOverGitIndexCaches(readIndex(), previousContent, SHA1_OBJECT_ID_LENGTH)).toBeDefined();

        // An unknown version
        const malformedContent: Buffer = Buffer.from(previousContent);
        const extensionOffset: number = previousContent.indexOf(
          getRequiredExtension(previousContent, 'FSMN')
        );
        malformedContent.writeUInt32BE(3, extensionOffset + 8);
        expect(
          tryCarryOverGitIndexCaches(readIndex(), malformedContent, SHA1_OBJECT_ID_LENGTH)
        ).toBeUndefined();
      });
    });
  }
});

describe(writeEwahBitmap.name, () => {
  it('writes an empty bitmap as Git does', () => {
    expect(writeEwahBitmap(new Uint8Array(3)).toString('hex')).toBe(
      ['00000000', '00000001', '0000000000000000', '00000000'].join('')
    );
  });

  it('writes a bitmap as Git does', () => {
    // As Git saved it for an index of 4 entries, in which it marked the second entry as changed
    expect(writeEwahBitmap(createBits(4, [1])).toString('hex')).toBe(
      ['00000002', '00000002', '0000000200000000', '0000000000000002', '00000000'].join('')
    );
  });

  it('compresses runs of words that are 0', () => {
    const bits: Uint8Array = createBits(100000, [5, 99999]);
    const data: Buffer = writeEwahBitmap(bits);
    // A marker and a literal word, then a marker for the run and a literal word
    expect(data.length).toBe(8 + 4 * 8 + 4);
    expect(tryReadEwahBitmap(data, bits.length)).toEqual(bits);
  });

  it('writes bitmaps that it reads back', () => {
    let seed: number = 1;
    for (const bitCount of [1, 31, 32, 63, 64, 65, 200, 5000]) {
      for (const density of [0, 0.01, 0.5, 0.99, 1]) {
        const bits: Uint8Array = new Uint8Array(bitCount);
        for (let i: number = 0; i < bitCount; i++) {
          seed = (seed * 1103515245 + 12345) % 2 ** 31;
          bits[i] = seed / 2 ** 31 < density ? 1 : 0;
        }

        expect(tryReadEwahBitmap(writeEwahBitmap(bits), bitCount)).toEqual(bits);
      }
    }
  });
});

describe(tryReadEwahBitmap.name, () => {
  it('reads runs of words whose bits are all set', () => {
    // As Git saved it for an index of 132 entries, in which it marked every entry as changed
    const data: Buffer = Buffer.from(
      ['00000084', '00000002', '0000000200000005', '000000000000000f', '00000000'].join(''),
      'hex'
    );
    expect(tryReadEwahBitmap(data, 132)).toEqual(new Uint8Array(132).fill(1));
    expect(tryReadEwahBitmap(data, 131)).toBeUndefined();
  });

  it('rejects a malformed bitmap', () => {
    const data: Buffer = writeEwahBitmap(createBits(4, [1]));
    expect(tryReadEwahBitmap(data, 4)).toEqual(createBits(4, [1]));
    expect(tryReadEwahBitmap(data.subarray(0, 4), 4)).toBeUndefined();
    expect(tryReadEwahBitmap(data.subarray(0, data.length - 1), 4)).toBeUndefined();

    // A bit beyond the size of the bitmap
    const bitBeyondSize: Buffer = Buffer.from(data);
    bitBeyondSize.writeUInt32BE(1, 0);
    expect(tryReadEwahBitmap(bitBeyondSize, 4)).toBeUndefined();

    // More literal words than the bitmap has
    const missingLiteralWord: Buffer = Buffer.from(data);
    missingLiteralWord.writeUInt32BE(4, 8);
    expect(tryReadEwahBitmap(missingLiteralWord, 4)).toBeUndefined();

    // A run of words whose bits are all set, beyond the size of the bitmap
    const runBeyondSize: Buffer = Buffer.from(
      ['00000004', '00000001', '0000000000000003', '00000000'].join(''),
      'hex'
    );
    expect(tryReadEwahBitmap(runBeyondSize, 64)).toBeUndefined();
  });
});
