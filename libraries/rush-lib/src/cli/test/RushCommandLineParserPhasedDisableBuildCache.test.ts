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
import { NoOpTerminalProvider } from '@rushstack/terminal';

import { PhasedCommandEngine } from '../../api/PhasedCommandEngine';
import { RushConfiguration } from '../../api/RushConfiguration';
import { ProjectChangeAnalyzer } from '../../logic/ProjectChangeAnalyzer';
import type { IInputsSnapshot } from '../../logic/incremental/InputsSnapshot';
import type { Operation } from '../../logic/operations/Operation';
import type { ICreateOperationsContext } from '../../pluginFramework/PhasedCommandHooks';
import type { RushCommandLineParser } from '../RushCommandLineParser';
import { PhasedScriptAction } from '../scriptActions/PhasedScriptAction';
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

/**
 * Runs two daemon graph iterations and returns the folder names of the projects whose script each one spawned.
 */
async function runEngineTwiceAsync(repoPath: string, commandName: string): Promise<[string[], string[]]> {
  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
    path.join(repoPath, 'rush.json')
  );
  const command: PhasedCommandEngine = await PhasedCommandEngine.parseAsync({
    argv: [commandName],
    cwd: repoPath,
    rushConfiguration,
    terminalProvider: new NoOpTerminalProvider()
  });
  const inputsSnapshot: IInputsSnapshot = {
    hashes: new Map(),
    rootDirectory: repoPath,
    hasUncommittedChanges: false,
    getTrackedFileHashesForOperation: () => new Map(),
    getOperationOwnStateHash: (project) => project.projectRelativeFolder
  };
  const snapshotSpy: jest.SpiedFunction<ProjectChangeAnalyzer['_tryGetSnapshotProviderAsync']> = jest
    .spyOn(ProjectChangeAnalyzer.prototype, '_tryGetSnapshotProviderAsync')
    .mockResolvedValue(async () => inputsSnapshot);
  let engine: Awaited<ReturnType<PhasedCommandEngine['createEngineAsync']>> | undefined;
  try {
    engine = await command.createEngineAsync();
    const activeEngine: Awaited<ReturnType<PhasedCommandEngine['createEngineAsync']>> = engine;
    const selectedOperations = await command.selectOperationsAsync(activeEngine.operationGraph);
    const runIterationAsync = async (): Promise<string[]> => {
      const spawnMock: jest.Mock = setSpawnMock();
      spawnMock.mockClear();
      activeEngine.operationGraph.setEnabledStates(activeEngine.operationGraph.operations, false, 'unsafe');
      for (const [operation, enabled] of selectedOperations) {
        operation.enabled = enabled;
      }
      if (
        await activeEngine.operationGraph.scheduleIterationAsync({
          inputsSnapshot: activeEngine.inputsSnapshot,
          isIncrementalBuildAllowed: command.requestSettings.isIncrementalBuildAllowed
        })
      ) {
        await activeEngine.operationGraph.executeScheduledIterationAsync();
      }
      return spawnMock.mock.calls
        .map((spawnCall: SpawnMockCall) => path.basename(String((spawnCall[2] as SpawnOptions).cwd)))
        .sort();
    };
    return [await runIterationAsync(), await runIterationAsync()];
  } finally {
    await engine?.[Symbol.asyncDispose]();
    snapshotSpy.mockRestore();
  }
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
      .mockImplementation((resourceFolder: string, resourceName: string) => {
        if (resourceName !== 'rush') {
          return tryAcquire(resourceFolder, resourceName);
        }
        return {
          filePath: LockFile.getLockFilePath(resourceFolder, resourceName),
          isReleased: false,
          release: jest.fn()
        } as unknown as LockFile;
      });
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

  it('gives the operation runners of a native command with disableBuildCache its incremental setting', async () => {
    // For example, a watch command's IPC runners and "<phase>:incremental" scripts depend on it.
    const { parser, spawnMock } = await getCommandLineParserInstanceAsync(REPO_NAME, 'ship');
    const action: PhasedScriptAction = parser.getAction('ship') as PhasedScriptAction;
    expect(action).toBeInstanceOf(PhasedScriptAction);
    const incrementalSettings: boolean[] = [];
    action.hooks.createOperationsAsync.tap(
      'Test',
      (operations: Set<Operation>, context: ICreateOperationsContext) => {
        incrementalSettings.push(context.isIncrementalBuildAllowed);
        return operations;
      }
    );
    expect(await executeAsync(parser, spawnMock)).toEqual(['a', 'b']);
    expect(incrementalSettings).toEqual([true]);
  });

  it('runs every project again in a daemon graph for a phased command with disableBuildCache', async () => {
    const { repoPath } = await getCommandLineParserInstanceAsync(REPO_NAME, 'ship');
    expect(await runEngineTwiceAsync(repoPath, 'ship')).toEqual([
      ['a', 'b'],
      ['a', 'b']
    ]);
  });
});
