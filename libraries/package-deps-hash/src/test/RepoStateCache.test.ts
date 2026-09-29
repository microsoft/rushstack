// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type ChildProcess, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Executable, type IExecutableSpawnOptions } from '@rushstack/node-core-library';

import * as GitIndexFile from '../GitIndexFile';
import { getDetailedRepoStateAsync, type IDetailedRepoState } from '../getRepoState';
import { RepoStateCache } from '../RepoStateCache';
import { createFsmonitorHook, type IFsmonitorHook } from './FsmonitorHook';

const originalDateNow: () => number = Date.now;
const originalSpawn: typeof Executable.spawn = Executable.spawn;

function getGitEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  delete environment.GIT_DIR;
  delete environment.GIT_WORK_TREE;
  delete environment.GIT_INDEX_FILE;
  // Let "git status" save the index that it refreshes
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

interface IGitCommand {
  command: string | undefined;
  usesPrivateIndex: boolean;
}

interface ITrace2Event {
  category?: string;
  key?: string;
  value?: string;
}

function getExtension(content: Buffer, signature: string): Buffer | undefined {
  const extension: GitIndexFile.IGitIndexExtension | undefined = GitIndexFile.parseGitIndexLayout(
    content,
    20
  ).extensions.find((candidate: GitIndexFile.IGitIndexExtension) => candidate.signature === signature);
  return extension && content.subarray(extension.start, extension.end);
}

// Sets environment variables, and returns a function that restores their previous values
function setEnvironmentVariables(variables: Record<string, string>): () => void {
  const previousValues: [string, string | undefined][] = Object.keys(variables).map((name: string) => [
    name,
    process.env[name]
  ]);
  Object.assign(process.env, variables);
  return () => {
    for (const [name, value] of previousValues) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  };
}

function getGitCommand(
  args: ReadonlyArray<string>,
  options: IExecutableSpawnOptions | undefined
): IGitCommand {
  let command: string | undefined;
  for (let i: number = 0; i < args.length && !command; i++) {
    if (args[i] === '-c') {
      // Skip the value of a configuration option
      i++;
    } else if (!args[i].startsWith('-')) {
      command = args[i];
    }
  }

  return { command, usesPrivateIndex: !!options?.environment?.GIT_INDEX_FILE };
}

