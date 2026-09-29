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
import { performance } from 'node:perf_hooks';

import { SubprocessTerminator } from '@rushstack/node-core-library';
import { MockWritable } from '@rushstack/terminal';

import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import type { IOperationSettings } from '../../../api/RushProjectConfiguration';
import {
  PhasedCommandHooks,
  type ICreateOperationsContext,
  type IOperationGraphContext
} from '../../../pluginFramework/PhasedCommandHooks';
import { Utilities, type IEnvironment, type ILifecycleCommandOptions } from '../../../utilities/Utilities';
import { DaemonWarmWorkerPlugin } from '../DaemonWarmWorkerPlugin';
import {
  getCommandExecution,
  isBuildCacheReadSkipped,
  setIncrementalExecutionGuard,
  type IIncrementalExecutionGuard,
  type IIncrementalExecutionGuardOptions
} from '../IncrementalExecutionState';
import type { IExecutionResult, IOperationExecutionResult } from '../IOperationExecutionResult';
import { NullOperationRunner } from '../NullOperationRunner';
import { Operation } from '../Operation';
import { OperationExecutionRecord } from '../OperationExecutionRecord';
import { OperationGraph } from '../OperationGraph';
import { OperationStatus } from '../OperationStatus';
import { ShellOperationRunner } from '../ShellOperationRunner';
import { ShellOperationRunnerPlugin } from '../ShellOperationRunnerPlugin';
import {
  WarmWorkerOperationRunner,
  type IWarmWorkerOperationRunnerOptions
} from '../WarmWorkerOperationRunner';

const INITIAL_COMMAND: string = 'node build.js';
const INITIAL_IPC_COMMAND: string = 'node build.js --watch --clean';
const INCREMENTAL_IPC_COMMAND: string = 'node build.js --watch';

type WorkerBehavior = 'crash' | 'fail' | 'fail-reused' | 'hang' | 'grow' | 'request';

// Like `heft run-watch` with IPC: it sends "sync" when it starts, and answers each "run" with "after-execute". It
// prints the number of each run, and answers 20 ms later, so that the line arrives first. Its behavior:
// - crash: it exits when it receives a run;
// - fail: it prints an error and reports that each run failed, like a build with a compiler error;
// - fail-reused: like fail, but only from its second run on, like a worker that kept an error from an earlier run;
// - hang: it never answers a run;
// - grow: it reports 100 MB more resident memory after each run, instead of 100 MB;
// - request: it reports a change 50 ms after each run, like its file watcher would.
const WORKER_SCRIPT: string = `
  const behavior = process.env.WARM_WORKER_TEST_BEHAVIOR;
  let runs = 0;
  process.on('message', (message) => {
    if (message.command === 'exit') {
      process.exit(0);
    } else if (message.command === 'run') {
      runs++;
      if (behavior === 'crash') {
        process.exit(3);
      }
      console.log('worker run ' + runs);
      if (behavior === 'hang') {
        return;
      }
      const fails = behavior === 'fail' || (behavior === 'fail-reused' && runs > 1);
      if (fails) {
        console.error('worker error ' + runs);
      }
      setTimeout(() => {
        const residentMemoryBytes = 100000000 * (behavior === 'grow' ? runs : 1);
        const status = fails ? 'FAILURE' : 'SUCCESS';
        process.send({ event: 'after-execute', status, residentMemoryBytes });
        if (behavior === 'request') {
          setTimeout(() => process.send({ event: 'requestRun', requestor: 'watcher' }), 50);
        }
      }, 20);
    }
  });
  process.send({ event: 'sync' });
`;

const phase: IPhase = {
  name: '_phase:build',
  allowWarningsOnSuccess: false,
  associatedParameters: new Set(),
  dependencies: { self: new Set(), upstream: new Set() },
  isSynthetic: false,
  logFilenameIdentifier: '_phase_build',
  missingScriptBehavior: 'silent'
};

function createProject(
  packageName: string,
  scripts: Record<string, string> | undefined
): RushConfigurationProject {
  return {
    packageName,
    projectFolder: __dirname,
    packageJson: { name: packageName, version: '1.0.0', scripts },
    rushConfiguration: { commonTempFolder: __dirname }
  } as unknown as RushConfigurationProject;
}

interface ITestIteration {
  readonly result: IExecutionResult;
  readonly record: IOperationExecutionResult;
  readonly output: string;
  /**
   * The commands that started a process in this iteration, in order.
   */
  readonly commands: ReadonlyArray<string>;
  /**
   * The environment of each process in `commands`, merged from the options as Utilities merges it.
   */
  readonly environments: ReadonlyArray<IEnvironment>;
}

