// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('../OperationStateFile');
jest.mock('../ProjectLogWritable', () => {
  const actual = jest.requireActual('../ProjectLogWritable');
  const { MockWritable } = jest.requireActual('@rushstack/terminal');
  return { ...actual, initializeProjectLogFilesAsync: jest.fn(async () => new MockWritable()) };
});

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { SubprocessTerminator } from '@rushstack/node-core-library';
import { MockWritable } from '@rushstack/terminal';

import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import { type ILifecycleCommandOptions, Utilities } from '../../../utilities/Utilities';
import type { IExecutionResult } from '../IOperationExecutionResult';
import { Operation } from '../Operation';
import { OperationGraph } from '../OperationGraph';
import { OperationStatus } from '../OperationStatus';
import { ShellOperationRunner } from '../ShellOperationRunner';

// Spawns a grandchild that never exits, reports its PID, then waits forever itself.
const NEVER_ENDING_TREE_SCRIPT: string = `
  const grandchild = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  process.stdout.write('grandchild=' + grandchild.pid + '\\n');
  setInterval(() => {}, 1000);
`;

// Spawns a grandchild that inherits stdout and never exits, reports its PID, then exits itself.
const EXITED_PARENT_TREE_SCRIPT: string = `
  const grandchild = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: ['ignore', 'inherit', 'ignore'] });
  process.stdout.write('grandchild=' + grandchild.pid + '\\n', () => process.exit(0));
`;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForExitAsync(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline: number = Date.now() + timeoutMs;
  while (isAlive(pid)) {
    if (Date.now() >= deadline) return false;
    await delayAsync(20);
  }
  return true;
}

describe('ShellOperationRunner hard abort', () => {
  let child: ChildProcess | undefined;
  let grandchildPid: number | undefined;
  let spawnOptions: ILifecycleCommandOptions | undefined;

  function createGraph(
    supportsTerminateRunning: boolean,
    script: string = NEVER_ENDING_TREE_SCRIPT
  ): {
    graph: OperationGraph;
    grandchildStarted: Promise<number>;
  } {
    let onGrandchild: (pid: number) => void = () => undefined;
    const grandchildStarted: Promise<number> = new Promise((resolve) => (onGrandchild = resolve));
    jest.spyOn(Utilities, 'executeLifecycleCommandAsync').mockImplementation((command, options) => {
      spawnOptions = options;
      child = spawn(process.execPath, ['-e', script], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: !!options.connectSubprocessTerminator && SubprocessTerminator.RECOMMENDED_OPTIONS.detached
      });
      child.stdout!.on('data', (chunk: Buffer) => {
        const match: RegExpMatchArray | null = chunk.toString().match(/grandchild=(\d+)/);
        if (match) {
          grandchildPid = Number(match[1]);
          onGrandchild(grandchildPid);
        }
      });
      return child;
    });
    const phase: IPhase = {
      name: 'build',
      allowWarningsOnSuccess: false,
      associatedParameters: new Set(),
      dependencies: { self: new Set(), upstream: new Set() },
      isSynthetic: false,
      logFilenameIdentifier: 'build',
      missingScriptBehavior: 'silent'
    };
    const project: RushConfigurationProject = {
      packageName: 'sleeper',
      projectFolder: __dirname,
      rushConfiguration: { commonTempFolder: __dirname }
    } as RushConfigurationProject;
    const runner: ShellOperationRunner = new ShellOperationRunner({
      phase,
      rushProject: project,
      displayName: 'sleeper',
      initialCommand: 'node sleeper.js',
      incrementalCommand: undefined,
      commandForHash: 'node sleeper.js',
      ignoredParameterValues: []
    });
    const operation: Operation = new Operation({ phase, project, runner, logFilenameIdentifier: 'sleeper' });
    const graph: OperationGraph = new OperationGraph(new Set([operation]), {
      quietMode: true,
      debugMode: false,
      parallelism: 1,
      allowOversubscription: true,
      destinations: [new MockWritable()],
      abortController: new AbortController(),
      supportsTerminateRunning
    });
    return { graph, grandchildStarted };
  }

  afterEach(async () => {
    jest.restoreAllMocks();
    const lastChild: ChildProcess | undefined = child;
    const lastGrandchildPid: number | undefined = grandchildPid;
    child = undefined;
    grandchildPid = undefined;
    spawnOptions = undefined;
    if (lastGrandchildPid !== undefined && isAlive(lastGrandchildPid)) {
      process.kill(lastGrandchildPid, 'SIGKILL');
    }
    if (lastChild && lastChild.exitCode === null && lastChild.signalCode === null) {
      const closed: Promise<unknown> = once(lastChild, 'close');
      lastChild.kill('SIGKILL');
      await closed;
    }
  });

  it('kills the running process tree and reports Aborted without waiting for it to finish', async () => {
    const { graph, grandchildStarted } = createGraph(true);
    const execution: Promise<IExecutionResult> = graph.executeAsync({});
    const pid: number = await grandchildStarted;
    expect(spawnOptions?.connectSubprocessTerminator).toBe(true);

    const abortStart: number = Date.now();
    await graph.abortCurrentIterationAsync({ terminateRunning: true });
    const result: IExecutionResult = await execution;

    expect(Date.now() - abortStart).toBeLessThan(5000);
    expect(result.status).toBe(OperationStatus.Aborted);
    const [record] = [...result.operationResults.values()];
    expect(record.status).toBe(OperationStatus.Aborted);
    expect(record.error).toBeUndefined();
    expect(child!.exitCode !== null || child!.signalCode !== null).toBe(true);
    expect(await waitForExitAsync(pid, 5000)).toBe(true);
    // Aborted operations are not retained as the last execution result.
    expect(graph.resultByOperation.size).toBe(0);
  }, 20000);

  // Process groups are POSIX-only; Windows terminates the tree via TaskKill while the parent is alive.
  (process.platform === 'win32' ? it.skip : it)(
    'kills descendants that keep the output open after the shell itself has exited',
    async () => {
      const { graph, grandchildStarted } = createGraph(true, EXITED_PARENT_TREE_SCRIPT);
      const execution: Promise<IExecutionResult> = graph.executeAsync({});
      const pid: number = await grandchildStarted;
      const parent: ChildProcess = child!;
      if (parent.exitCode === null) {
        await once(parent, 'exit');
      }
      expect(isAlive(pid)).toBe(true);

      await graph.abortCurrentIterationAsync({ terminateRunning: true });
      const result: IExecutionResult = await execution;

      expect(result.status).toBe(OperationStatus.Aborted);
      expect(await waitForExitAsync(pid, 5000)).toBe(true);
    },
    20000
  );

  it('does not isolate or terminate processes when the graph does not support it', async () => {
    const { graph, grandchildStarted } = createGraph(false);
    const execution: Promise<IExecutionResult> = graph.executeAsync({});
    await grandchildStarted;
    expect(spawnOptions?.connectSubprocessTerminator).toBe(false);

    // A soft abort only prevents unstarted work; the running process keeps going.
    const abortPromise: Promise<void> = graph.abortCurrentIterationAsync({ terminateRunning: true });
    await delayAsync(300);
    expect(child!.exitCode).toBeNull();
    expect(child!.signalCode).toBeNull();

    child!.kill('SIGKILL');
    await abortPromise;
    expect((await execution).status).toBe(OperationStatus.Failure);
  }, 20000);
});
