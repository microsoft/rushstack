// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import * as getRepoState from '../getRepoState';
import type { IDetailedRepoState } from '../getRepoState';
import { RepoStateCache } from '../RepoStateCache';

// Each test makes its repository in the temp folder of the package
const TEST_FOLDER_PATH: string = path.resolve(__dirname, '../../temp/test/UnhashablePaths');
const PIPE_OPEN_INTERVAL_MS: number = 1000;

const itUnlessWindows: jest.It = process.platform === 'win32' ? it.skip : it;
const itOnLinux: jest.It = process.platform === 'linux' ? it : it.skip;

function getGitEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  delete environment.GIT_DIR;
  delete environment.GIT_WORK_TREE;
  delete environment.GIT_INDEX_FILE;
  delete environment.GIT_OPTIONAL_LOCKS;
  return environment;
}

interface IComparableState {
  hasSubmodules: boolean;
  hasUncommittedChanges: boolean;
  files: [string, string][];
  symlinks: [string, string][];
}

function toComparable(state: IDetailedRepoState): IComparableState {
  return {
    hasSubmodules: state.hasSubmodules,
    hasUncommittedChanges: state.hasUncommittedChanges,
    files: Array.from(state.files),
    symlinks: Array.from(state.symlinks)
  };
}

describe('paths that "git hash-object" cannot hash', () => {
  let testCount: number = 0;
  let testFolderPath: string;
  let repoPath: string;

  function runGit(...args: string[]): string {
    return execFileSync('git', ['-c', 'core.fsmonitor=false', ...args], {
      cwd: repoPath,
      env: getGitEnvironment(),
      encoding: 'utf8',
      stdio: 'pipe'
    });
  }

  function writeFile(relativePath: string, content: string): void {
    const filePath: string = path.join(repoPath, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  function createSymbolicLink(target: string | Buffer, relativePath: string): void {
    fs.symlinkSync(target, path.join(repoPath, relativePath));
  }

  function commit(): void {
    runGit('add', '--all');
    runGit('commit', '--quiet', '-m', 'Commit');
  }

  // The object that the index records for the path
  function getStagedObject(relativePath: string): string {
    return runGit('rev-parse', `:${relativePath}`).trim();
  }

  // The object that "git add" records for the path
  function addAndGetStagedObject(relativePath: string): string {
    runGit('add', '--force', '--', relativePath);
    return getStagedObject(relativePath);
  }

  // Gets the state both without and with the cache, and checks that they are the same
  async function getStateAsync(additionalRelativePathsToHash?: string[]): Promise<IDetailedRepoState> {
    const state: IDetailedRepoState = await getRepoState.getDetailedRepoStateAsync(
      repoPath,
      additionalRelativePathsToHash
    );
    const cache: RepoStateCache = new RepoStateCache({
      rootDirectory: repoPath,
      temporaryFolderPath: testFolderPath
    });
    const uncachedSpy: jest.SpyInstance = jest.spyOn(getRepoState, 'getDetailedRepoStateAsync');
    try {
      const cachedState: IDetailedRepoState = await cache.getDetailedRepoStateAsync(
        additionalRelativePathsToHash
      );
      // The cache used its copy of the index, rather than falling back to the state without the cache
      expect(uncachedSpy).not.toHaveBeenCalled();
      expect(toComparable(cachedState)).toEqual(toComparable(state));
    } finally {
      uncachedSpy.mockRestore();
      cache.dispose();
    }

    return state;
  }

  async function expectStagedObjectsAsync(...relativePaths: string[]): Promise<void> {
    const state: IDetailedRepoState = await getStateAsync();
    expect(state.hasUncommittedChanges).toBe(true);
    for (const relativePath of relativePaths) {
      expect(state.files.get(relativePath)).toEqual(getStagedObject(relativePath));
      expect(state.symlinks.has(relativePath)).toBe(false);
    }
  }

  async function expectLinkTextObjectAsync(
    relativePath: string,
    additionalRelativePathsToHash?: string[]
  ): Promise<void> {
    const state: IDetailedRepoState = await getStateAsync(additionalRelativePathsToHash);
    expect(state.files.get(relativePath)).toEqual(addAndGetStagedObject(relativePath));
    expect(state.symlinks.has(relativePath)).toBe(false);
  }

  beforeEach(() => {
    testFolderPath = path.join(TEST_FOLDER_PATH, `${++testCount}`);
    fs.rmSync(testFolderPath, { recursive: true, force: true });
    fs.mkdirSync(path.join(testFolderPath, 'repo'), { recursive: true });
    repoPath = fs.realpathSync(path.join(testFolderPath, 'repo'));
    runGit('init', '--quiet');
    runGit('config', 'user.name', 'Test');
    runGit('config', 'user.email', 'test@example.com');
    runGit('config', 'commit.gpgSign', 'false');
    runGit('config', 'core.fsmonitor', 'false');
    runGit('config', 'maintenance.auto', 'false');
    writeFile('a.txt', 'a\n');
    commit();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(testFolderPath, { recursive: true, force: true });
  });

  it('uses the staged object of a file that a sparse checkout leaves out of the working tree', async () => {
    writeFile('docs/readme.md', 'committed\n');
    commit();
    writeFile('docs/readme.md', 'staged\n');
    commit();
    runGit('sparse-checkout', 'set', '--no-cone', '/*', '!/docs/');
    runGit('reset', '--quiet', '--soft', 'HEAD~1');
    expect(fs.existsSync(path.join(repoPath, 'docs/readme.md'))).toBe(false);

    await expectStagedObjectsAsync('docs/readme.md');
  });

  it('uses the staged object of a deleted file that the index marks "assume unchanged"', async () => {
    writeFile('a.txt', 'staged\n');
    runGit('add', 'a.txt');
    runGit('update-index', '--assume-unchanged', 'a.txt');
    fs.unlinkSync(path.join(repoPath, 'a.txt'));

    await expectStagedObjectsAsync('a.txt');
  });

  it('uses the staged object of a deleted file that the index marks "skip worktree"', async () => {
    writeFile('a.txt', 'staged\n');
    runGit('add', 'a.txt');
    runGit('update-index', '--skip-worktree', 'a.txt');
    fs.unlinkSync(path.join(repoPath, 'a.txt'));

    await expectStagedObjectsAsync('a.txt');
  });

  it('uses the staged object of a staged file that is on disk', async () => {
    writeFile('a.txt', 'staged\n');
    writeFile('b.txt', 'added\n');
    runGit('add', 'a.txt', 'b.txt');

    await expectStagedObjectsAsync('a.txt', 'b.txt');
  });

  it('uses the staged object of an "assume unchanged" file that changed on disk after it was staged', async () => {
    writeFile('a.txt', 'staged\n');
    runGit('add', 'a.txt');
    runGit('update-index', '--assume-unchanged', 'a.txt');
    writeFile('a.txt', 'changed after it was staged\n');
    expect(runGit('hash-object', '--', 'a.txt').trim()).not.toEqual(getStagedObject('a.txt'));

    await expectStagedObjectsAsync('a.txt');
  });

  itUnlessWindows('keeps a staged symbolic link in symlinks, with its staged object', async () => {
    createSymbolicLink('a.txt', 'link');
    runGit('add', 'link');

    const state: IDetailedRepoState = await getStateAsync();
    expect(state.symlinks.get('link')).toEqual(getStagedObject('link'));
    expect(state.files.has('link')).toBe(false);
  });

  itUnlessWindows('hashes the text of an untracked symbolic link whose target is missing', async () => {
    createSymbolicLink('missing.txt', 'link');

    await expectLinkTextObjectAsync('link');
  });

  itUnlessWindows('hashes the text of an untracked symbolic link to a folder', async () => {
    writeFile('folder/b.txt', 'b\n');
    commit();
    createSymbolicLink('folder', 'link');

    await expectLinkTextObjectAsync('link');
  });

  itUnlessWindows(
    'hashes the text of a symbolic link, whose target is missing, that replaced a tracked file',
    async () => {
      fs.unlinkSync(path.join(repoPath, 'a.txt'));
      createSymbolicLink('missing.txt', 'a.txt');

      await expectLinkTextObjectAsync('a.txt');
    }
  );

  itUnlessWindows('hashes the text of a symbolic link that points to itself', async () => {
    createSymbolicLink('link', 'link');

    await expectLinkTextObjectAsync('link');
  });

  itOnLinux('hashes the text of a symbolic link to a named pipe', async () => {
    const pipePath: string = path.join(testFolderPath, 'pipe');
    execFileSync('mkfifo', [pipePath]);
    createSymbolicLink('../pipe', 'link');
    // Reading the pipe waits for a writer. Open the pipe for writing from time to time, without waiting for a reader,
    // so that a reader reads nothing instead of waiting forever.
    const interval: NodeJS.Timeout = setInterval(() => {
      try {
        // eslint-disable-next-line no-bitwise
        fs.closeSync(fs.openSync(pipePath, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK));
      } catch {
        // Nothing is reading the pipe
      }
    }, PIPE_OPEN_INTERVAL_MS);
    try {
      await expectLinkTextObjectAsync('link');
    } finally {
      clearInterval(interval);
    }
  });

  itOnLinux('hashes the bytes of a symbolic link whose text is not UTF-8', async () => {
    createSymbolicLink(Buffer.concat([Buffer.from('missing-'), Buffer.from([0xff]), Buffer.from('.txt')]), 'link');

    await expectLinkTextObjectAsync('link');
  });

  itUnlessWindows(
    'hashes the text of an additional path that is a symbolic link whose target is missing',
    async () => {
      writeFile('.gitignore', 'ignored/\n');
      commit();
      fs.mkdirSync(path.join(repoPath, 'ignored'));
      createSymbolicLink('missing.txt', 'ignored/link');

      await expectLinkTextObjectAsync('ignored/link', ['ignored/link']);
    }
  );

  itUnlessWindows('still hashes an untracked symbolic link to a file through to the file', async () => {
    createSymbolicLink('a.txt', 'link');

    const state: IDetailedRepoState = await getStateAsync();
    expect(state.files.get('link')).toEqual(getStagedObject('a.txt'));
    expect(state.symlinks.has('link')).toBe(false);
  });

  itUnlessWindows('keeps the same order of paths in both implementations', async () => {
    writeFile('.gitignore', 'ignored/\n');
    commit();
    createSymbolicLink('missing.txt', 'a-link');
    writeFile('b.txt', 'b\n');
    writeFile('ignored/y.txt', 'y\n');
    createSymbolicLink('missing.txt', 'ignored/z-link');

    const newPaths: string[] = ['ignored/z-link', 'ignored/y.txt', 'a-link', 'b.txt'];
    const state: IDetailedRepoState = await getStateAsync(['ignored/z-link', 'ignored/y.txt']);
    expect(Array.from(state.files.keys())).toEqual(['.gitignore', 'a.txt', ...newPaths]);
    for (const newPath of newPaths) {
      expect(state.files.get(newPath)).toEqual(addAndGetStagedObject(newPath));
    }
  });

  itUnlessWindows('still drops a tracked symbolic link that changed', async () => {
    createSymbolicLink('a.txt', 'link');
    commit();
    fs.unlinkSync(path.join(repoPath, 'link'));
    createSymbolicLink('missing.txt', 'link');

    const state: IDetailedRepoState = await getStateAsync();
    expect(state.hasUncommittedChanges).toBe(true);
    expect(state.files.has('link')).toBe(false);
    expect(state.symlinks.has('link')).toBe(false);
  });
});