interface ITestHarness {
  readonly runner: WarmWorkerOperationRunner;
  readonly graph: OperationGraph;
  /**
   * The guard of the next iterations, or undefined for none.
   */
  guard: IIncrementalExecutionGuard | undefined;
  /**
   * The options that the runner passed to the guard, in order.
   */
  readonly guardOptions: IIncrementalExecutionGuardOptions[];
  blockReason: string | undefined;
  rerunReason: string | undefined;
  /**
   * The behavior of the workers that start from now on.
   */
  workerBehavior: WorkerBehavior | undefined;
  /**
   * The exit code of the initial commands that run in a shell from now on.
   */
  initialExitCode: number;
  shouldRunnerPersist: boolean;
  /**
   * The status that a tap at the default stage of `beforeExecuteOperationAsync` returns, e.g. `FromCache` for a
   * build cache hit, so that the runner does not execute.
   */
  earlyReturnStatus: OperationStatus | undefined;
  /**
   * For each iteration, whether the build cache read was skipped when a tap at the default stage of
   * `beforeExecuteOperationAsync`, like `CacheableOperationPlugin`'s, ran.
   */
  readonly isReadSkippedAtCacheStage: boolean[];
  executeAsync(): Promise<ITestIteration>;
  /**
   * Resolves when a worker printed the number of its next run.
   */
  waitForWorkerRunAsync(): Promise<void>;
}

const children: ChildProcess[] = [];
const graphs: OperationGraph[] = [];

beforeEach(() => {
  // Each test process is its own process tree.
  jest.spyOn(SubprocessTerminator, 'killProcessTree').mockImplementation((child: ChildProcess) => {
    child.kill('SIGTERM');
  });
});

afterEach(async () => {
  for (const graph of graphs.splice(0)) {
    await graph.closeRunnersAsync();
    graph.abortController.abort();
  }
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const closed: Promise<unknown> = once(child, 'close');
      child.kill();
      await closed;
    }
  }
  jest.mocked(Utilities.executeLifecycleCommandAsync).mockReset();
  jest.restoreAllMocks();
});

async function createHarnessAsync(
  options: Partial<IWarmWorkerOperationRunnerOptions> = {}
): Promise<ITestHarness> {
  const project: RushConfigurationProject = createProject('a', undefined);
  const runner: WarmWorkerOperationRunner = new WarmWorkerOperationRunner({
    phase,
    rushProject: project,
    displayName: 'a',
    initialCommand: INITIAL_COMMAND,
    initialIpcCommand: undefined,
    incrementalIpcCommand: INCREMENTAL_IPC_COMMAND,
    commandForHash: INITIAL_COMMAND,
    ignoredParameterValues: [],
    // Only the test of this wait waits.
    changeReportTimeoutMs: 0,
    ...options
  });
  const operation: Operation = new Operation({ phase, project, runner, logFilenameIdentifier: 'a' });
  const destination: MockWritable = new MockWritable();
  const graph: OperationGraph = new OperationGraph(new Set([operation]), {
    quietMode: false,
    debugMode: false,
    parallelism: 1,
    allowOversubscription: true,
    destinations: [destination],
    abortController: new AbortController(),
    // Like the graphs of the Rush daemon
    supportsTerminateRunning: true
  });
  graphs.push(graph);

  const commands: string[] = [];
  const environments: IEnvironment[] = [];
  const runWaiters: (() => void)[] = [];
  const harness: ITestHarness = {
    runner,
    graph,
    guard: undefined,
    guardOptions: [],
    blockReason: undefined,
    rerunReason: undefined,
    workerBehavior: undefined,
    initialExitCode: 0,
    shouldRunnerPersist: true,
    earlyReturnStatus: undefined,
    isReadSkippedAtCacheStage: [],
    executeAsync: async (): Promise<ITestIteration> => {
      commands.length = 0;
      environments.length = 0;
      destination.reset();
      const result: IExecutionResult = await graph.executeAsync({});
      return {
        result,
        record: result.operationResults.get(operation)!,
        output: destination.getAllOutput(),
        commands: [...commands],
        environments: [...environments]
      };
    },
    waitForWorkerRunAsync: () => new Promise<void>((resolve: () => void) => runWaiters.push(resolve))
  };
  harness.guard = {
    getBlockReasonAsync: async (guardOptions?: IIncrementalExecutionGuardOptions) => {
      harness.guardOptions.push({ ...guardOptions });
      return harness.blockReason;
    },
    verifyIncrementalResultAsync: async (guardOptions?: IIncrementalExecutionGuardOptions) => {
      harness.guardOptions.push({ ...guardOptions });
      return harness.rerunReason;
    }
  };

  jest
    .mocked(Utilities.executeLifecycleCommandAsync)
    .mockImplementation((command: string, lifecycleOptions: ILifecycleCommandOptions) => {
      const { ipc, initialEnvironment, additionalEnvironment } = lifecycleOptions;
      commands.push(command);
      environments.push({ ...(initialEnvironment ?? process.env), ...additionalEnvironment });
      let child: ChildProcess;
      if (ipc) {
        child = spawn(process.execPath, ['-e', WORKER_SCRIPT], {
          stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
          env: { ...process.env, WARM_WORKER_TEST_BEHAVIOR: harness.workerBehavior ?? '' }
        });
        child.stdout!.on('data', (data: Buffer) => {
          if (data.toString().includes('worker run')) {
            for (const resolve of runWaiters.splice(0)) {
              resolve();
            }
          }
        });
      } else {
        child = spawn(
          process.execPath,
          ['-e', `console.log("one-shot"); process.exitCode = ${harness.initialExitCode};`],
          {
            stdio: ['ignore', 'pipe', 'pipe']
          }
        );
      }
      children.push(child);
      return child;
    });

  // Like IncrementalExecutionGuardPlugin, which registers a guard for each record of an iteration.
  graph.hooks.beforeExecuteIterationAsync.tap(
    'test',
    (records: ReadonlyMap<Operation, IOperationExecutionResult>): void => {
      for (const record of records.values()) {
        if (harness.guard) {
          setIncrementalExecutionGuard(record, harness.guard);
        }
        (record as OperationExecutionRecord).shouldRunnerPersist = harness.shouldRunnerPersist;
      }
    }
  );
  // Registered before the plugin's tap, so that only the stages order them.
  graph.hooks.beforeExecuteOperationAsync.tapPromise(
    'test',
    async (record: IOperationExecutionResult): Promise<OperationStatus | undefined> => {
      harness.isReadSkippedAtCacheStage.push(isBuildCacheReadSkipped(record));
      return harness.earlyReturnStatus;
    }
  );
  const hooks: PhasedCommandHooks = new PhasedCommandHooks();
  new DaemonWarmWorkerPlugin().apply(hooks);
  await hooks.onGraphCreatedAsync.promise(graph, {
    isIncrementalBuildAllowed: true,
    isWatch: false
  } as unknown as IOperationGraphContext);
  return harness;
}

