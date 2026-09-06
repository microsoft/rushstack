// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('../../../utilities/Utilities');
jest.mock('../OperationStateFile');
jest.mock('../ProjectLogWritable', () => {
  const actual = jest.requireActual('../ProjectLogWritable');
  const { MockWritable } = jest.requireActual('@rushstack/terminal');
  return { ...actual, initializeProjectLogFilesAsync: jest.fn(async () => new MockWritable()) };
});

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';

import { MockWritable } from '@rushstack/terminal';

import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import { Utilities } from '../../../utilities/Utilities';
import { IPCOperationRunner } from '../IPCOperationRunner';
import { Operation } from '../Operation';
import { OperationGraph } from '../OperationGraph';
import { OperationStatus } from '../OperationStatus';

describe('native IPC resource lifetime and measured RSS', () => {
  let child: ChildProcess;
  let closed: Promise<unknown>;
  let graph: OperationGraph;
  let runner: IPCOperationRunner;

  function create(script: string): void {
    jest.mocked(Utilities.executeLifecycleCommandAsync).mockImplementation(() => {
      child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
      closed = once(child, 'close');
      return child;
    });
    const phase: IPhase = {
      name: 'phase',
      allowWarningsOnSuccess: false,
      associatedParameters: new Set(),
      dependencies: { self: new Set(), upstream: new Set() },
      isSynthetic: false,
      logFilenameIdentifier: 'phase',
      missingScriptBehavior: 'silent'
    };
    const project: RushConfigurationProject = {
      packageName: 'ipc',
      projectFolder: __dirname,
      rushConfiguration: { commonTempFolder: __dirname }
    } as RushConfigurationProject;
    runner = new IPCOperationRunner({
      name: 'ipc',
      phase,
      project,
      initialCommand: 'initial',
      incrementalCommand: 'incremental',
      commandForHash: 'build',
      ignoredParameterValues: []
    });
    const operation: Operation = new Operation({ phase, project, runner, logFilenameIdentifier: 'ipc' });
    graph = new OperationGraph(new Set([operation]), {
      quietMode: true,
      debugMode: false,
      parallelism: 3,
      allowOversubscription: true,
      destinations: [new MockWritable()],
      abortController: new AbortController()
    });
  }

  afterEach(async () => {
    if (child?.exitCode === null && child.signalCode === null) child.kill();
    await closed;
    graph?.abortController.abort();
    jest.mocked(Utilities.executeLifecycleCommandAsync).mockReset();
  });

  it('accepts producer RSS, leaves old children unmeasured, and clears invalid/stopped samples', async () => {
    create(`
      let runs = 0;
      process.on('message', message => {
        if (message.command === 'exit') process.exit(0);
        if (message.command === 'run') {
          runs++;
          const telemetry = runs === 1 ? {} :
            { residentMemoryBytes: runs === 2 ? process.memoryUsage().rss : -1 };
          process.send({ event: 'after-execute', status: 'SUCCESS', ...telemetry });
        }
      });
      process.send({ event: 'sync' });
    `);
    await graph.executeAsync({});
    expect(runner.residentMemoryBytes).toBeUndefined();
    await graph.executeAsync({});
    expect(runner.residentMemoryBytes).toBeGreaterThan(0);
    await graph.executeAsync({});
    expect(runner.residentMemoryBytes).toBeUndefined();
    await graph.closeRunnersAsync();
    expect(runner.isActive).toBe(false);
    expect(runner.residentMemoryBytes).toBeUndefined();
    expect(Utilities.executeLifecycleCommandAsync).toHaveBeenCalledTimes(1);
  });

  it('does not report success if a retiring IPC child exits before reporting a result', async () => {
    create(`
      process.on('message', () => process.exit(0));
      process.send({ event: 'sync' });
    `);
    const result = await graph.executeAsync({});
    expect(result.status).toBe(OperationStatus.Failure);
    expect([...result.operationResults.values()][0].error?.message).toContain('before reporting');
    await graph.closeRunnersAsync();
  });

  it('awaits close even after exit while descendant stdio is still open', async () => {
    create(`
      process.on('message', message => {
        if (message.command === 'run') process.send({ event: 'after-execute', status: 'SUCCESS' });
        if (message.command === 'exit') {
          require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 150)'],
            { stdio: ['ignore', 1, 2] });
          process.exit(0);
        }
      });
      process.send({ event: 'sync' });
    `);
    await graph.executeAsync({});
    const exited: Promise<unknown> = once(child, 'exit');
    let isClosed: boolean = false;
    const observedClose: Promise<void> = closed.then(() => {
      isClosed = true;
    });
    const closing: Promise<void> = graph.closeRunnersAsync();
    await exited;
    let secondClosed: boolean = false;
    const secondClosing: Promise<void> = graph.closeRunnersAsync().then(() => {
      secondClosed = true;
    });
    await Promise.resolve();
    expect(secondClosed).toBe(false);
    expect(isClosed).toBe(false);
    await Promise.all([closing, secondClosing, observedClose]);
    expect(isClosed).toBe(true);
    expect(runner.isActive).toBe(false);
  });
});
