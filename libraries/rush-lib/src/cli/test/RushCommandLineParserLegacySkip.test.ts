// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock(`@rushstack/package-deps-hash`, () => {
  return {
    getRepoRoot(dir: string): string {
      return dir;
    },
    getDetailedRepoStateAsync(): IDetailedRepoState {
      return {
        hasSubmodules: false,
        hasUncommittedChanges: false,
        files: new Map([['common/config/rush/npm-shrinkwrap.json', 'hash']]),
        symlinks: new Map()
      };
    },
    getRepoChangesAsync(): ReadonlyMap<string, string> {
      return new Map();
    },
    getGitHashForFiles(filePaths: Iterable<string>): ReadonlyMap<string, string> {
      return new Map(Array.from(filePaths, (filePath: string) => [filePath, filePath]));
    },
    hashFilesAsync(rootDirectory: string, filePaths: Iterable<string>): Promise<ReadonlyMap<string, string>> {
      return Promise.resolve(new Map(Array.from(filePaths, (filePath: string) => [filePath, filePath])));
    }
  };
});

import './mockRushCommandLineParser';

import * as path from 'node:path';
import type { SpawnOptions } from 'node:child_process';

import { FileSystem, JsonFile, LockFile } from '@rushstack/node-core-library';
import type { IDetailedRepoState } from '@rushstack/package-deps-hash';

import type { RushCommandLineParser } from '../RushCommandLineParser';
import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';
import {
  getCommandLineParserInstanceAsync,
  isolateEnvironmentConfigurationForTests,
  setSpawnMock,
  type IEnvironmentConfigIsolation,
  type SpawnMockCall
} from './TestUtils';

// The repo has no command-line.json, so "build" is the default command, which uses legacy skip detection.
const REPO_NAME: string = 'legacySkipRepo';
const PROJECT_FOLDER_NAMES: ReadonlyArray<string> = ['a', 'b'];

jest.setTimeout(1000000);

/**
 * Executes the command and returns the folder names of the projects whose script it spawned.
 */
async function executeAsync(parser: RushCommandLineParser, spawnMock: jest.Mock): Promise<string[]> {
  spawnMock.mockClear();
  await expect(parser.executeAsync()).resolves.toEqual(true);
  return spawnMock.mock.calls
    .map((spawnCall: SpawnMockCall) => path.basename(String((spawnCall[2] as SpawnOptions).cwd)))
    .sort();
}

/**
 * Runs another command in a repo that {@link getCommandLineParserInstanceAsync} created, as a new Rush process
 * would.
 */
async function runAsync(repoPath: string, commandName: string): Promise<string[]> {
  const { RushCommandLineParser: Parser } = await import('../RushCommandLineParser');
  // The parser refuses to load .env files after the previous command validated the environment.
  EnvironmentConfiguration.reset();
  const parser: RushCommandLineParser = new Parser({ cwd: repoPath });
  process.argv = ['pretend-this-is-node.exe', 'pretend-this-is-rush', commandName];
  return await executeAsync(parser, setSpawnMock());
}

/**
 * Returns the folder names of the projects that have a legacy skip record for the "build" command.
 */
function getProjectsWithRecords(repoPath: string): string[] {
  return PROJECT_FOLDER_NAMES.filter((projectFolderName: string) =>
    FileSystem.exists(`${repoPath}/${projectFolderName}/.rush/temp/package-deps_build.json`)
  );
}