/**
 * The `TSC_WATCHFILE` variable of each process that started in the iteration, in order.
 */
function getTypeScriptWatchFiles(iteration: ITestIteration): (string | undefined)[] {
  return iteration.environments.map((environment: IEnvironment) => environment.TSC_WATCHFILE);
}

function expectLinesInOrder(output: string, lines: ReadonlyArray<string>): void {
  let index: number = -1;
  for (const line of lines) {
    const next: number = output.indexOf(line, index + 1);
    if (next < 0) {
      throw new Error(`Expected ${JSON.stringify(line)} after offset ${index} in:\n${output}`);
    }
    index = next;
  }
}

describe(WarmWorkerOperationRunner.name, () => {
  it('runs the initial command first, then starts a worker for an allowed incremental run, and sends it the next one', async () => {
    const harness: ITestHarness = await createHarnessAsync();

    // As for ShellOperationRunner, the first run is the initial command in a shell, and the guard is not asked.
    const first: ITestIteration = await harness.executeAsync();
    expect(first.result.status).toBe(OperationStatus.Success);
    expect(first.commands).toEqual([INITIAL_COMMAND]);
    expect(first.output).toContain(`Invoking (initial): ${INITIAL_COMMAND}`);
    expect(first.output).not.toContain('warm worker');
    expect(getCommandExecution(first.record)).toEqual({ kind: 'initial', hasIncrementalCommand: true });
    expect(harness.guardOptions).toEqual([]);
    expect(harness.runner.isActive).toBe(false);

    const second: ITestIteration = await harness.executeAsync();
    expect(second.result.status).toBe(OperationStatus.Success);
    expect(second.commands).toEqual([INCREMENTAL_IPC_COMMAND]);
    expectLinesInOrder(second.output, [
      `Invoking (incremental): ${INCREMENTAL_IPC_COMMAND}`,
      'Starting a warm worker for it.',
      'worker run 1'
    ]);
    expect(getCommandExecution(second.record)).toEqual({
      kind: 'incremental',
      hasIncrementalCommand: true,
      watchesInputs: true
    });
    expect(harness.runner.isActive).toBe(true);
    const pid: number = harness.runner.workerPid!;

    const third: ITestIteration = await harness.executeAsync();
    expect(third.result.status).toBe(OperationStatus.Success);
    expect(third.commands).toEqual([]);
    expectLinesInOrder(third.output, [
      `Invoking (incremental): ${INCREMENTAL_IPC_COMMAND}`,
      `Sending run 2 to the warm worker (pid ${pid}).`,
      'worker run 2'
    ]);
    expect(third.output).not.toContain('Starting a warm worker');
    expect(getCommandExecution(third.record)).toEqual({
      kind: 'incremental',
      hasIncrementalCommand: true,
      watchesInputs: true
    });
    expect(harness.runner.workerPid).toBe(pid);
    expect(harness.runner.residentMemoryBytes).toBe(100000000);

    // The build cache may restore an operation without a worker, but a restore would not update what a running
    // worker keeps in memory.
    expect(harness.isReadSkippedAtCacheStage).toEqual([false, false, true]);
    // Each allowed run asks the guard twice: before it runs and after it succeeded.
    expect(harness.guardOptions).toEqual(new Array(4).fill({ outputsMayBeBundles: true }));

    const worker: ChildProcess = children[1];
    await harness.graph.closeRunnersAsync();
    expect(harness.runner.isActive).toBe(false);
    expect(worker.exitCode).toBe(0);
  });

  it('starts each worker with a TypeScript file watcher that sees replaced files', async () => {
    const harness: ITestHarness = await createHarnessAsync();
    harness.graph.hooks.createEnvironmentForOperation.tap('test', (environment: IEnvironment) => {
      delete environment.TSC_WATCHFILE;
      return environment;
    });

    // The initial command in a shell does not watch files, and keeps the environment of the operation.
    const first: ITestIteration = await harness.executeAsync();
    expect(first.commands).toEqual([INITIAL_COMMAND]);
    expect(getTypeScriptWatchFiles(first)).toEqual([undefined]);

    const second: ITestIteration = await harness.executeAsync();
    expect(second.commands).toEqual([INCREMENTAL_IPC_COMMAND]);
    expect(getTypeScriptWatchFiles(second)).toEqual(['UseFsEventsOnParentDirectory']);
  });

  it('keeps the TypeScript file watcher that the environment of the operation chooses', async () => {
    const harness: ITestHarness = await createHarnessAsync({ initialIpcCommand: INITIAL_IPC_COMMAND });
    harness.graph.hooks.createEnvironmentForOperation.tap('test', (environment: IEnvironment) => {
      environment.TSC_WATCHFILE = 'PriorityPollingInterval';
      return environment;
    });

    const first: ITestIteration = await harness.executeAsync();
    expect(first.commands).toEqual([INITIAL_IPC_COMMAND]);
    expect(getTypeScriptWatchFiles(first)).toEqual(['PriorityPollingInterval']);
  });

  it('closes the worker before the initial command if the guard does not allow an incremental run', async () => {
    const harness: ITestHarness = await createHarnessAsync();
    await harness.executeAsync();
    await harness.executeAsync();
    const worker: ChildProcess = children[1];

    harness.blockReason = 'its command line changed';
    const blocked: ITestIteration = await harness.executeAsync();
    expect(blocked.result.status).toBe(OperationStatus.Success);
    expect(blocked.commands).toEqual([INITIAL_COMMAND]);
    expectLinesInOrder(blocked.output, [
      'Not using the incremental command because its command line changed.',
      `Closing the warm worker (pid ${worker.pid}), because the initial command must run.`,
      `Invoking (initial): ${INITIAL_COMMAND}`
    ]);
    // It exited before the build cache could restore the operation.
    expect(worker.exitCode).toBe(0);
    expect(harness.isReadSkippedAtCacheStage[2]).toBe(false);
    expect(getCommandExecution(blocked.record)).toEqual({ kind: 'initial', hasIncrementalCommand: true });
    expect(harness.runner.isActive).toBe(false);

    harness.blockReason = undefined;
    const next: ITestIteration = await harness.executeAsync();
    expect(next.commands).toEqual([INCREMENTAL_IPC_COMMAND]);
    expect(next.output).toContain('Starting a warm worker for it.');
  });

  it('writes why it closed the worker if the build cache restores the operation', async () => {
    const harness: ITestHarness = await createHarnessAsync();
    await harness.executeAsync();
    await harness.executeAsync();
    const worker: ChildProcess = children[1];

    harness.blockReason = 'its command line changed';
    harness.earlyReturnStatus = OperationStatus.FromCache;
    const restored: ITestIteration = await harness.executeAsync();
    expect(restored.record.status).toBe(OperationStatus.FromCache);
    expect(restored.commands).toEqual([]);
    expectLinesInOrder(restored.output, [
      'Not using the incremental command because its command line changed.',
      `Closing the warm worker (pid ${worker.pid}), because the initial command must run.`
    ]);
    expect(worker.exitCode).toBe(0);
    expect(harness.runner.isActive).toBe(false);

    // If the runner executes, its notes are written once.
    harness.earlyReturnStatus = undefined;
    const blocked: ITestIteration = await harness.executeAsync();
    expect(blocked.commands).toEqual([INITIAL_COMMAND]);
    expect(blocked.output.split('Not using the incremental command because').length).toBe(2);
  });

  it('closes the worker before the initial command if the operation has no guard, e.g. in a rebuild', async () => {
    const harness: ITestHarness = await createHarnessAsync();
    await harness.executeAsync();
    await harness.executeAsync();
    const worker: ChildProcess = children[1];

    harness.guard = undefined;
    const rebuilt: ITestIteration = await harness.executeAsync();
    expect(rebuilt.commands).toEqual([INITIAL_COMMAND]);
    expectLinesInOrder(rebuilt.output, [
      `Closing the warm worker (pid ${worker.pid}), because the initial command must run.`,
      `Invoking (initial): ${INITIAL_COMMAND}`
    ]);
    expect(rebuilt.output).not.toContain('Not using the incremental command');
    expect(worker.exitCode).toBe(0);
  });

  it('closes the worker before the initial command if the operation has no last state, even if it has a guard', async () => {
    const harness: ITestHarness = await createHarnessAsync();
    await harness.executeAsync();
    await harness.executeAsync();
    const worker: ChildProcess = children[1];

    // Like a graph whose iteration allows no incremental build: it keeps the results, but passes no last state.
    const { executeAsync } = OperationExecutionRecord.prototype;
    jest.spyOn(OperationExecutionRecord.prototype, 'executeAsync').mockImplementation(function (
      this: OperationExecutionRecord,
      lastState: OperationExecutionRecord | undefined,
      executeContext: Parameters<OperationExecutionRecord['executeAsync']>[1]
    ): Promise<void> {
      return executeAsync.call(this, undefined, executeContext);
    });
    const rebuilt: ITestIteration = await harness.executeAsync();
    expect(rebuilt.commands).toEqual([INITIAL_COMMAND]);
    expectLinesInOrder(rebuilt.output, [
      `Closing the warm worker (pid ${worker.pid}), because the initial command must run.`,
      `Invoking (initial): ${INITIAL_COMMAND}`
    ]);
    expect(rebuilt.output).not.toContain('Not using the incremental command');
    expect(getCommandExecution(rebuilt.record)).toEqual({ kind: 'initial', hasIncrementalCommand: true });
    expect(worker.exitCode).toBe(0);
  });

  it('writes that a worker was closed between builds, e.g. by the warm set of the Rush daemon, once', async () => {
    const harness: ITestHarness = await createHarnessAsync();
    await harness.executeAsync();
    await harness.executeAsync();
    const worker: ChildProcess = children[1];

    // Like the warm set of the Rush daemon, which closes the runners of a project and drops its results.
    const operations: Operation[] = [...harness.graph.operations];
    await harness.graph.closeRunnersAsync(operations);
    harness.graph.deleteResults(operations);
    expect(worker.exitCode).toBe(0);

    const next: ITestIteration = await harness.executeAsync();
    expect(next.commands).toEqual([INITIAL_COMMAND]);
    expectLinesInOrder(next.output, [
      `The warm worker (pid ${worker.pid}) was closed after the operation last ran.`,
      `Invoking (initial): ${INITIAL_COMMAND}`
    ]);

    // Closing a runner without a worker writes nothing.
    await harness.runner.closeAsync();
    const again: ITestIteration = await harness.executeAsync();
    expect(again.commands).toEqual([INCREMENTAL_IPC_COMMAND]);
    expect(again.output).not.toContain('was closed after the operation last ran');
  });

  it('writes that a worker was closed between builds if the build cache restores the operation, once', async () => {
    const harness: ITestHarness = await createHarnessAsync();
    await harness.executeAsync();
    await harness.executeAsync();
    const worker: ChildProcess = children[1];

    await harness.runner.closeAsync();
    harness.earlyReturnStatus = OperationStatus.FromCache;
    const restored: ITestIteration = await harness.executeAsync();
    expect(restored.record.status).toBe(OperationStatus.FromCache);
    expect(restored.output).toContain(
      `The warm worker (pid ${worker.pid}) was closed after the operation last ran.`
    );

    harness.earlyReturnStatus = undefined;
    const next: ITestIteration = await harness.executeAsync();
    expect(next.commands).toEqual([INCREMENTAL_IPC_COMMAND]);
    expect(next.output).not.toContain('was closed after the operation last ran');
  });

  it('runs the initial command after an incremental run whose outputs the guard does not accept', async () => {
    const harness: ITestHarness = await createHarnessAsync();
    await harness.executeAsync();

    harness.rerunReason =
      'the incremental command changed which output files it has: 1 added ("lib/chunk.js")';
    const rerun: ITestIteration = await harness.executeAsync();
    expect(rerun.result.status).toBe(OperationStatus.Success);
    expect(rerun.commands).toEqual([INCREMENTAL_IPC_COMMAND, INITIAL_COMMAND]);
    expectLinesInOrder(rerun.output, [
      `Invoking (incremental): ${INCREMENTAL_IPC_COMMAND}`,
      'Starting a warm worker for it.',
      'worker run 1',
      'Running the initial command, because the incremental command changed which output files it has: 1 added ("lib/chunk.js").',
      `Closing the warm worker (pid ${children[1].pid}), because the initial command must run.`,
      `Invoking (initial): ${INITIAL_COMMAND}`
    ]);
    expect(getCommandExecution(rerun.record)).toEqual({ kind: 'initial', hasIncrementalCommand: true });
    expect(harness.runner.isActive).toBe(false);
  });

  it('runs the initial command after a failed run on a reused worker, and reports the status of the initial command', async () => {
    const harness: ITestHarness = await createHarnessAsync();
    await harness.executeAsync();
    // E.g. a worker whose module resolution kept an error from an earlier run.
    harness.workerBehavior = 'fail-reused';
    expect((await harness.executeAsync()).result.status).toBe(OperationStatus.Success);
    const worker: ChildProcess = children[1];
    const pid: number = harness.runner.workerPid!;

    const recovered: ITestIteration = await harness.executeAsync();
    expect(recovered.result.status).toBe(OperationStatus.Success);
    expect(recovered.commands).toEqual([INITIAL_COMMAND]);
    expectLinesInOrder(recovered.output, [
      `Sending run 2 to the warm worker (pid ${pid}).`,
      'worker error 2',
      'Running the initial command, because the run on the warm worker failed.',
      `Closing the warm worker (pid ${pid}), because the initial command must run.`,
      `Invoking (initial): ${INITIAL_COMMAND}`,
      'one-shot'
    ]);
    expect(recovered.record.error).toBeUndefined();
    expect(getCommandExecution(recovered.record)).toEqual({ kind: 'initial', hasIncrementalCommand: true });
    expect(worker.exitCode).toBe(0);
    expect(harness.runner.isActive).toBe(false);

    // A genuine error fails the initial command too.
    expect((await harness.executeAsync()).output).toContain('Starting a warm worker for it.');
    harness.initialExitCode = 2;
    const failed: ITestIteration = await harness.executeAsync();
    expect(failed.result.status).toBe(OperationStatus.Failure);
    expect(failed.commands).toEqual([INITIAL_COMMAND]);
    expectLinesInOrder(failed.output, [
      'worker error 2',
      'Running the initial command, because the run on the warm worker failed.',
      `Invoking (initial): ${INITIAL_COMMAND}`
    ]);
    expect(failed.record.error?.message).toContain('Returned error code: 2');
    expect(harness.runner.isActive).toBe(false);
  });

  it('reports a failed first run of a new worker as it stands, and closes the worker', async () => {
    const harness: ITestHarness = await createHarnessAsync();
    await harness.executeAsync();
    harness.workerBehavior = 'fail';
    const failed: ITestIteration = await harness.executeAsync();
    expect(failed.result.status).toBe(OperationStatus.Failure);
    expect(failed.commands).toEqual([INCREMENTAL_IPC_COMMAND]);
    const worker: ChildProcess = children[1];
    expectLinesInOrder(failed.output, [
      'Starting a warm worker for it.',
      'worker error 1',
      `Closing the warm worker (pid ${worker.pid}), because the operation failed, so its next build runs the initial command.`
    ]);
    expect(failed.output).not.toContain('Running the initial command');
    expect(worker.exitCode).toBe(0);
    expect(harness.runner.isActive).toBe(false);
  });

  it('closes a worker whose initial run failed', async () => {
    const harness: ITestHarness = await createHarnessAsync({ initialIpcCommand: INITIAL_IPC_COMMAND });
    harness.workerBehavior = 'fail';
    const failed: ITestIteration = await harness.executeAsync();
    expect(failed.result.status).toBe(OperationStatus.Failure);
    expect(failed.commands).toEqual([INITIAL_IPC_COMMAND]);
    const worker: ChildProcess = children[0];
    expectLinesInOrder(failed.output, [
      `Invoking (initial): ${INITIAL_IPC_COMMAND}`,
      'Starting a warm worker for it.',
      'worker error 1',
      `Closing the warm worker (pid ${worker.pid}), because the operation failed, so its next build runs the initial command.`
    ]);
    expect(worker.exitCode).toBe(0);
    expect(harness.runner.isActive).toBe(false);
  });

  it('runs the initial command in a new worker if the project has an ipc script, and reuses that worker', async () => {
    const harness: ITestHarness = await createHarnessAsync({ initialIpcCommand: INITIAL_IPC_COMMAND });

    const first: ITestIteration = await harness.executeAsync();
    expect(first.result.status).toBe(OperationStatus.Success);
    expect(first.commands).toEqual([INITIAL_IPC_COMMAND]);
    expectLinesInOrder(first.output, [
      `Invoking (initial): ${INITIAL_IPC_COMMAND}`,
      'Starting a warm worker for it.',
      'worker run 1'
    ]);
    expect(getCommandExecution(first.record)).toEqual({
      kind: 'initial',
      hasIncrementalCommand: true,
      watchesInputs: true
    });
    const firstPid: number = harness.runner.workerPid!;

    const second: ITestIteration = await harness.executeAsync();
    expect(second.commands).toEqual([]);
    expectLinesInOrder(second.output, [
      `Invoking (incremental): ${INCREMENTAL_IPC_COMMAND}`,
      `Sending run 2 to the warm worker (pid ${firstPid}).`,
      'worker run 2'
    ]);
    expect(harness.isReadSkippedAtCacheStage).toEqual([false, true]);

    // A build from scratch must not run on top of what the worker keeps in memory.
    harness.blockReason = 'its dependencies changed';
    const blocked: ITestIteration = await harness.executeAsync();
    expect(blocked.commands).toEqual([INITIAL_IPC_COMMAND]);
    expectLinesInOrder(blocked.output, [
      'Not using the incremental command because its dependencies changed.',
      `Closing the warm worker (pid ${firstPid}), because the initial command must run.`,
      `Invoking (initial): ${INITIAL_IPC_COMMAND}`,
      'Starting a warm worker for it.',
      'worker run 1'
    ]);
    expect(harness.runner.workerPid).not.toBe(firstPid);
  });

  it('closes a worker after its maximum number of runs', async () => {
    const harness: ITestHarness = await createHarnessAsync({ maxRunsPerWorker: 2 });
    await harness.executeAsync();
    await harness.executeAsync();
    const pid: number = harness.runner.workerPid!;

    const last: ITestIteration = await harness.executeAsync();
    expectLinesInOrder(last.output, [
      `Sending run 2 to the warm worker (pid ${pid}).`,
      'worker run 2',
      `Closing the warm worker (pid ${pid}), because it has run 2 times.`
    ]);
    expect(last.result.status).toBe(OperationStatus.Success);
    expect(harness.runner.isActive).toBe(false);
    expect((await harness.executeAsync()).output).toContain('Starting a warm worker for it.');
  });

  it('closes a worker once its memory grew too much', async () => {
    const harness: ITestHarness = await createHarnessAsync({ maxMemoryGrowth: 1.5 });
    harness.workerBehavior = 'grow';
    await harness.executeAsync();
    await harness.executeAsync();
    const pid: number = harness.runner.workerPid!;
    expect(harness.runner.residentMemoryBytes).toBe(100000000);

    const grown: ITestIteration = await harness.executeAsync();
    expect(grown.output).toContain(
      `Closing the warm worker (pid ${pid}), because its memory grew from 95 MB after its first run to 191 MB.`
    );
    expect(harness.runner.isActive).toBe(false);
  });

  it('waits for a reused worker to report a change before it sends the next run, for at most the timeout', async () => {
    const harness: ITestHarness = await createHarnessAsync({ changeReportTimeoutMs: 500 });
    await harness.executeAsync();
    await harness.executeAsync();
    const unreportedStart: number = performance.now();
    const unreported: ITestIteration = await harness.executeAsync();
    expect(performance.now() - unreportedStart).toBeGreaterThanOrEqual(450);
    expect(unreported.output).toContain('Sending run 2 to the warm worker');

    const reporting: ITestHarness = await createHarnessAsync({ changeReportTimeoutMs: 10000 });
    reporting.workerBehavior = 'request';
    await reporting.executeAsync();
    await reporting.executeAsync();
    const reportedStart: number = performance.now();
    const reported: ITestIteration = await reporting.executeAsync();
    expect(performance.now() - reportedStart).toBeLessThan(2000);
    expect(reported.output).toContain('Sending run 2 to the warm worker');
  });

  it('runs the initial command if the worker exits during a run, and starts a new worker for the next one', async () => {
    const harness: ITestHarness = await createHarnessAsync();
    await harness.executeAsync();
    harness.workerBehavior = 'crash';
    const crashed: ITestIteration = await harness.executeAsync();
    expect(crashed.result.status).toBe(OperationStatus.Success);
    expect(crashed.commands).toEqual([INCREMENTAL_IPC_COMMAND, INITIAL_COMMAND]);
    expectLinesInOrder(crashed.output, [
      'Starting a warm worker for it.',
      'The warm worker exited before it reported the result of its run (exit code 3).',
      'Running the initial command, because the run on the warm worker failed.',
      `Invoking (initial): ${INITIAL_COMMAND}`
    ]);
    expect(crashed.record.error).toBeUndefined();
    expect(getCommandExecution(crashed.record)).toEqual({ kind: 'initial', hasIncrementalCommand: true });
    expect(harness.runner.isActive).toBe(false);

    harness.workerBehavior = undefined;
    const next: ITestIteration = await harness.executeAsync();
    expect(next.result.status).toBe(OperationStatus.Success);
    expect(next.commands).toEqual([INCREMENTAL_IPC_COMMAND]);
    expect(next.output).toContain('Starting a warm worker for it.');
  });

  it('terminates the worker if the operation is aborted, and starts a new worker for the next run', async () => {
    const harness: ITestHarness = await createHarnessAsync();
    await harness.executeAsync();
    harness.workerBehavior = 'hang';
    const running: Promise<void> = harness.waitForWorkerRunAsync();
    const execution: Promise<ITestIteration> = harness.executeAsync();
    await running;
    const worker: ChildProcess = children[1];
    await harness.graph.abortCurrentIterationAsync({ terminateRunning: true });
    const aborted: ITestIteration = await execution;
    expect(aborted.result.status).toBe(OperationStatus.Aborted);
    // An aborted run is not a failure, so the initial command does not run.
    expect(aborted.commands).toEqual([INCREMENTAL_IPC_COMMAND]);
    expect(aborted.output).toContain('Terminated because the operation was aborted.');
    expect(worker.signalCode).toBe('SIGTERM');
    expect(harness.runner.isActive).toBe(false);

    harness.workerBehavior = undefined;
    const next: ITestIteration = await harness.executeAsync();
    expect(next.result.status).toBe(OperationStatus.Success);
    expect(next.commands).toEqual([INCREMENTAL_IPC_COMMAND]);
    expect(next.output).toContain('Starting a warm worker for it.');
  });

  it('closes the worker after its run if the runner should not persist', async () => {
    const harness: ITestHarness = await createHarnessAsync();
    await harness.executeAsync();
    harness.shouldRunnerPersist = false;
    const closed: ITestIteration = await harness.executeAsync();
    expect(closed.result.status).toBe(OperationStatus.Success);
    expect(closed.commands).toEqual([INCREMENTAL_IPC_COMMAND]);
    expect(harness.runner.isActive).toBe(false);
    expect(children[1].exitCode).toBe(0);
  });

  it('waits for the worker to exit in each concurrent close', async () => {
    const harness: ITestHarness = await createHarnessAsync();
    await harness.executeAsync();
    await harness.executeAsync();
    const worker: ChildProcess = children[1];
    const exitCodes: (number | null)[] = [];
    await Promise.all(
      [harness.runner.closeAsync(), harness.runner.closeAsync()].map(async (promise: Promise<void>) => {
        await promise;
        exitCodes.push(worker.exitCode);
      })
    );
    expect(exitCodes).toEqual([0, 0]);
    await harness.runner.closeAsync();
  });
});

