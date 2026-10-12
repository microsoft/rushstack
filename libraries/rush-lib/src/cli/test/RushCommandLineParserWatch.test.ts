// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';

import { JsonFile, LockFile } from '@rushstack/node-core-library';

import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';
import { FlagFile } from '../../api/FlagFile';
import { ProjectChangeAnalyzer } from '../../logic/ProjectChangeAnalyzer';
import { RushConstants } from '../../logic/RushConstants';
import type { GetInputsSnapshotAsyncFn, IInputsSnapshot } from '../../logic/incremental/InputsSnapshot';
import type { IOperationExecutionResult } from '../../logic/operations/IOperationExecutionResult';
import type { Operation } from '../../logic/operations/Operation';
import { OperationStatus } from '../../logic/operations/OperationStatus';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { PhasedScriptAction } from '../scriptActions/PhasedScriptAction';

const COMMAND_NAME: string = 'watch-test';
const PHASE_NAME: string = '_phase:watch-test';
// A passing run starts its second iteration well within this.
const SECOND_ITERATION_DEADLINE_MS: number = 20000;

type IterationStatuses = ReadonlyMap<string, OperationStatus>;

async function createRepositoryAsync(parentFolder: string): Promise<string> {
  const repoPath: string = path.join(parentFolder, 'repo');
  await fs.promises.cp(path.join(__dirname, 'basicAndRunBuildActionRepo'), repoPath, { recursive: true });
  JsonFile.save(
    {
      commands: [
        {
          commandKind: 'phased',
          name: COMMAND_NAME,
          summary: 'Watch fixture',
          phases: [PHASE_NAME],
          enableParallelism: false,
          safeForSimultaneousRushProcesses: true,
          watchOptions: { alwaysWatch: true, debounceMs: 1, watchPhases: [PHASE_NAME] }
        }
      ],
      phases: [{ name: PHASE_NAME, dependencies: { upstream: [PHASE_NAME] } }]
    },
    path.join(repoPath, 'common/config/rush/command-line.json')
  );
  JsonFile.save({}, path.join(repoPath, 'common/config/rush/npm-shrinkwrap.json'));
  // The lines of `rush init`'s .gitignore that cover the files Rush writes during an iteration, so that they
  // aren't inputs.
  await fs.promises.writeFile(path.join(repoPath, '.gitignore'), '*.log\ncommon/temp/\n**/.rush/temp/\n');
  for (const name of ['a', 'b']) {
    const packageJsonPath: string = path.join(repoPath, name, 'package.json');
    const packageJson: { scripts?: Record<string, string> } = JsonFile.load(packageJsonPath);
    JsonFile.save({ ...packageJson, scripts: { [PHASE_NAME]: 'node watch-test.js' } }, packageJsonPath);
    await fs.promises.writeFile(path.join(repoPath, name, 'watch-test.js'), 'process.exitCode = 0;\n');
  }
  // Failed Git commands still throw with their stderr.
  execFileSync('git', ['init', '--quiet'], { cwd: repoPath, stdio: 'pipe' });
  execFileSync('git', ['add', '.'], { cwd: repoPath, stdio: 'pipe' });
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Rush test',
      '-c',
      'user.email=rush-test@example.com',
      '-c',
      'commit.gpgSign=false',
      'commit',
      '--quiet',
      '-m',
      'Initialize watch fixture'
    ],
    { cwd: repoPath, stdio: 'pipe' }
  );
  return repoPath;
}

function getStatusesByName(results: ReadonlyMap<Operation, IOperationExecutionResult>): IterationStatuses {
  return new Map(Array.from(results, ([operation, result]) => [operation.name, result.status]));
}