describe('RushCommandLineParser legacy skip records', () => {
  let _envIsolation: IEnvironmentConfigIsolation;
  let _lockSpy: jest.SpiedFunction<typeof LockFile.tryAcquire>;
  let _originalExitCode: string | number | undefined;

  beforeEach(() => {
    // A command that succeeds sets process.exitCode to 0. When Jest runs only this file, it shares the
    // process with Heft, which would then exit with 0 even though tests failed.
    _originalExitCode = process.exitCode;
    _envIsolation = isolateEnvironmentConfigurationForTests();

    // Rush keeps the repo lock until the process exits, so it would refuse the second command in a repo.
    const tryAcquire: typeof LockFile.tryAcquire = LockFile.tryAcquire.bind(LockFile);
    _lockSpy = jest
      .spyOn(LockFile, 'tryAcquire')
      .mockImplementation((resourceFolder: string, resourceName: string) =>
        resourceName === 'rush' ? ({} as LockFile) : tryAcquire(resourceFolder, resourceName)
      );
  });

  afterEach(() => {
    _lockSpy.mockRestore();
    jest.clearAllMocks();
    _envIsolation.restore();
    process.exitCode = _originalExitCode;
  });

  it('keeps the records in a build without the build cache', async () => {
    const { parser, spawnMock, repoPath } = await getCommandLineParserInstanceAsync(REPO_NAME, 'build');
    expect(await executeAsync(parser, spawnMock)).toEqual(['a', 'b']);
    expect(getProjectsWithRecords(repoPath)).toEqual(['a', 'b']);

    expect(await runAsync(repoPath, 'build')).toEqual([]);
    expect(getProjectsWithRecords(repoPath)).toEqual(['a', 'b']);
  });

  it('keeps the records in a build whose build-cache.json disables the build cache', async () => {
    const { parser, spawnMock, repoPath } = await getCommandLineParserInstanceAsync(REPO_NAME, 'build');
    expect(await executeAsync(parser, spawnMock)).toEqual(['a', 'b']);

    // "rush init" creates build-cache.json with the build cache disabled.
    await JsonFile.saveAsync(
      { buildCacheEnabled: false, cacheProvider: 'local-only' },
      `${repoPath}/common/config/rush/build-cache.json`,
      { ensureFolderExists: true }
    );
    expect(await runAsync(repoPath, 'build')).toEqual([]);
    expect(getProjectsWithRecords(repoPath)).toEqual(['a', 'b']);
  });

  it('deletes the records in a build with the build cache', async () => {
    const { parser, spawnMock, repoPath } = await getCommandLineParserInstanceAsync(REPO_NAME, 'build');
    expect(await executeAsync(parser, spawnMock)).toEqual(['a', 'b']);

    const buildCacheJsonPath: string = `${repoPath}/common/config/rush/build-cache.json`;
    await JsonFile.saveAsync({ buildCacheEnabled: true, cacheProvider: 'local-only' }, buildCacheJsonPath, {
      ensureFolderExists: true
    });
    expect(await runAsync(repoPath, 'build')).toEqual(['a', 'b']);
    expect(getProjectsWithRecords(repoPath)).toEqual([]);

    // Without the records, a later build without the build cache can't skip the projects.
    await FileSystem.deleteFileAsync(buildCacheJsonPath);
    expect(await runAsync(repoPath, 'build')).toEqual(['a', 'b']);
    expect(getProjectsWithRecords(repoPath)).toEqual(['a', 'b']);
  });

  it('deletes the records in a rebuild with the build cache', async () => {
    const { parser, spawnMock, repoPath } = await getCommandLineParserInstanceAsync(REPO_NAME, 'build');
    expect(await executeAsync(parser, spawnMock)).toEqual(['a', 'b']);

    // A rebuild replaces the outputs even though it never skips.
    await JsonFile.saveAsync(
      { buildCacheEnabled: true, cacheProvider: 'local-only' },
      `${repoPath}/common/config/rush/build-cache.json`,
      { ensureFolderExists: true }
    );
    expect(await runAsync(repoPath, 'rebuild')).toEqual(['a', 'b']);
    expect(getProjectsWithRecords(repoPath)).toEqual([]);
  });

  it('deletes the records in a command that disables the build cache', async () => {
    const { parser, spawnMock, repoPath } = await getCommandLineParserInstanceAsync(REPO_NAME, 'build');
    expect(await executeAsync(parser, spawnMock)).toEqual(['a', 'b']);

    const commandLineJsonPath: string = `${repoPath}/common/config/rush/command-line.json`;
    await JsonFile.saveAsync(
      {
        commands: [
          {
            commandKind: 'bulk',
            name: 'build',
            summary: 'Builds every project, without the build cache or skipping.',
            enableParallelism: true,
            incremental: true,
            disableBuildCache: true
          }
        ]
      },
      commandLineJsonPath,
      { ensureFolderExists: true }
    );
    expect(await runAsync(repoPath, 'build')).toEqual(['a', 'b']);
    expect(getProjectsWithRecords(repoPath)).toEqual([]);

    // Without the records, the build can't skip the projects once it uses legacy skip detection again.
    await FileSystem.deleteFileAsync(commandLineJsonPath);
    expect(await runAsync(repoPath, 'build')).toEqual(['a', 'b']);
    expect(getProjectsWithRecords(repoPath)).toEqual(['a', 'b']);
  });
});
