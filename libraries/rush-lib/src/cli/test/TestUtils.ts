// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AlreadyExistsBehavior, FileSystem, PackageJsonLookup } from '@rushstack/node-core-library';

import type { RushCommandLineParser as RushCommandLineParserType } from '../RushCommandLineParser.ts';
import { FlagFile } from '../../api/FlagFile.ts';
import { RushConstants } from '../../logic/RushConstants.ts';
import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration.ts';

export type SpawnMockArgs = Parameters<typeof import('node:child_process').spawn>;
export type SpawnMock = jest.Mock<ReturnType<typeof import('node:child_process').spawn>, SpawnMockArgs>;
export type SpawnMockCall = SpawnMock['mock']['calls'][number];

/**
 * Interface definition for a test instance for the RushCommandLineParser.
 */
export interface IParserTestInstance {
  parser: RushCommandLineParserType;
  spawnMock: SpawnMock;
  repoPath: string;
}

/**
 * See `./mock_child_process`.
 */
export interface ISpawnMockConfig {
  emitError: boolean;
  returnCode: number;
}

export interface IChildProcessModuleMock {
  /**
   * Initialize the `spawn` mock behavior.
   */
  __setSpawnMockConfig(config?: ISpawnMockConfig): void;

  spawn: jest.Mock;
}

const DEFAULT_RUSH_ENV_VARS_TO_CLEAR: ReadonlyArray<string> = [
  'RUSH_BUILD_CACHE_OVERRIDE_JSON',
  'RUSH_BUILD_CACHE_OVERRIDE_JSON_FILE_PATH',
  'RUSH_BUILD_CACHE_CREDENTIAL',
  'RUSH_BUILD_CACHE_ENABLED',
  'RUSH_BUILD_CACHE_WRITE_ALLOWED'
];

export interface IWithEnvironmentConfigIsolationOptions {
  envVarNamesToClear?: ReadonlyArray<string>;
  silenceStderrWrite?: boolean;
}

export interface IEnvironmentConfigIsolation {
  restore(): void;
}

/**
 * Configure the `child_process` `spawn` mock for these tests. This relies on the mock implementation
 * in `mock_child_process`.
 */
export function setSpawnMock(options?: ISpawnMockConfig): jest.Mock {
  const cpMocked: IChildProcessModuleMock = require('node:child_process');
  cpMocked.__setSpawnMockConfig(options);

  const spawnMock: jest.Mock = cpMocked.spawn;
  spawnMock.mockName('spawn');
  return spawnMock;
}

const PROJECT_ROOT: string = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname)!;
export const TEST_REPO_FOLDER_PATH: string = `${PROJECT_ROOT}/temp/test/unit-test-repos`;

/**
 * Helper to set up a test instance for RushCommandLineParser.
 */
export async function getCommandLineParserInstanceAsync(
  repoName: string,
  taskName: string
): Promise<IParserTestInstance> {
  // Copy the test repo to a sandbox folder
  const repoPath: string = `${TEST_REPO_FOLDER_PATH}/${repoName}-${performance.now()}`;

  await FileSystem.copyFilesAsync({
    sourcePath: `${__dirname}/${repoName}`,
    destinationPath: repoPath,
    alreadyExistsBehavior: AlreadyExistsBehavior.Error
  });

  // The `build` task is hard-coded to be incremental. So delete the package-deps file folder in
  // the test repo to guarantee the test actually runs.
  await Promise.all([
    FileSystem.deleteFolderAsync(`${repoPath}/a/.rush/temp`),
    FileSystem.deleteFolderAsync(`${repoPath}/b/.rush/temp`)
  ]);

  const { RushCommandLineParser } = await import('../RushCommandLineParser.ts');

  // Create a Rush CLI instance. This instance is heavy-weight and relies on setting process.exit
  // to exit and clear the Rush file lock. So running multiple `it` or `describe` test blocks over the same test
  // repo will fail due to contention over the same lock which is kept until the test runner process
  // ends.
  const parser: RushCommandLineParserType = new RushCommandLineParser({ cwd: repoPath });

  // Bulk tasks are hard-coded to expect install to have been completed. So, ensure the last-link.flag
  // file exists and is valid
  await new FlagFile(
    parser.rushConfiguration.defaultSubspace.getSubspaceTempFolderPath(),
    RushConstants.lastLinkFlagFilename,
    {}
  ).createAsync();

  // Mock the command
  process.argv = ['pretend-this-is-node.exe', 'pretend-this-is-rush', taskName];
  const spawnMock: jest.Mock = setSpawnMock();

  return {
    parser,
    spawnMock,
    repoPath
  };
}

/**
 * Clears Rush-related environment variables and resets EnvironmentConfiguration for deterministic tests.
 *
 * Notes:
 * - EnvironmentConfiguration caches some values, so we also stub the build-cache override getters.
 * - Rush treats any stderr output during `rush test` as a warning, which fails the command; some
 *   tests intentionally simulate failures and may need stderr silenced.
 */
export function isolateEnvironmentConfigurationForTests(
  options: IWithEnvironmentConfigIsolationOptions = {}
): IEnvironmentConfigIsolation {
  const envVarNamesToClear: ReadonlyArray<string> =
    options.envVarNamesToClear ?? DEFAULT_RUSH_ENV_VARS_TO_CLEAR;

  const savedProcessEnv: Record<string, string | undefined> = {};
  for (const envVarName of envVarNamesToClear) {
    savedProcessEnv[envVarName] = process.env[envVarName];
    delete process.env[envVarName];
  }

  EnvironmentConfiguration.reset();

  const restoreFns: Array<() => void> = [];

  restoreFns.push(() => {
    for (const envVarName of envVarNamesToClear) {
      const oldValue: string | undefined = savedProcessEnv[envVarName];
      if (oldValue === undefined) {
        delete process.env[envVarName];
      } else {
        process.env[envVarName] = oldValue;
      }
    }
  });

  if (options.silenceStderrWrite) {
    type StderrWrite = typeof process.stderr.write;
    const silentWrite: unknown = (
      chunk: string | Uint8Array,
      encoding?: BufferEncoding | ((err?: Error | null) => void),
      cb?: (err?: Error | null) => void
    ): boolean => {
      if (typeof encoding === 'function') {
        encoding(null);
      } else {
        cb?.(null);
      }
      return true;
    };

    const writeSpy: jest.SpyInstance<ReturnType<StderrWrite>, Parameters<StderrWrite>> = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(silentWrite as StderrWrite);

    restoreFns.push(() => writeSpy.mockRestore());
  }

  // EnvironmentConfiguration.reset() does not clear cached values for these fields.
  const overrideJsonFilePathSpy: jest.SpyInstance<string | undefined, []> = jest
    .spyOn(EnvironmentConfiguration, 'buildCacheOverrideJsonFilePath', 'get')
    .mockReturnValue(undefined);
  const overrideJsonSpy: jest.SpyInstance<string | undefined, []> = jest
    .spyOn(EnvironmentConfiguration, 'buildCacheOverrideJson', 'get')
    .mockReturnValue(undefined);

  restoreFns.push(() => overrideJsonFilePathSpy.mockRestore());
  restoreFns.push(() => overrideJsonSpy.mockRestore());
  restoreFns.push(() => EnvironmentConfiguration.reset());

  return {
    restore: () => {
      for (let i: number = restoreFns.length - 1; i >= 0; i--) {
        restoreFns[i]();
      }
    }
  };
}
