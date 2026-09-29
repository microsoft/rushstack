// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { type IGitIndexSummary, summarizeGitIndex, tryGetGitIndexEntryCount } from '../GitIndexFile';

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

describe(summarizeGitIndex.name, () => {
  let repoPath: string;

  function runGit(...args: string[]): string {
    return execFileSync('git', args, { cwd: repoPath, env: getGitEnvironment(), encoding: 'utf8' });
  }

  function writeFile(relativePath: string, content: string): void {
    const filePath: string = path.join(repoPath, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  function readIndex(): Buffer {
    return fs.readFileSync(path.join(repoPath, '.git', 'index'));
  }

  function summarize(objectIdLength: number = SHA1_OBJECT_ID_LENGTH): IGitIndexSummary {
    return summarizeGitIndex(readIndex(), objectIdLength);
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

  // Git writes a version 3 index only if an entry has extended flags, and writes a version 2 index otherwise
  function setIndexVersion(version: number): void {
    if (version === 3) {
      runGit('update-index', '--skip-worktree', LONG_FILE_PATH);
    }

    runGit('update-index', `--index-version=${version}`);
    expect(readIndex().readUInt32BE(4)).toBe(version);
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
    runGit('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'Initial');
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
    runGit('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'Initial');
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