describe(RepoStateCache.name, () => {
  let repoPath: string;
  let temporaryFolderPath: string;
  let cache: RepoStateCache;
  let gitCommands: IGitCommand[];
  let isRecordingGitCommands: boolean;
  let beforeSpawn: ((gitCommand: IGitCommand) => void) | undefined;
  let afterSpawn: ((gitCommand: IGitCommand, childProcess: ChildProcess) => void) | undefined;

  function runGit(...args: string[]): string {
    return execFileSync('git', args, { cwd: repoPath, env: getGitEnvironment(), encoding: 'utf8' });
  }

  function writeFile(relativePath: string, content: string): void {
    const filePath: string = path.join(repoPath, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  function commit(): void {
    runGit('add', '--all');
    runGit('commit', '--quiet', '--allow-empty', '-m', 'Commit');
  }

  function getPrivateIndexPath(): string {
    const [folderName] = fs.readdirSync(temporaryFolderPath);
    return path.join(temporaryFolderPath, folderName, 'index');
  }

  // Treat every file as settled, so that the cache memoizes the hashes of files that just changed
  function settleFiles(): void {
    jest.spyOn(Date, 'now').mockImplementation(() => originalDateNow() + 10000);
  }

  // Treat every file as changed recently, however slowly the test runs
  function unsettleFiles(): void {
    jest.spyOn(Date, 'now').mockImplementation(() => originalDateNow() - 60000);
  }

  // Changes the recorded times of a file, but not its content, so that "git status" saves the refreshed index
  function touchSettledFile(relativePath: string): void {
    const time: number = Math.floor(originalDateNow() / 1000) - 100;
    fs.utimesSync(path.join(repoPath, relativePath), time, time);
  }

  function takeGitCommands(): IGitCommand[] {
    const commands: IGitCommand[] = gitCommands;
    gitCommands = [];
    return commands;
  }

  // The commands that the cache ran, sorted, since some run concurrently
  function takeGitCommandNames(): (string | undefined)[] {
    return takeGitCommands()
      .map(({ command }: IGitCommand) => command)
      .sort();
  }

  function takeUsesPrivateIndex(): boolean {
    return takeGitCommands().some(({ usesPrivateIndex }: IGitCommand) => usesPrivateIndex);
  }

  async function getStateAsync(
    additionalRelativePathsToHash?: string[],
    filterPath?: string[]
  ): Promise<IDetailedRepoState> {
    return await cache.getDetailedRepoStateAsync(additionalRelativePathsToHash, filterPath);
  }

  async function expectUncachedStateAsync(
    state: IDetailedRepoState,
    additionalRelativePathsToHash?: string[],
    filterPath?: string[]
  ): Promise<void> {
    isRecordingGitCommands = false;
    try {
      const expected: IDetailedRepoState = await getDetailedRepoStateAsync(
        repoPath,
        additionalRelativePathsToHash,
        undefined,
        filterPath
      );
      expect(toComparable(state)).toEqual(toComparable(expected));
    } finally {
      isRecordingGitCommands = true;
    }
  }

  beforeEach(() => {
    repoPath = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'repo-state-cache-test-')));
    temporaryFolderPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-state-cache-private-'));
    runGit('init', '--quiet');
    runGit('config', 'user.name', 'Test');
    runGit('config', 'user.email', 'test@example.com');
    runGit('config', 'commit.gpgSign', 'false');
    runGit('config', 'core.fsmonitor', 'false');
    runGit('config', 'core.untrackedCache', 'true');
    runGit('config', 'maintenance.auto', 'false');
    writeFile('a.txt', 'a\n');
    writeFile('b.txt', 'b\n');
    writeFile('dir/c.txt', 'c\n');
    commit();

    cache = new RepoStateCache({ rootDirectory: repoPath, temporaryFolderPath });
    gitCommands = [];
    isRecordingGitCommands = true;
    beforeSpawn = undefined;
    afterSpawn = undefined;
    jest
      .spyOn(Executable, 'spawn')
      .mockImplementation((filename: string, args: string[], options?: IExecutableSpawnOptions) => {
        const gitCommand: IGitCommand = getGitCommand(args, options);
        beforeSpawn?.(gitCommand);
        if (isRecordingGitCommands) {
          gitCommands.push(gitCommand);
        }

        const childProcess: ChildProcess = originalSpawn.call(Executable, filename, args, options);
        afterSpawn?.(gitCommand, childProcess);
        return childProcess;
      });
  });

  afterEach(() => {
    cache.dispose();
    jest.restoreAllMocks();
    fs.rmSync(repoPath, { recursive: true, force: true });
    fs.rmSync(temporaryFolderPath, { recursive: true, force: true });
  });

  it('returns the same state as getDetailedRepoStateAsync, and the same object while nothing changes', async () => {
    writeFile('a.txt', 'modified\n');
    writeFile('untracked.txt', 'untracked\n');
    settleFiles();

    const state: IDetailedRepoState = await getStateAsync(['untracked.txt']);
    expect(
      takeGitCommands()
        .map(({ command, usesPrivateIndex }: IGitCommand) => `${command} ${usesPrivateIndex}`)
        .sort()
    ).toEqual(['hash-object false', 'hash-object false', 'ls-files true', 'rev-parse false', 'status true']);
    await expectUncachedStateAsync(state, ['untracked.txt']);
    expect(state.hasUncommittedChanges).toBe(true);

    await expect(getStateAsync(['untracked.txt'])).resolves.toBe(state);
    expect(takeGitCommandNames()).toEqual(['status']);
  });

  it('follows changes to the working tree', async () => {
    let previousState: IDetailedRepoState = await getStateAsync();
    await expectUncachedStateAsync(previousState);
    expect(previousState.hasUncommittedChanges).toBe(false);

    const changes: (() => void)[] = [
      () => writeFile('a.txt', 'modified\n'),
      () => writeFile('a.txt', 'modified again\n'),
      () => writeFile('new.txt', 'new\n'),
      () => fs.unlinkSync(path.join(repoPath, 'b.txt')),
      () => runGit('checkout', '--', 'b.txt'),
      () => fs.unlinkSync(path.join(repoPath, 'new.txt')),
      () => runGit('checkout', '--', 'a.txt')
    ];
    for (const change of changes) {
      change();
      const state: IDetailedRepoState = await getStateAsync();
      await expectUncachedStateAsync(state);
      expect(state).not.toBe(previousState);
      previousState = state;
    }

    expect(previousState.hasUncommittedChanges).toBe(false);
  });

  it('hashes a file that changed recently each time', async () => {
    unsettleFiles();
    writeFile('a.txt', 'modified\n');
    await getStateAsync();
    takeGitCommands();

    // The file may change again without changing its stamp
    await getStateAsync();
    expect(takeGitCommandNames()).toEqual(['hash-object', 'status']);
  });

  it('hashes a settled file only while its stamp changes', async () => {
    settleFiles();
    writeFile('a.txt', 'modified\n');
    writeFile('untracked.txt', 'untracked\n');
    await getStateAsync(['untracked.txt']);
    takeGitCommands();

    await getStateAsync(['untracked.txt']);
    expect(takeGitCommandNames()).toEqual(['status']);

    writeFile('untracked.txt', 'untracked and modified\n');
    const state: IDetailedRepoState = await getStateAsync(['untracked.txt']);
    expect(takeGitCommandNames()).toEqual(['hash-object', 'status']);
    await expectUncachedStateAsync(state, ['untracked.txt']);
  });

  it('hashes a file that changed recently again even when its stamp stays the same', async () => {
    settleFiles();
    writeFile('untracked.txt', 'one\n');
    const filePath: string = path.join(repoPath, 'untracked.txt');
    // Only this file changed recently. Its stamp stays the same when it changes again, as it can when the file
    // changes twice within the granularity of the file times.
    const recentTimeNs: bigint = BigInt(Date.now()) * BigInt(1e6);
    const recentStats: fs.BigIntStats = Object.create(fs.lstatSync(filePath, { bigint: true }), {
      mtimeNs: { value: recentTimeNs },
      ctimeNs: { value: recentTimeNs }
    });
    const lstatAsync: typeof fs.promises.lstat = fs.promises.lstat;
    jest
      .spyOn(fs.promises, 'lstat')
      .mockImplementation(async (lstatPath: fs.PathLike, options?: fs.StatOptions) =>
        lstatPath === filePath ? recentStats : await lstatAsync(lstatPath, options)
      );
    await getStateAsync(['untracked.txt']);

    writeFile('untracked.txt', 'two\n');
    takeGitCommands();
    const state: IDetailedRepoState = await getStateAsync(['untracked.txt']);
    expect(takeGitCommandNames()).toEqual(['hash-object', 'hash-object', 'status']);
    expect(state.files.get('untracked.txt')).toBe(hashText('two\n'));
  });

  it('hashes a file that changed recently again even when only its change time is recent', async () => {
    settleFiles();
    writeFile('untracked.txt', 'one\n');
    const filePath: string = path.join(repoPath, 'untracked.txt');
    // As after a write that put back the modification time of the file. The stamp stays the same when the file
    // changes again within the granularity of the file times.
    const recentTimeNs: bigint = BigInt(Date.now()) * BigInt(1e6);
    const oldTimeNs: bigint = BigInt(originalDateNow() - 100000) * BigInt(1e6);
    const recentStats: fs.BigIntStats = Object.create(fs.lstatSync(filePath, { bigint: true }), {
      mtimeNs: { value: oldTimeNs },
      ctimeNs: { value: recentTimeNs }
    });
    const lstatAsync: typeof fs.promises.lstat = fs.promises.lstat;
    jest
      .spyOn(fs.promises, 'lstat')
      .mockImplementation(async (lstatPath: fs.PathLike, options?: fs.StatOptions) =>
        lstatPath === filePath ? recentStats : await lstatAsync(lstatPath, options)
      );
    await getStateAsync(['untracked.txt']);

    writeFile('untracked.txt', 'two\n');
    takeGitCommands();
    const state: IDetailedRepoState = await getStateAsync(['untracked.txt']);
    expect(takeGitCommandNames()).toEqual(['hash-object', 'hash-object', 'status']);
    expect(state.files.get('untracked.txt')).toBe(hashText('two\n'));
  });

  it('hashes a settled file again when it changes at the same size and its modification time is put back', async () => {
    settleFiles();
    const filePath: string = path.join(repoPath, 'untracked.txt');
    const time: number = Math.floor(originalDateNow() / 1000) - 100;
    writeFile('untracked.txt', 'one\n');
    fs.utimesSync(filePath, time, time);
    await getStateAsync(['untracked.txt']);

    // Only the change time of the file reveals the change, since userspace can't set it
    writeFile('untracked.txt', 'two\n');
    fs.utimesSync(filePath, time, time);
    takeGitCommands();
    const state: IDetailedRepoState = await getStateAsync(['untracked.txt']);
    expect(takeGitCommandNames()).toEqual(['hash-object', 'status']);
    expect(state.files.get('untracked.txt')).toBe(hashText('two\n'));
  });

  it('copies the index again when the files that it records change', async () => {
    settleFiles();
    const writeFileSpy: jest.SpyInstance = jest.spyOn(fs.promises, 'writeFile');
    await getStateAsync();
    expect(writeFileSpy).toHaveBeenCalledTimes(1);

    writeFile('a.txt', 'modified\n');
    runGit('add', 'a.txt');
    let state: IDetailedRepoState = await getStateAsync();
    expect(takeGitCommandNames()).toContain('ls-files');
    await expectUncachedStateAsync(state);
    expect(writeFileSpy).toHaveBeenCalledTimes(2);

    // Committing doesn't change the files that the index records
    runGit('commit', '--quiet', '-m', 'Modify');
    state = await getStateAsync();
    await expectUncachedStateAsync(state);
    expect(state.hasUncommittedChanges).toBe(false);
    expect(writeFileSpy).toHaveBeenCalledTimes(2);

    runGit('rm', '--cached', '--quiet', 'b.txt');
    state = await getStateAsync();
    await expectUncachedStateAsync(state);
    expect(writeFileSpy).toHaveBeenCalledTimes(3);
  });

  it('follows a checkout between commits that record the same files with the same sizes', async () => {
    settleFiles();
    const firstCommit: string = runGit('rev-parse', 'HEAD').trim();
    writeFile('a.txt', 'A\n');
    commit();
    const secondCommit: string = runGit('rev-parse', 'HEAD').trim();
    let state: IDetailedRepoState = await getStateAsync();
    expect(state.files.get('a.txt')).toBe(hashText('A\n'));

    // The working tree stays clean, so "git status" reports the same output each time. Only the list of the
    // files in the index tells the states apart.
    runGit('reset', '--quiet', '--hard', firstCommit);
    state = await getStateAsync();
    await expectUncachedStateAsync(state);
    expect(state.hasUncommittedChanges).toBe(false);
    expect(state.files.get('a.txt')).toBe(hashText('a\n'));

    runGit('checkout', '--quiet', secondCommit);
    state = await getStateAsync();
    await expectUncachedStateAsync(state);
    expect(state.hasUncommittedChanges).toBe(false);
    expect(state.files.get('a.txt')).toBe(hashText('A\n'));
  });

  it('lists the files in the copy of the index while "git status" refreshes it', async () => {
    await getStateAsync();
    writeFile('a.txt', 'modified\n');
    runGit('add', 'a.txt');
    const events: string[] = [];
    afterSpawn = ({ command }: IGitCommand, childProcess: ChildProcess) => {
      if (command === 'ls-files' || command === 'status') {
        events.push(`start ${command}`);
        childProcess.once('exit', () => events.push(`exit ${command}`));
      }
    };

    const state: IDetailedRepoState = await getStateAsync();
    afterSpawn = undefined;
    await expectUncachedStateAsync(state);
    // Both commands start before either one exits
    expect(events.slice(0, 2).sort()).toEqual(['start ls-files', 'start status']);
    expect(events.slice(2).sort()).toEqual(['exit ls-files', 'exit status']);
  });

  it('keeps the copy of the index when Git only refreshes the index', async () => {
    settleFiles();
    const writeFileSpy: jest.SpyInstance = jest.spyOn(fs.promises, 'writeFile');
    await getStateAsync();

    const indexPath: string = path.join(repoPath, '.git', 'index');
    const indexInode: number = fs.statSync(indexPath).ino;
    const time: number = Math.floor(originalDateNow() / 1000) - 100;
    fs.utimesSync(path.join(repoPath, 'a.txt'), time, time);
    runGit('status', '--porcelain');
    // Git replaced the index
    expect(fs.statSync(indexPath).ino).not.toBe(indexInode);

    takeGitCommands();
    const state: IDetailedRepoState = await getStateAsync();
    expect(takeGitCommandNames()).toEqual(['status']);
    await expectUncachedStateAsync(state);
    expect(writeFileSpy).toHaveBeenCalledTimes(1);
  });

  it('detects a change that the recorded times and size of a file cannot reveal', async () => {
    // Git then compares only the whole seconds of the modification time, and the size
    runGit('config', 'core.trustctime', 'false');
    runGit('config', 'core.checkStat', 'minimal');
    const time: number = Math.floor(originalDateNow() / 1000) - 100;
    const filePath: string = path.join(repoPath, 'a.txt');
    fs.utimesSync(filePath, time, time);
    runGit('update-index', '--refresh');
    // The index was saved in the same second as the file changed, so Git must not trust the recorded times
    fs.utimesSync(path.join(repoPath, '.git', 'index'), time, time);
    fs.writeFileSync(filePath, 'A\n');
    fs.utimesSync(filePath, time, time);

    const state: IDetailedRepoState = await getStateAsync();
    await expectUncachedStateAsync(state);
    expect(state.files.get('a.txt')).toBe(runGit('hash-object', 'a.txt').trim());
  });

  it('detects a change that the recorded times and size of a file cannot reveal, even where Git trusts them', async () => {
    runGit('config', 'core.trustctime', 'false');
    runGit('config', 'core.checkStat', 'minimal');
    const time: number = Math.floor(originalDateNow() / 1000) - 100;
    const filePath: string = path.join(repoPath, 'a.txt');
    fs.utimesSync(filePath, time, time);
    runGit('update-index', '--refresh');
    // The index was saved a second after the file changed, so Git trusts the recorded times and size, and
    // getDetailedRepoStateAsync misses the change. The copy of the index is older.
    fs.utimesSync(path.join(repoPath, '.git', 'index'), time + 1, time + 1);
    fs.writeFileSync(filePath, 'A\n');
    fs.utimesSync(filePath, time, time);

    const state: IDetailedRepoState = await getStateAsync();
    expect(state.files.get('a.txt')).toBe(runGit('hash-object', 'a.txt').trim());
  });

  it('copies the index again when the recorded size of a file changes', async () => {
    settleFiles();
    runGit('config', 'core.autocrlf', 'true');
    const additionalPaths: string[] = ['b.txt'];
    await getStateAsync(additionalPaths);
    writeFile('a.txt', 'modified\n');
    await expectUncachedStateAsync(await getStateAsync(additionalPaths), additionalPaths);
    const writeFileSpy: jest.SpyInstance = jest.spyOn(fs.promises, 'writeFile');

    // Git writes the file with other line endings, and records its new size in the index but not in the copy
    runGit('checkout', '--', 'a.txt');
    takeGitCommands();
    const state: IDetailedRepoState = await getStateAsync(additionalPaths);
    await expectUncachedStateAsync(state, additionalPaths);
    expect(state.hasUncommittedChanges).toBe(false);
    expect(writeFileSpy).toHaveBeenCalledTimes(1);
    // The files that the index records didn't change, so the list of files and the hashes are reused
    expect(takeGitCommandNames()).toEqual(['status']);
  });

  it('copies the index again when the configuration of the repository changes', async () => {
    settleFiles();
    runGit('config', 'core.autocrlf', 'true');
    // Git writes the file with CRLF line endings
    fs.unlinkSync(path.join(repoPath, 'a.txt'));
    runGit('checkout', '--', 'a.txt');
    await getStateAsync();
    // Git refreshes the recorded times of the file in the copy of the index, but not in the index
    touchSettledFile('a.txt');
    let state: IDetailedRepoState = await getStateAsync();
    await expectUncachedStateAsync(state);
    expect(state.hasUncommittedChanges).toBe(false);
    const writeFileSpy: jest.SpyInstance = jest.spyOn(fs.promises, 'writeFile');

    // Git no longer converts the line endings, so the file no longer matches the index
    runGit('config', 'core.autocrlf', 'false');
    takeGitCommands();
    state = await getStateAsync();
    await expectUncachedStateAsync(state);
    expect(state.files.get('a.txt')).toBe(hashText('a\r\n'));
    expect(writeFileSpy).toHaveBeenCalledTimes(1);
    expect(takeGitCommandNames()).toEqual(['hash-object', 'status']);
  });

  it('copies the index again on each call while the configuration of the repository may still change', async () => {
    runGit('config', 'core.autocrlf', 'true');
    // Git writes the file with CRLF line endings
    fs.unlinkSync(path.join(repoPath, 'a.txt'));
    runGit('checkout', '--', 'a.txt');
    // Git refreshes the recorded times of the file in the copy of the index, but not in the index
    touchSettledFile('a.txt');
    // The configuration may change again without changing its stamp
    unsettleFiles();
    const writeFileSpy: jest.SpyInstance = jest.spyOn(fs.promises, 'writeFile');
    let state: IDetailedRepoState = await getStateAsync();
    await expectUncachedStateAsync(state);
    expect(state.files.get('a.txt')).toBe(hashText('a\n'));
    expect(writeFileSpy).toHaveBeenCalledTimes(1);

    const changes: [string, string][] = [
      ['false', 'a\r\n'],
      ['true', 'a\n']
    ];
    for (const [autocrlf, content] of changes) {
      runGit('config', 'core.autocrlf', autocrlf);
      state = await getStateAsync();
      await expectUncachedStateAsync(state);
      expect(state.files.get('a.txt')).toBe(hashText(content));
    }

    expect(writeFileSpy).toHaveBeenCalledTimes(3);
  });

  it('copies the index again when a .gitattributes file changes, after computing the state without the cache', async () => {
    settleFiles();
    writeFile('crlf.txt', 'a\r\n');
    commit();
    await getStateAsync();
    // Git refreshes the recorded times of the file in the copy of the index, but not in the index
    touchSettledFile('crlf.txt');
    await getStateAsync();
    const writeFileSpy: jest.SpyInstance = jest.spyOn(fs.promises, 'writeFile');

    // Git now converts the line endings of the file, so it no longer matches the index
    writeFile('.gitattributes', '*.txt text eol=lf\n');
    let state: IDetailedRepoState = await getStateAsync();
    await expectUncachedStateAsync(state);
    expect(state.files.get('crlf.txt')).toBe(hashText('a\n'));
    expect(writeFileSpy).not.toHaveBeenCalled();

    takeGitCommands();
    state = await getStateAsync();
    await expectUncachedStateAsync(state);
    expect(writeFileSpy).toHaveBeenCalledTimes(1);
    expect(takeGitCommandNames()).toEqual(['hash-object', 'status']);
  });

  it('copies the index again when a .gitattributes file in a folder that contains the filter changes', async () => {
    settleFiles();
    writeFile('sub/.gitattributes', '*.txt -text\n');
    writeFile('sub/dir/crlf.txt', 'a\r\n');
    writeFile('sub/dir/modified.txt', 'm\n');
    commit();
    const filterPath: string[] = ['sub/dir'];
    await getStateAsync([], filterPath);
    // Git refreshes the recorded times of the file in the copy of the index, but not in the index
    touchSettledFile('sub/dir/crlf.txt');
    writeFile('sub/dir/modified.txt', 'modified\r\n');
    let state: IDetailedRepoState = await getStateAsync([], filterPath);
    await expectUncachedStateAsync(state, [], filterPath);

    // "git status" doesn't list the file, which is outside the filter
    writeFile('sub/.gitattributes', '*.txt text eol=lf\n');
    state = await getStateAsync([], filterPath);
    await expectUncachedStateAsync(state, [], filterPath);
    expect(state.files.get('sub/dir/crlf.txt')).toBe(hashText('a\n'));
    expect(state.files.get('sub/dir/modified.txt')).toBe(hashText('modified\n'));

    takeGitCommands();
    state = await getStateAsync([], filterPath);
    await expectUncachedStateAsync(state, [], filterPath);
    expect(takeUsesPrivateIndex()).toBe(true);
  });

  it('copies the index again when the filter changes, instead of computing the state without the cache', async () => {
    settleFiles();
    writeFile('dir/crlf.txt', 'a\r\n');
    commit();
    await getStateAsync();
    touchSettledFile('dir/crlf.txt');
    await getStateAsync();
    const writeFileSpy: jest.SpyInstance = jest.spyOn(fs.promises, 'writeFile');

    // An untracked file outside the filter, which "git status" doesn't list
    writeFile('.gitattributes', '*.txt text eol=lf\n');
    const state: IDetailedRepoState = await getStateAsync([], ['dir']);
    await expectUncachedStateAsync(state, [], ['dir']);
    expect(state.files.get('dir/crlf.txt')).toBe(hashText('a\n'));
    expect(writeFileSpy).toHaveBeenCalledTimes(1);
  });

  it('hashes a file again when an ignored .gitattributes file in a folder that contains it changes', async () => {
    settleFiles();
    writeFile('.gitignore', 'ignored/\n');
    commit();
    writeFile('ignored/dir/crlf.txt', 'a\r\n');
    const additionalPaths: string[] = ['ignored/dir/crlf.txt'];
    let state: IDetailedRepoState = await getStateAsync(additionalPaths);
    await expectUncachedStateAsync(state, additionalPaths);
    expect(state.files.get('ignored/dir/crlf.txt')).toBe(hashText('a\r\n'));

    // "git status" doesn't list the ignored file
    writeFile('ignored/.gitattributes', '*.txt text eol=lf\n');
    takeGitCommands();
    state = await getStateAsync(additionalPaths);
    await expectUncachedStateAsync(state, additionalPaths);
    expect(state.files.get('ignored/dir/crlf.txt')).toBe(hashText('a\n'));
    expect(takeGitCommandNames()).toEqual(['hash-object', 'status']);

    await getStateAsync(additionalPaths);
    expect(takeGitCommandNames()).toEqual(['status']);
  });

  it('hashes a file each time while a .gitattributes file in a folder that contains it may still change', async () => {
    settleFiles();
    writeFile('.gitignore', 'ignored/\n');
    writeFile('.gitattributes', '*.txt -text\n');
    commit();
    writeFile('ignored/crlf.txt', 'a\r\n');
    // The attributes file changes after the calls start, but "git status" doesn't list it
    const time: number = Math.floor(originalDateNow() / 1000) + 60;
    fs.utimesSync(path.join(repoPath, '.gitattributes'), time, time);
    const additionalPaths: string[] = ['ignored/crlf.txt'];
    await getStateAsync(additionalPaths);
    takeGitCommands();

    await getStateAsync(additionalPaths);
    expect(takeGitCommandNames()).toEqual(['hash-object', 'status']);
  });

  it('hashes files again when a modified .gitattributes file changes', async () => {
    settleFiles();
    writeFile('.gitattributes', '# No attributes\n');
    // "git status" doesn't report an ignored file, so only the additional files include it
    writeFile('.gitignore', 'ignored.txt\n');
    commit();
    writeFile('a.txt', 'modified\r\n');
    writeFile('untracked.txt', 'untracked\r\n');
    writeFile('ignored.txt', 'ignored\r\n');
    const additionalPaths: string[] = ['untracked.txt', 'ignored.txt'];
    await expectUncachedStateAsync(await getStateAsync(additionalPaths), additionalPaths);

    writeFile('.gitattributes', '*.txt text eol=lf\n');
    let state: IDetailedRepoState = await getStateAsync(additionalPaths);
    await expectUncachedStateAsync(state, additionalPaths);
    expect(state.files.get('a.txt')).toBe(hashText('modified\n'));
    expect(state.files.get('ignored.txt')).toBe(hashText('ignored\n'));

    runGit('checkout', '--', '.gitattributes');
    state = await getStateAsync(additionalPaths);
    await expectUncachedStateAsync(state, additionalPaths);
    expect(state.files.get('a.txt')).toBe(hashText('modified\r\n'));
    expect(state.files.get('ignored.txt')).toBe(hashText('ignored\r\n'));
  });

  it('hashes files again when the configuration of the repository changes', async () => {
    settleFiles();
    writeFile('a.txt', 'modified\r\n');
    let state: IDetailedRepoState = await getStateAsync();
    await expectUncachedStateAsync(state);
    expect(state.files.get('a.txt')).toBe(hashText('modified\r\n'));

    runGit('config', 'core.autocrlf', 'true');
    state = await getStateAsync();
    await expectUncachedStateAsync(state);
    expect(state.files.get('a.txt')).toBe(hashText('modified\n'));
  });

  it('reuses the copy of the index and the hashes when Git rewrites its configuration with the same content', async () => {
    settleFiles();
    writeFile('a.txt', 'modified\n');
    await getStateAsync();
    const configurationPath: string = path.join(repoPath, '.git', 'config');
    const { ino } = fs.statSync(configurationPath);
    const writeFileSpy: jest.SpyInstance = jest.spyOn(fs.promises, 'writeFile');

    // Git writes a new file with the same content when it deletes a branch that has no configuration
    runGit('branch', 'other');
    runGit('branch', '-D', 'other');
    expect(fs.statSync(configurationPath).ino).not.toBe(ino);
    takeGitCommands();
    const state: IDetailedRepoState = await getStateAsync();
    await expectUncachedStateAsync(state);
    expect(writeFileSpy).not.toHaveBeenCalled();
    expect(takeGitCommandNames()).toEqual(['status']);
  });

  it('reuses the copy of the index when a missing configuration file is created empty', async () => {
    settleFiles();
    writeFile('a.txt', 'modified\n');
    await getStateAsync();
    const writeFileSpy: jest.SpyInstance = jest.spyOn(fs.promises, 'writeFile');

    // Git reads a missing file as an empty one
    writeFile('.git/info/attributes', '');
    takeGitCommands();
    const state: IDetailedRepoState = await getStateAsync();
    await expectUncachedStateAsync(state);
    expect(writeFileSpy).not.toHaveBeenCalled();
    expect(takeGitCommandNames()).toEqual(['status']);
  });

  it('reads a configuration file that cannot be read as an empty one, as Git does', async () => {
    settleFiles();
    writeFile('a.txt', 'modified\n');
    // Git ignores a folder in place of the file
    const attributesPath: string = path.join(repoPath, '.git', 'info', 'attributes');
    fs.mkdirSync(attributesPath, { recursive: true });
    await getStateAsync();
    const writeFileSpy: jest.SpyInstance = jest.spyOn(fs.promises, 'writeFile');
    takeGitCommands();
    await expectUncachedStateAsync(await getStateAsync());
    expect(writeFileSpy).not.toHaveBeenCalled();
    expect(takeGitCommandNames()).toEqual(['status']);

    fs.rmdirSync(attributesPath);
    writeFile('.git/info/attributes', '');
    await expectUncachedStateAsync(await getStateAsync());
    expect(writeFileSpy).not.toHaveBeenCalled();
    expect(takeGitCommandNames()).toEqual(['status']);
  });

  it('hashes files again when a configuration file changes during a call, even if it changes back', async () => {
    settleFiles();
    writeFile('a.txt', 'modified\r\n');
    await getStateAsync();
    const configurationPath: string = path.join(repoPath, '.git', 'config');
    const configuration: Buffer = fs.readFileSync(configurationPath);
    // The next call hashes the file under another configuration, which is gone again when the call ends
    writeFile('a.txt', 'changed\r\n');
    beforeSpawn = ({ command }: IGitCommand) => {
      if (command === 'hash-object') {
        runGit('config', 'core.autocrlf', 'true');
      }
    };
    afterSpawn = ({ command }: IGitCommand, childProcess: ChildProcess) => {
      if (command === 'hash-object') {
        childProcess.once('exit', () => fs.writeFileSync(configurationPath, configuration));
      }
    };
    let state: IDetailedRepoState = await getStateAsync();
    expect(state.files.get('a.txt')).toBe(hashText('changed\n'));
    expect(fs.readFileSync(configurationPath)).toEqual(configuration);

    beforeSpawn = undefined;
    afterSpawn = undefined;
    const writeFileSpy: jest.SpyInstance = jest.spyOn(fs.promises, 'writeFile');
    takeGitCommands();
    state = await getStateAsync();
    await expectUncachedStateAsync(state);
    expect(state.files.get('a.txt')).toBe(hashText('changed\r\n'));
    expect(writeFileSpy).toHaveBeenCalledTimes(1);
    expect(takeGitCommandNames()).toEqual(['hash-object', 'status']);
  });

  it('copies the index again after a call that started while a configuration file could change unseen', async () => {
    const configurationPath: string = path.join(repoPath, '.git', 'config');
    const changeTimeMs: number = Number(
      fs.statSync(configurationPath, { bigint: true }).ctimeNs / BigInt(1e6)
    );
    // A write right after the last change might not change the stamp of the file
    const dateNowSpy: jest.SpyInstance = jest.spyOn(Date, 'now').mockReturnValue(changeTimeMs + 50);
    await getStateAsync();
    const writeFileSpy: jest.SpyInstance = jest.spyOn(fs.promises, 'writeFile');
    await expectUncachedStateAsync(await getStateAsync());
    expect(writeFileSpy).toHaveBeenCalledTimes(1);

    // Any later write changes the stamp, so the call after the next one reuses the copy
    dateNowSpy.mockReturnValue(changeTimeMs + 5000);
    await getStateAsync();
    expect(writeFileSpy).toHaveBeenCalledTimes(2);
    await expectUncachedStateAsync(await getStateAsync());
    expect(writeFileSpy).toHaveBeenCalledTimes(2);
  });

  it('reads the index again while its stamp may still change', async () => {
    settleFiles();
    const summarizeSpy: jest.SpyInstance = jest.spyOn(GitIndexFile, 'summarizeGitIndex');
    // The index changes after the calls start, but the configuration doesn't
    const indexPath: string = path.join(repoPath, '.git', 'index');
    const futureTime: number = Math.floor(originalDateNow() / 1000) + 60;
    fs.utimesSync(indexPath, futureTime, futureTime);
    await getStateAsync();
    await getStateAsync();
    expect(summarizeSpy).toHaveBeenCalledTimes(2);

    const pastTime: number = Math.floor(originalDateNow() / 1000) - 100;
    fs.utimesSync(indexPath, pastTime, pastTime);
    await getStateAsync();
    expect(summarizeSpy).toHaveBeenCalledTimes(3);
    await getStateAsync();
    expect(summarizeSpy).toHaveBeenCalledTimes(3);
  });

  it('reuses the hashes of files when the files that the index records change', async () => {
    settleFiles();
    const additionalPaths: string[] = ['b.txt'];
    writeFile('a.txt', 'modified\n');
    await getStateAsync(additionalPaths);

    runGit('add', 'a.txt');
    takeGitCommands();
    const state: IDetailedRepoState = await getStateAsync(additionalPaths);
    await expectUncachedStateAsync(state, additionalPaths);
    // "git status" still lists the staged file
    expect(takeGitCommandNames()).toEqual(['ls-files', 'status']);
  });

  it('reuses the hash of a file when only the index has the .gitattributes file that applies to it', async () => {
    settleFiles();
    writeFile('.gitignore', 'ignored/\n');
    writeFile('.gitattributes', '*.txt -text\n');
    commit();
    writeFile('ignored/crlf.txt', 'a\r\n');
    fs.unlinkSync(path.join(repoPath, '.gitattributes'));
    const additionalPaths: string[] = ['ignored/crlf.txt'];
    await getStateAsync(additionalPaths);

    // "git status" uses the version in the index in place of the missing file, but "git hash-object" doesn't
    writeFile('attributes.tmp', '*.txt text eol=lf\n');
    const objectId: string = runGit('hash-object', '-w', 'attributes.tmp').trim();
    fs.unlinkSync(path.join(repoPath, 'attributes.tmp'));
    runGit('update-index', '--cacheinfo', `100644,${objectId},.gitattributes`);
    takeGitCommands();
    const state: IDetailedRepoState = await getStateAsync(additionalPaths);
    await expectUncachedStateAsync(state, additionalPaths);
    expect(state.files.get('ignored/crlf.txt')).toBe(hashText('a\r\n'));
    expect(takeGitCommandNames()).toEqual(['ls-files', 'status']);
  });

  it('copies the index again when its copy is deleted or emptied', async () => {
    const writeFileSpy: jest.SpyInstance = jest.spyOn(fs.promises, 'writeFile');
    settleFiles();
    writeFile('a.txt', 'modified\n');
    await getStateAsync();
    await getStateAsync();

    fs.unlinkSync(getPrivateIndexPath());
    await expectUncachedStateAsync(await getStateAsync());
    expect(writeFileSpy).toHaveBeenCalledTimes(2);

    runGit('rm', '--cached', '--quiet', '-r', '.');
    fs.copyFileSync(path.join(repoPath, '.git', 'index'), getPrivateIndexPath());
    runGit('reset', '--quiet');
    await expectUncachedStateAsync(await getStateAsync());
    expect(writeFileSpy).toHaveBeenCalledTimes(3);
  });

  it('copies the index to a new folder when its folder is deleted', async () => {
    await getStateAsync();
    fs.rmSync(path.dirname(getPrivateIndexPath()), { recursive: true });

    takeGitCommands();
    await expectUncachedStateAsync(await getStateAsync());
    expect(takeUsesPrivateIndex()).toBe(false);
    await expectUncachedStateAsync(await getStateAsync());
    expect(takeUsesPrivateIndex()).toBe(true);
    expect(fs.readdirSync(temporaryFolderPath)).toHaveLength(1);
  });

  it('creates the temporary folder', async () => {
    fs.rmSync(temporaryFolderPath, { recursive: true });
    await getStateAsync();
    expect(takeUsesPrivateIndex()).toBe(true);
    expect(fs.readdirSync(temporaryFolderPath)).toHaveLength(1);
  });

  it('falls back to getDetailedRepoStateAsync when the copy of the index disappears while Git reads it', async () => {
    await getStateAsync();
    let isPrivateIndexDeleted: boolean = false;
    beforeSpawn = ({ command, usesPrivateIndex }: IGitCommand) => {
      if (command === 'status' && usesPrivateIndex && !isPrivateIndexDeleted) {
        isPrivateIndexDeleted = true;
        fs.rmSync(getPrivateIndexPath());
      }
    };

    await expectUncachedStateAsync(await getStateAsync());
    expect(isPrivateIndexDeleted).toBe(true);
    takeGitCommands();
    await expectUncachedStateAsync(await getStateAsync());
    expect(takeUsesPrivateIndex()).toBe(true);
  });

  it('removes a lock file that an interrupted "git status" left behind', async () => {
    await getStateAsync();
    const privateIndexContent: Buffer = fs.readFileSync(getPrivateIndexPath());
    const lockPath: string = `${getPrivateIndexPath()}.lock`;
    fs.writeFileSync(lockPath, '');
    touchSettledFile('a.txt');

    await expectUncachedStateAsync(await getStateAsync());
    expect(fs.existsSync(lockPath)).toBe(false);
    expect(fs.readFileSync(getPrivateIndexPath())).not.toEqual(privateIndexContent);
  });

  it('lets "git status" save the copy of the index when the environment disables optional locks', async () => {
    const optionalLocks: string | undefined = process.env.GIT_OPTIONAL_LOCKS;
    process.env.GIT_OPTIONAL_LOCKS = '0';
    try {
      await getStateAsync();
      const privateIndexContent: Buffer = fs.readFileSync(getPrivateIndexPath());
      touchSettledFile('a.txt');

      await expectUncachedStateAsync(await getStateAsync());
      expect(fs.readFileSync(getPrivateIndexPath())).not.toEqual(privateIndexContent);
    } finally {
      if (optionalLocks === undefined) {
        delete process.env.GIT_OPTIONAL_LOCKS;
      } else {
        process.env.GIT_OPTIONAL_LOCKS = optionalLocks;
      }
    }
  });

  it('limits the state to the filter', async () => {
    settleFiles();
    writeFile('dir/d.txt', 'd\n');
    writeFile('e.txt', 'e\n');
    const state: IDetailedRepoState = await getStateAsync([], ['dir/']);
    takeGitCommands();
    await expectUncachedStateAsync(state, [], ['dir/']);
    expect(Array.from(state.files.keys())).toEqual(['dir/c.txt', 'dir/d.txt']);

    await expect(getStateAsync([], ['dir/'])).resolves.toBe(state);
    expect(takeGitCommandNames()).toEqual(['status']);

    // The files outside the filter
    await expectUncachedStateAsync(await getStateAsync());
    expect(takeGitCommandNames()).toEqual(['hash-object', 'ls-files', 'status']);

    await expectUncachedStateAsync(await getStateAsync([], ['dir/']), [], ['dir/']);
    expect(takeGitCommandNames()).toEqual(['ls-files', 'status']);
  });

  it('computes the state of a repository without an index', async () => {
    fs.unlinkSync(path.join(repoPath, '.git', 'index'));
    let state: IDetailedRepoState = await getStateAsync();
    expect(takeUsesPrivateIndex()).toBe(false);
    await expectUncachedStateAsync(state);

    runGit('reset', '--quiet');
    state = await getStateAsync();
    expect(takeUsesPrivateIndex()).toBe(true);
    await expectUncachedStateAsync(state);
  });

  it('stops using the cache for a split index', async () => {
    await getStateAsync();
    runGit('update-index', '--split-index');
    writeFile('a.txt', 'modified\n');
    await expectUncachedStateAsync(await getStateAsync());
    expect(fs.readdirSync(temporaryFolderPath)).toEqual([]);

    runGit('update-index', '--no-split-index');
    takeGitCommands();
    const state: IDetailedRepoState = await getStateAsync();
    expect(takeUsesPrivateIndex()).toBe(false);
    await expectUncachedStateAsync(state);
  });

  it('stops using the cache for a repository with submodules', async () => {
    const submodulePath: string = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-state-cache-submodule-'));
    try {
      execFileSync('git', ['init', '--quiet'], { cwd: submodulePath, env: getGitEnvironment() });
      fs.writeFileSync(path.join(submodulePath, 'inner.txt'), 'inner\n');
      execFileSync('git', ['add', '--all'], { cwd: submodulePath, env: getGitEnvironment() });
      execFileSync(
        'git',
        ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'Inner'],
        { cwd: submodulePath, env: getGitEnvironment() }
      );
      runGit('-c', 'protocol.file.allow=always', 'submodule', '--quiet', 'add', submodulePath, 'sub');
      commit();

      const state: IDetailedRepoState = await getStateAsync();
      await expectUncachedStateAsync(state);
      expect(state.hasSubmodules).toBe(true);
      expect(state.files.has('sub/inner.txt')).toBe(true);
      expect(fs.readdirSync(temporaryFolderPath)).toEqual([]);
    } finally {
      fs.rmSync(submodulePath, { recursive: true, force: true });
    }
  });

  it('falls back to getDetailedRepoStateAsync when it fails, and stops after repeated failures', async () => {
    // Read the index on every call
    unsettleFiles();
    const summarizeSpy: jest.SpyInstance = jest
      .spyOn(GitIndexFile, 'summarizeGitIndex')
      .mockImplementation(() => {
        throw new Error('Test failure');
      });
    writeFile('a.txt', 'modified\n');
    await expectUncachedStateAsync(await getStateAsync());
    await expectUncachedStateAsync(await getStateAsync());

    // A success resets the count
    summarizeSpy.mockRestore();
    await getStateAsync();
    jest.spyOn(GitIndexFile, 'summarizeGitIndex').mockImplementation(() => {
      throw new Error('Test failure');
    });
    await expectUncachedStateAsync(await getStateAsync());
    await expectUncachedStateAsync(await getStateAsync());
    await expectUncachedStateAsync(await getStateAsync());
    expect(GitIndexFile.summarizeGitIndex).toHaveBeenCalledTimes(3);

    await expectUncachedStateAsync(await getStateAsync());
    expect(GitIndexFile.summarizeGitIndex).toHaveBeenCalledTimes(3);
    expect(fs.readdirSync(temporaryFolderPath)).toEqual([]);
  });

  it('reports the error of getDetailedRepoStateAsync, without counting it as a failure of the cache', async () => {
    const expectedError: Error = await getDetailedRepoStateAsync(repoPath, ['missing.txt']).then(
      () => new Error('Expected an error'),
      (error: Error) => error
    );
    expect(expectedError.message).toMatch(/^git hash-object exited with code/);

    for (let i: number = 0; i < 4; i++) {
      await expect(getStateAsync(['missing.txt'])).rejects.toThrow(expectedError.message);
    }

    takeGitCommands();
    await getStateAsync();
    expect(takeUsesPrivateIndex()).toBe(true);
  });

  it('computes the state without the cache after it is disposed', async () => {
    const exitListenerCount: number = process.listenerCount('exit');
    await getStateAsync();
    expect(fs.readdirSync(temporaryFolderPath)).toHaveLength(1);
    expect(process.listenerCount('exit')).toBe(exitListenerCount + 1);

    cache.dispose();
    expect(fs.readdirSync(temporaryFolderPath)).toEqual([]);
    expect(process.listenerCount('exit')).toBe(exitListenerCount);

    takeGitCommands();
    const state: IDetailedRepoState = await getStateAsync();
    expect(takeUsesPrivateIndex()).toBe(false);
    await expectUncachedStateAsync(state);
  });

  it('shares one exit listener between caches', async () => {
    const exitListeners: NodeJS.ExitListener[] = process.listeners('exit');
    const otherCache: RepoStateCache = new RepoStateCache({ rootDirectory: repoPath, temporaryFolderPath });
    try {
      await getStateAsync();
      await otherCache.getDetailedRepoStateAsync();
      expect(fs.readdirSync(temporaryFolderPath)).toHaveLength(2);
      const addedExitListeners: NodeJS.ExitListener[] = process
        .listeners('exit')
        .filter((listener: NodeJS.ExitListener) => !exitListeners.includes(listener));
      expect(addedExitListeners).toHaveLength(1);

      addedExitListeners[0](0);
      expect(fs.readdirSync(temporaryFolderPath)).toEqual([]);

      cache.dispose();
      expect(process.listenerCount('exit')).toBe(exitListeners.length + 1);
    } finally {
      otherCache.dispose();
    }

    expect(process.listenerCount('exit')).toBe(exitListeners.length);
  });

  it('runs one call at a time', async () => {
    writeFile('a.txt', 'modified\n');
    const states: IDetailedRepoState[] = await Promise.all([
      getStateAsync(),
      getStateAsync(),
      getStateAsync()
    ]);
    await expectUncachedStateAsync(states[0]);
    expect(states[1]).toBe(states[0]);
    expect(states[2]).toBe(states[0]);
  });

  if (process.platform !== 'win32') {
    it('removes a symbolic link that was replaced by a file', async () => {
      fs.symlinkSync('a.txt', path.join(repoPath, 'link'));
      commit();
      let state: IDetailedRepoState = await getStateAsync();
      await expectUncachedStateAsync(state);
      expect(state.symlinks.has('link')).toBe(true);

      fs.unlinkSync(path.join(repoPath, 'link'));
      writeFile('link', 'not a link\n');
      state = await getStateAsync();
      await expectUncachedStateAsync(state);
      expect(state.symlinks.has('link')).toBe(false);
    });
  }

  describe('when the index records the same paths as the copy', () => {
    // Git doesn't trust the recorded times of a folder that changed in the same second as the index was saved
    function settleFolders(...relativePaths: string[]): void {
      const time: number = Math.floor(originalDateNow() / 1000) - 100;
      for (const relativePath of relativePaths) {
        fs.utimesSync(path.join(repoPath, relativePath), time, time);
      }
    }

    // Returns the state, and the numbers of folders that "git status" read rather than finding their untracked
    // files in the untracked cache
    async function getStateAndOpenedFolderCountsAsync(): Promise<[IDetailedRepoState, number[]]> {
      const tracePath: string = path.join(repoPath, '.git', 'trace2.json');
      const restoreEnvironment: () => void = setEnvironmentVariables({
        GIT_TRACE2_EVENT: tracePath,
        // Git reports the statistics of the untracked cache in a nested region
        GIT_TRACE2_EVENT_NESTING: '10'
      });
      let state: IDetailedRepoState;
      try {
        state = await getStateAsync();
      } finally {
        restoreEnvironment();
      }

      const events: ITrace2Event[] = fs
        .readFileSync(tracePath, 'utf8')
        .split('\n')
        .filter((line: string) => line)
        .map((line: string) => JSON.parse(line));
      fs.unlinkSync(tracePath);
      const openedFolderCounts: number[] = events
        .filter(({ category, key }: ITrace2Event) => category === 'read_directory' && key === 'opendir')
        .map(({ value }: ITrace2Event) => Number(value));
      return [state, openedFolderCounts];
    }

    beforeEach(() => {
      // Otherwise the configuration files may still change, and the cache copies the index as it is
      settleFiles();
    });

    it('keeps the untracked cache of the previous copy', async () => {
      writeFile('untracked.txt', 'untracked\n');
      writeFile('dir/untracked.txt', 'untracked\n');
      settleFolders('.', 'dir');
      await getStateAsync();
      const previousPath: string = getPrivateIndexPath();
      const previousContent: Buffer = fs.readFileSync(previousPath);
      expect(getExtension(previousContent, 'UNTR')).toBeDefined();
      // Git saved the copy after the index
      const previousTime: number = Math.floor(originalDateNow() / 1000) - 50;
      fs.utimesSync(previousPath, previousTime, previousTime);

      writeFile('a.txt', 'modified\n');
      runGit('add', 'a.txt');
      const writeFileSpy: jest.SpyInstance = jest.spyOn(fs.promises, 'writeFile');
      const utimesSpy: jest.SpyInstance = jest.spyOn(fs.promises, 'utimes');
      const [state, openedFolderCounts] = await getStateAndOpenedFolderCountsAsync();
      await expectUncachedStateAsync(state);
      expect(state.files.get('dir/untracked.txt')).toBe(hashText('untracked\n'));
      expect(openedFolderCounts).toEqual([0]);
      expect(writeFileSpy).toHaveBeenCalledTimes(1);
      expect(getExtension(writeFileSpy.mock.calls[0][1], 'UNTR')).toEqual(
        getExtension(previousContent, 'UNTR')
      );
      // The new copy is older than the previous copy, so that Git doesn't trust the recorded times of any folder
      // that it didn't trust in the previous copy
      expect(utimesSpy).toHaveBeenCalledWith(expect.any(String), previousTime - 1, previousTime - 1);
    });

    it('finds the untracked files that changed since the previous copy', async () => {
      writeFile('untracked.txt', 'untracked\n');
      settleFolders('.', 'dir');
      await getStateAsync();

      writeFile('dir/untracked.txt', 'untracked\n');
      fs.unlinkSync(path.join(repoPath, 'untracked.txt'));
      writeFile('a.txt', 'modified\n');
      runGit('add', 'a.txt');
      const [state, openedFolderCounts] = await getStateAndOpenedFolderCountsAsync();
      await expectUncachedStateAsync(state);
      expect(state.files.get('dir/untracked.txt')).toBe(hashText('untracked\n'));
      expect(state.files.has('untracked.txt')).toBe(false);
      expect(openedFolderCounts).toEqual([2]);
    });

    it('copies the index as it is when the index records other paths', async () => {
      writeFile('untracked.txt', 'untracked\n');
      settleFolders('.', 'dir');
      await getStateAsync();

      // The index records as many files as the copy
      runGit('rm', '--cached', '--quiet', 'b.txt');
      runGit('add', 'untracked.txt');
      const carryOverSpy: jest.SpyInstance = jest.spyOn(GitIndexFile, 'tryCarryOverGitIndexCaches');
      const state: IDetailedRepoState = await getStateAsync();
      await expectUncachedStateAsync(state);
      expect(state.files.get('b.txt')).toBe(hashText('b\n'));
      expect(carryOverSpy.mock.results).toEqual([{ type: 'return', value: undefined }]);
    });

    it('returns the same state as getDetailedRepoStateAsync after each command', async () => {
      const carryOverSpy: jest.SpyInstance = jest.spyOn(GitIndexFile, 'tryCarryOverGitIndexCaches');
      const commands: (() => void)[] = [
        () => writeFile('untracked.txt', 'untracked\n'),
        () => writeFile('a.txt', 'modified\n'),
        () => runGit('add', 'a.txt'),
        () => runGit('restore', '--staged', 'a.txt'),
        () => runGit('stash', '--quiet'),
        () => runGit('stash', 'pop', '--quiet'),
        () => runGit('checkout', '--', 'a.txt'),
        () => writeFile('dir/sub/untracked.txt', 'untracked\n'),
        () => runGit('add', 'dir/sub/untracked.txt'),
        () => fs.unlinkSync(path.join(repoPath, 'untracked.txt')),
        () => runGit('rm', '--cached', '--quiet', 'b.txt'),
        () => runGit('mv', 'dir/c.txt', 'dir/d.txt'),
        () => writeFile('dir/d.txt', 'modified\n'),
        () => runGit('add', '--all')
      ];
      await getStateAsync();
      for (const command of commands) {
        command();
        await expectUncachedStateAsync(await getStateAsync());
      }

      expect(
        carryOverSpy.mock.results.filter(({ value }: jest.MockResult<Buffer | undefined>) => value)
      ).not.toHaveLength(0);
    });

    it('computes the state without the cache when the attributes changed since the previous copy', async () => {
      writeFile('crlf.txt', 'a\r\n');
      commit();
      await getStateAsync();
      const writeFileSpy: jest.SpyInstance = jest.spyOn(fs.promises, 'writeFile');

      writeFile('.gitattributes', '*.txt text eol=lf\n');
      writeFile('a.txt', 'modified\n');
      runGit('add', 'a.txt');
      takeGitCommands();
      let state: IDetailedRepoState = await getStateAsync();
      await expectUncachedStateAsync(state);
      expect(writeFileSpy).toHaveBeenCalledTimes(1);
      // The cache ran "git status" on the new copy, and then computed the state without it
      expect(takeGitCommands().some(({ usesPrivateIndex }: IGitCommand) => !usesPrivateIndex)).toBe(true);

      takeGitCommands();
      state = await getStateAsync();
      await expectUncachedStateAsync(state);
      expect(writeFileSpy).toHaveBeenCalledTimes(2);
      expect(takeUsesPrivateIndex()).toBe(true);
    });

    if (process.platform !== 'win32') {
      describe('with a file system monitor', () => {
        let hook: IFsmonitorHook;
        let restoreEnvironment: () => void;

        function modifyFile(relativePath: string): void {
          writeFile(relativePath, 'modified\n');
          hook.logChange(relativePath);
        }

        beforeEach(() => {
          hook = createFsmonitorHook(path.join(repoPath, '.git'));
          // Git applies the configuration in the environment after that of the repository
          const count: number = Number(process.env.GIT_CONFIG_COUNT || 0);
          restoreEnvironment = setEnvironmentVariables({
            [`GIT_CONFIG_KEY_${count}`]: 'core.fsmonitor',
            [`GIT_CONFIG_VALUE_${count}`]: hook.hookPath,
            GIT_CONFIG_COUNT: String(count + 1)
          });
        });

        afterEach(() => {
          restoreEnvironment();
        });

        it('marks the files whose entries changed as changed', async () => {
          const carryOverSpy: jest.SpyInstance = jest.spyOn(GitIndexFile, 'tryCarryOverGitIndexCaches');
          await getStateAsync();
          modifyFile('a.txt');
          await expectUncachedStateAsync(await getStateAsync());
          runGit('add', 'a.txt');
          await expectUncachedStateAsync(await getStateAsync());
          // Git found the file unchanged since it was added, but the index no longer records its content
          expect(runGit('ls-files', '-f', 'a.txt')).toBe('H a.txt\n');
          runGit('restore', '--staged', 'a.txt');

          const state: IDetailedRepoState = await getStateAsync();
          await expectUncachedStateAsync(state);
          expect(state.files.get('a.txt')).toBe(hashText('modified\n'));
          expect(
            carryOverSpy.mock.results.map(({ value }: jest.MockResult<Buffer | undefined>) => !!value)
          ).toEqual([true, true]);
        });

        it('keeps the token of the previous copy rather than that of the index', async () => {
          await getStateAsync();
          // Git saves the index with a later token, after the untracked file was created
          writeFile('dir/new.txt', 'new\n');
          hook.logChange('dir/new.txt');
          runGit('status', '--porcelain');
          modifyFile('b.txt');
          runGit('add', 'b.txt');

          const state: IDetailedRepoState = await getStateAsync();
          await expectUncachedStateAsync(state);
          expect(state.files.get('dir/new.txt')).toBe(hashText('new\n'));
        });
      });
    }
  });

  function hashText(text: string): string {
    return execFileSync('git', ['hash-object', '--stdin', '--no-filters'], {
      cwd: repoPath,
      env: getGitEnvironment(),
      input: text,
      encoding: 'utf8'
    }).trim();
  }
});
