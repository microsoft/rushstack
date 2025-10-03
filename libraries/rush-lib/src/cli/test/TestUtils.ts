// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AlreadyExistsBehavior, FileSystem, PackageJsonLookup } from '@rushstack/node-core-library';

import type { RushCommandLineParser as RushCommandLineParserType } from '../RushCommandLineParser';
import { FlagFile } from '../../api/FlagFile';
import { RushConstants } from '../../logic/RushConstants';

/**
 * Interface definition for a test instance for the RushCommandLineParser.
 */
export interface IParserTestInstance {
  parser: RushCommandLineParserType;
  spawnMock: jest.Mock;
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

  const { RushCommandLineParser } = await import('../RushCommandLineParser');

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