describe('RushCommandLineParser watch mode', () => {
  const temporaryFolders: string[] = [];
  let originalExitCode: string | number | undefined;
  let lockSpy: jest.SpiedFunction<typeof LockFile.tryAcquire>;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    EnvironmentConfiguration.reset();
    lockSpy = jest.spyOn(LockFile, 'tryAcquire');
  });

  afterEach(async () => {
    try {
      for (const result of lockSpy.mock.results) {
        if (result.type === 'return' && result.value && !result.value.isReleased) {
          result.value.release();
        }
      }
      // On Windows, a process that the watch session started can keep the folder busy for a moment after it ends.
      await Promise.all(
        temporaryFolders
          .splice(0)
          .map((folder) =>
            fs.promises.rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
          )
      );
    } finally {
      process.exitCode = originalExitCode;
      EnvironmentConfiguration.reset();
      jest.restoreAllMocks();
    }
  });

  // Covers PhasedScriptAction passing its snapshot provider to ProjectWatcher. Without the provider, the watcher
  // can't find the edit below.
  it('runs again for an input that changed while the first iteration ran', async () => {
    const temporaryFolder: string = await fs.promises.mkdtemp(
      path.join(fs.realpathSync.native(os.tmpdir()), 'rush-watch-')
    );
    temporaryFolders.push(temporaryFolder);
    const repoPath: string = await createRepositoryAsync(temporaryFolder);
    const editedInputPath: string = path.join(repoPath, 'a', 'watch-test.js');

    const closedWatchers: Promise<unknown>[] = [];
    const originalWatch: typeof fs.watch = fs.watch;
    jest.spyOn(fs, 'watch').mockImplementation(((...args: Parameters<typeof fs.watch>) => {
      const watcher: fs.FSWatcher = originalWatch(...args);
      closedWatchers.push(once(watcher, 'close'));
      return watcher;
    }) as typeof fs.watch);
    // The watcher takes snapshots on its own, e.g. each time the graph goes idle. The session must wait for them,
    // so that Git doesn't read the repository after the command returns, when afterEach removes it.
    let runningSnapshotCount: number = 0;
    const originalTryGetSnapshotProviderAsync: ProjectChangeAnalyzer['_tryGetSnapshotProviderAsync'] =
      ProjectChangeAnalyzer.prototype._tryGetSnapshotProviderAsync;
    jest
      .spyOn(ProjectChangeAnalyzer.prototype, '_tryGetSnapshotProviderAsync')
      .mockImplementation(async function (
        this: ProjectChangeAnalyzer,
        ...args: Parameters<ProjectChangeAnalyzer['_tryGetSnapshotProviderAsync']>
      ): Promise<GetInputsSnapshotAsyncFn | undefined> {
        const getInputsSnapshotAsync: GetInputsSnapshotAsyncFn | undefined =
          await originalTryGetSnapshotProviderAsync.apply(this, args);
        return (
          getInputsSnapshotAsync &&
          (async (): Promise<IInputsSnapshot | undefined> => {
            runningSnapshotCount++;
            try {
              return await getInputsSnapshotAsync();
            } finally {
              runningSnapshotCount--;
            }
          })
        );
      });

    const parser: RushCommandLineParser = new RushCommandLineParser({ cwd: repoPath });
    await new FlagFile(
      parser.rushConfiguration.defaultSubspace.getSubspaceTempFolderPath(),
      RushConstants.lastLinkFlagFilename,
      {}
    ).createAsync();
    const action = parser.getAction(COMMAND_NAME);
    if (!(action instanceof PhasedScriptAction)) {
      throw new Error('Expected the production phased watch action');
    }

    const iterations: IterationStatuses[] = [];
    let deadline: NodeJS.Timeout | undefined;
    const stop = (): void => {
      clearTimeout(deadline);
      action.sessionAbortController.abort();
    };
    parser.rushSession.hooks.runPhasedCommand.for(COMMAND_NAME).tap('WatchTest', (command) => {
      command.hooks.onGraphCreatedAsync.tap('WatchTest', (graph) => {
        graph.hooks.beforeExecuteIterationAsync.tap('WatchTest', () => {
          if (iterations.length === 0) {
            // The watcher opens its file system watchers only when the graph goes idle, so no watcher sees
            // this edit. Only the snapshot that the watcher takes at idle can find it.
            fs.writeFileSync(editedInputPath, 'process.exitCode = 0; // edited\n');
          }
        });
        graph.hooks.afterExecuteIterationAsync.tap('WatchTest', (status, results) => {
          iterations.push(getStatusesByName(results));
          return status;
        });
        graph.hooks.onIdle.tap({ name: 'WatchTest', stage: Number.MAX_SAFE_INTEGER }, () => {
          if (iterations.length < 2) {
            clearTimeout(deadline);
            deadline = setTimeout(stop, SECOND_ITERATION_DEADLINE_MS);
          } else {
            stop();
          }
        });
      });
    });

    try {
      await expect(parser.executeAsync([COMMAND_NAME])).resolves.toBe(true);
      expect(runningSnapshotCount).toBe(0);
    } finally {
      stop();
      await Promise.all(closedWatchers);
    }

    // On Windows, the watcher can report another change while the second iteration runs, which aborts that
    // iteration and runs it again.
    const completedIterations: IterationStatuses[] = iterations.filter(
      (iteration: IterationStatuses) => !Array.from(iteration.values()).includes(OperationStatus.Aborted)
    );
    expect(completedIterations).toEqual([
      new Map([
        ['a (watch-test)', OperationStatus.Success],
        ['b (watch-test)', OperationStatus.Success]
      ]),
      new Map([
        ['a (watch-test)', OperationStatus.Success],
        ['b (watch-test)', OperationStatus.Success]
      ])
    ]);
  }, 60000);
});
