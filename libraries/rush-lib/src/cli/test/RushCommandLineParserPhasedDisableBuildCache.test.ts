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
        // The shrinkwrap file of the test repo, which every project depends on. As in the other mocks, a file's
        // hash is its path.
        files: new Map([
          ['common/config/rush/npm-shrinkwrap.json', 'common/config/rush/npm-shrinkwrap.json']
        ]),
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

import { LockFile } from '@rushstack/node-core-library';
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

// The repo has no build cache, so its incremental phased commands use legacy skip detection, unless they set
// "disableBuildCache" in command-line.json.
const REPO_NAME: string = 'phasedDisableBuildCacheRepo';

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

describe('RushCommandLineParser phased command with disableBuildCache', () => {
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

  it('skips the unchanged projects in a phased command without disableBuildCache', async () => {
    const { parser, spawnMock, repoPath } = await getCommandLineParserInstanceAsync(REPO_NAME, 'stage');
    expect(await executeAsync(parser, spawnMock)).toEqual(['a', 'b']);
    expect(await runAsync(repoPath, 'stage')).toEqual([]);
  });

  it('runs every project again in a phased command with disableBuildCache', async () => {
    const { parser, spawnMock, repoPath } = await getCommandLineParserInstanceAsync(REPO_NAME, 'ship');
    expect(await executeAsync(parser, spawnMock)).toEqual(['a', 'b']);
    expect(await runAsync(repoPath, 'ship')).toEqual(['a', 'b']);
  });
});