describe(DaemonWarmWorkerPlugin.name, () => {
  it('creates warm worker runners only for opted-in operations with an incremental ipc script and no other runner', async () => {
    const scripts: Record<string, string> = {
      '_phase:build': 'heft run --only build -- --clean',
      '_phase:build:incremental:ipc': 'heft run-watch --only build --'
    };
    const optedIn: IOperationSettings = { operationName: phase.name, allowDaemonWarmWorker: true };
    const createOperation = (
      name: string,
      projectScripts: Record<string, string> | undefined,
      runner?: NullOperationRunner,
      settings: IOperationSettings | false = optedIn
    ): Operation =>
      new Operation({
        phase,
        project: createProject(name, projectScripts),
        runner,
        settings: settings || undefined,
        logFilenameIdentifier: name
      });
    const warm: Operation = createOperation('warm', scripts);
    const warmWithIpc: Operation = createOperation('warm-with-ipc', {
      ...scripts,
      '_phase:build:ipc': 'heft run-watch --only build -- --clean'
    });
    // `rush start` runs the same script in watch mode, so the script alone does not opt in.
    const withoutSettings: Operation = createOperation('without-settings', scripts, undefined, false);
    const withoutField: Operation = createOperation('without-field', scripts, undefined, {
      operationName: phase.name
    });
    const optedOut: Operation = createOperation('opted-out', scripts, undefined, {
      operationName: phase.name,
      allowDaemonWarmWorker: false
    });
    const withoutIpcScript: Operation = createOperation('without-ipc-script', {
      '_phase:build': scripts['_phase:build']
    });
    const withoutScript: Operation = createOperation('without-script', {
      '_phase:build:incremental:ipc': scripts['_phase:build:incremental:ipc']
    });
    const existingRunner: NullOperationRunner = new NullOperationRunner({
      name: 'existing',
      result: OperationStatus.NoOp,
      silent: true
    });
    const withRunner: Operation = createOperation('with-runner', scripts, existingRunner);

    // Like PhasedScriptAction, which applies the plugin after ShellOperationRunnerPlugin.
    const hooks: PhasedCommandHooks = new PhasedCommandHooks();
    new ShellOperationRunnerPlugin().apply(hooks);
    new DaemonWarmWorkerPlugin().apply(hooks);
    const context: ICreateOperationsContext = {
      isIncrementalBuildAllowed: true,
      isWatch: false
    } as unknown as ICreateOperationsContext;
    await hooks.createOperationsAsync.promise(
      new Set([
        warm,
        warmWithIpc,
        withoutSettings,
        withoutField,
        optedOut,
        withoutIpcScript,
        withoutScript,
        withRunner
      ]),
      context
    );

    expect(warm.runner).toBeInstanceOf(WarmWorkerOperationRunner);
    expect(warmWithIpc.runner).toBeInstanceOf(WarmWorkerOperationRunner);
    expect(withoutSettings.runner).toBeInstanceOf(ShellOperationRunner);
    expect(withoutField.runner).toBeInstanceOf(ShellOperationRunner);
    expect(optedOut.runner).toBeInstanceOf(ShellOperationRunner);
    expect(withoutIpcScript.runner).toBeInstanceOf(ShellOperationRunner);
    expect(withoutScript.runner).toBeInstanceOf(NullOperationRunner);
    expect(withRunner.runner).toBe(existingRunner);

    // Its build cache entries are those of ShellOperationRunner.
    const shellHooks: PhasedCommandHooks = new PhasedCommandHooks();
    new ShellOperationRunnerPlugin().apply(shellHooks);
    const shellTwin: Operation = createOperation('shell-twin', scripts);
    await shellHooks.createOperationsAsync.promise(new Set([shellTwin]), context);
    expect(shellTwin.runner).toBeInstanceOf(ShellOperationRunner);
    expect(warm.runner!.getConfigHash()).toBe(shellTwin.runner!.getConfigHash());

    // Watch mode has its own IPC runners, and a command that allows no incremental run does not need workers.
    for (const otherContext of [
      { ...context, isWatch: true },
      { ...context, isIncrementalBuildAllowed: false }
    ]) {
      const operation: Operation = createOperation('other', scripts);
      await hooks.createOperationsAsync.promise(new Set([operation]), otherContext);
      expect(operation.runner).toBeInstanceOf(ShellOperationRunner);
    }
  });
});
