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

import { JsonFile } from '@rushstack/node-core-library';
import type { IDetailedRepoState } from '@rushstack/package-deps-hash';

import { DeferredCacheEntryWrites } from '../../logic/buildCache/DeferredCacheEntryWrites';
import { CacheableOperationPlugin } from '../../logic/operations/CacheableOperationPlugin';
import {
  getCommandLineParserInstanceAsync,
  isolateEnvironmentConfigurationForTests,
  type IEnvironmentConfigIsolation
} from './TestUtils';

const REPO_NAME: string = 'legacySkipRepo';
const DEFER_CACHE_WRITES_VARIABLE_NAME: string = 'RUSH_DAEMON_DEFER_CACHE_WRITES';

jest.setTimeout(1000000);

describe('RushCommandLineParser with the deferCacheWrites setting', () => {
  let _envIsolation: IEnvironmentConfigIsolation;
  let _originalExitCode: string | number | undefined;
  let _originalDeferCacheWrites: string | undefined;

  beforeEach(() => {
    // A command that succeeds sets process.exitCode to 0. When Jest runs only this file, it shares the
    // process with Heft, which would then exit with 0 even though tests failed.
    _originalExitCode = process.exitCode;
    _originalDeferCacheWrites = process.env[DEFER_CACHE_WRITES_VARIABLE_NAME];
    _envIsolation = isolateEnvironmentConfigurationForTests();
  });

  afterEach(() => {
    jest.clearAllMocks();
    _envIsolation.restore();
    if (_originalDeferCacheWrites === undefined) {
      delete process.env[DEFER_CACHE_WRITES_VARIABLE_NAME];
    } else {
      process.env[DEFER_CACHE_WRITES_VARIABLE_NAME] = _originalDeferCacheWrites;
    }
    process.exitCode = _originalExitCode;
  });

  it('does not defer the build cache writes of a build outside the daemon', async () => {
    process.env[DEFER_CACHE_WRITES_VARIABLE_NAME] = '1';
    const { parser, spawnMock, repoPath } = await getCommandLineParserInstanceAsync(REPO_NAME, 'build');
    expect(parser.rushConfiguration.daemon.deferCacheWrites).toBe(true);
    await JsonFile.saveAsync(
      { buildCacheEnabled: true, cacheProvider: 'local-only' },
      `${repoPath}/common/config/rush/build-cache.json`,
      { ensureFolderExists: true }
    );

    // A deferred write outlives its command, and only the daemon outlives a command. The projects write no
    // entries, since they have no rush-project.json, so what matters is whether the build gets the daemon's queue.
    const applySpy: jest.SpiedFunction<CacheableOperationPlugin['apply']> = jest.spyOn(
      CacheableOperationPlugin.prototype,
      'apply'
    );
    const instanceSpy: jest.SpyInstance<DeferredCacheEntryWrites, []> = jest.spyOn(
      DeferredCacheEntryWrites,
      'instance',
      'get'
    );
    try {
      await expect(parser.executeAsync()).resolves.toEqual(true);

      expect(spawnMock).toHaveBeenCalledTimes(2);
      expect(applySpy).toHaveBeenCalledTimes(1);
      expect(instanceSpy).not.toHaveBeenCalled();
    } finally {
      instanceSpy.mockRestore();
      applySpy.mockRestore();
    }
  });
});
