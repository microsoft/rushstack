// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

type MockFsListener = (eventType: string, fileName: string) => void;

// The listeners of the watcher's open file system watchers, so that tests can simulate file changes.
const mockFsListeners: Set<MockFsListener> = new Set();

jest.mock('node:fs', () => {
  const actual: typeof import('node:fs') = jest.requireActual('node:fs');
  const { EventEmitter } = jest.requireActual<typeof import('node:events')>('node:events');
  class MockFsWatcher extends EventEmitter {
    readonly #listener: MockFsListener;
    public constructor(listener: MockFsListener) {
      super();
      this.#listener = listener;
      mockFsListeners.add(listener);
    }
    public close(): void {
      mockFsListeners.delete(this.#listener);
      this.emit('close');
    }
    public unref(): this {
      return this;
    }
  }
  return {
    ...actual,
    watch: jest.fn(
      (watchedPath: string, options: unknown, listener: MockFsListener) => new MockFsWatcher(listener)
    )
  };
});
jest.mock('@rushstack/package-deps-hash', () => {
  const actual: typeof import('@rushstack/package-deps-hash') = jest.requireActual(
    '@rushstack/package-deps-hash'
  );
  return { ...actual, getRepoRoot: () => '/repo' };
});
jest.mock('../Git', () => ({
  Git: class {
    public getGitPathOrThrow(): string {
      return 'git';
    }
  }
}));
jest.mock('../operations/OperationStateFile');
// Mock project log file creation to avoid filesystem writes.
jest.mock('../operations/ProjectLogWritable', () => {
  const actual: typeof import('../operations/ProjectLogWritable') = jest.requireActual(
    '../operations/ProjectLogWritable'
  );
  const { TerminalWritable } =
    jest.requireActual<typeof import('@rushstack/terminal')>('@rushstack/terminal');
  class MockTerminalWritable extends TerminalWritable {
    protected onWriteChunk(): void {
      /* noop */
    }
  }
  return {
    ...actual,
    initializeProjectLogFilesAsync: jest.fn(async () => new MockTerminalWritable())
  };
});

import { setTimeout as sleepAsync } from 'node:timers/promises';

import { AnsiEscape, MockWritable, StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import type { IPhase } from '../../api/CommandLineConfiguration';
import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IInputsSnapshot } from '../incremental/InputsSnapshot';
import type { IOperationRunner, IOperationRunnerContext } from '../operations/IOperationRunner';
import type { IOperationExecutionResult } from '../operations/IOperationExecutionResult';
import { Operation } from '../operations/Operation';
import { OperationGraph } from '../operations/OperationGraph';
import { OperationStatus } from '../operations/OperationStatus';
import { ProjectWatcher } from '../ProjectWatcher';

const DEBOUNCE_MS: number = 10;
const REQUESTOR: string = 'test-requestor';

// The statuses of a result that PhasedOperationPlugin keeps if the operation's inputs did not change.
const RETAINED_STATUSES: ReadonlySet<OperationStatus> = new Set([
  OperationStatus.Success,
  OperationStatus.FromCache,
  OperationStatus.NoOp,
  OperationStatus.Skipped
]);

const mockPhase: IPhase = {
  name: 'phase',
  allowWarningsOnSuccess: false,
  associatedParameters: new Set(),
  dependencies: {
    self: new Set(),
    upstream: new Set()
  },
  isSynthetic: false,
  logFilenameIdentifier: 'phase',
  missingScriptBehavior: 'silent'
};

type TestRunnerAction = (runCount: number) => Promise<OperationStatus | void> | OperationStatus | void;

/**
 * Like an IPC runner, keeps the invalidate callback of its first run to request more runs.
 */
class TestRunner implements IOperationRunner {
  public readonly name: string;
  public readonly cacheable: boolean = false;
  public readonly reportTiming: boolean = true;
  public readonly silent: boolean = false;
  public readonly warningsAreAllowed: boolean = false;
  public runCount: number = 0;
  public action: TestRunnerAction | undefined;
  #invalidate: ((reason: string) => void) | undefined;

  public constructor(name: string) {
    this.name = name;
  }

  public requestRun(): void {
    if (!this.#invalidate) {
      throw new Error(`${this.name} has not run yet`);
    }
    this.#invalidate(REQUESTOR);
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    this.runCount++;
    this.#invalidate ??= context.getInvalidateCallback();
    return (await this.action?.(this.runCount)) || OperationStatus.Success;
  }

  public getConfigHash(): string {
    return 'test';
  }
}

interface ITestOperation {
  operation: Operation;
  runner: TestRunner;
}

function createOperation(name: string): ITestOperation {
  const runner: TestRunner = new TestRunner(name);
  const operation: Operation = new Operation({
    runner,
    phase: mockPhase,
    project: { packageName: name, projectFolder: `/repo/${name}` } as unknown as RushConfigurationProject,
    logFilenameIdentifier: name
  });
  return { operation, runner };
}

interface IWatchSession {
  readonly graph: OperationGraph;
  readonly abortController: AbortController;
  readonly terminalProvider: StringBufferTerminalProvider;
  /**
   * The session has settled when nothing changes for this long.
   */
  readonly settleMs: number;
  /**
   * The names of the operations that each executed iteration enabled.
   */
  readonly iterations: string[][];
  /**
   * Operations to run in the next iteration even if their last result is current, as if their files changed.
   */
  readonly dirty: Set<Operation>;
  idleCount: number;
  watcher?: ProjectWatcher;
}

const sessions: IWatchSession[] = [];

function createWatchSession(operations: Operation[], debounceMs: number = DEBOUNCE_MS): IWatchSession {
  const abortController: AbortController = new AbortController();
  const graph: OperationGraph = new OperationGraph(new Set(operations), {
    quietMode: true,
    debugMode: false,
    parallelism: 2,
    allowOversubscription: true,
    destinations: [new MockWritable()],
    abortController,
    isWatch: true
  });
  const session: IWatchSession = {
    graph,
    abortController,
    terminalProvider: new StringBufferTerminalProvider(),
    settleMs: debounceMs * 10,
    iterations: [],
    dirty: new Set(),
    idleCount: 0
  };
  sessions.push(session);

  // Like PhasedOperationPlugin, runs the operations whose last result is not current.
  graph.hooks.configureIteration.tap('test', (currentStates, lastStates) => {
    for (const [operation, currentState] of currentStates) {
      const lastState: IOperationExecutionResult | undefined = lastStates.get(operation);
      currentState.enabled =
        !lastState || !RETAINED_STATUSES.has(lastState.status) || session.dirty.has(operation);
    }
    session.dirty.clear();
  });
  graph.hooks.beforeExecuteIterationAsync.tap('test', (records) => {
    const enabled: string[] = [];
    for (const [operation, record] of records) {
      if (record.enabled) {
        enabled.push(operation.name);
      }
    }
    session.iterations.push(enabled);
  });
  graph.hooks.onIdle.tap('test', () => {
    session.idleCount++;
  });

  session.watcher = new ProjectWatcher({
    graph,
    debounceMs,
    rushConfiguration: {
      rushJsonFolder: '/repo',
      commonRushConfigFolder: '/repo/common/config/rush'
    } as unknown as RushConfiguration,
    terminal: new Terminal(session.terminalProvider),
    renderStatusInPlace: false,
    initialSnapshot: {
      getTrackedFileHashesForOperation: () => undefined
    } as unknown as IInputsSnapshot
  });
  return session;
}

function getSessionState(session: IWatchSession): string {
  const { graph, iterations, idleCount } = session;
  return `${iterations.length}/${idleCount}/${graph.status}/${graph.hasScheduledIteration}`;
}

/**
 * Waits until the session is idle and stays unchanged, including any debounced iteration.
 */
async function settleAsync(session: IWatchSession): Promise<void> {
  let lastState: string | undefined;
  for (let i: number = 0; i < 30; i++) {
    await sleepAsync(session.settleMs);
    const state: string = getSessionState(session);
    if (
      state === lastState &&
      session.graph.status !== OperationStatus.Executing &&
      !session.graph.hasScheduledIteration
    ) {
      return;
    }
    lastState = state;
  }
  throw new Error(`The watch session did not settle; it ran ${session.iterations.length} iterations`);
}

async function startWatchSessionAsync(session: IWatchSession): Promise<void> {
  await session.graph.executeAsync({});
  await settleAsync(session);
}

function simulateFileChange(): void {
  for (const listener of mockFsListeners) {
    listener('change', 'index.ts');
  }
}

/**
 * Returns the statuses that the watcher printed, without the mode label.
 */
function getStatuses(session: IWatchSession): string[] {
  const output: string = AnsiEscape.removeCodes(
    session.terminalProvider.getOutput({ normalizeSpecialCharacters: false })
  );
  const statuses: string[] = [];
  for (const line of output.split('\n')) {
    const index: number = line.indexOf('Watch Status: ');
    if (index >= 0) {
      statuses.push(line.slice(index + 'Watch Status: '.length));
    }
  }
  return statuses;
}

function getRequestStatus(...names: string[]): string {
  return `Run requested by ${names.map((name) => `${name} [${REQUESTOR}]`).join(', ')}. Queuing new iteration...`;
}

describe(ProjectWatcher.name, () => {
  afterEach(() => {
    for (const session of sessions.splice(0)) {
      session.abortController.abort();
    }
    mockFsListeners.clear();
  });

  it('queues an iteration when an operation requests a run while the graph is idle', async () => {
    const a: ITestOperation = createOperation('a');
    const b: ITestOperation = createOperation('b');
    const session: IWatchSession = createWatchSession([a.operation, b.operation]);
    await startWatchSessionAsync(session);
    // Without a request or a file change, nothing else runs.
    expect(session.iterations).toEqual([['a', 'b']]);

    a.runner.requestRun();
    await settleAsync(session);

    expect(session.iterations).toEqual([['a', 'b'], ['a']]);
    expect(a.runner.runCount).toBe(2);
    expect(b.runner.runCount).toBe(1);
    expect(getStatuses(session)).toEqual([
      'Waiting for changes...',
      getRequestStatus('a'),
      'Waiting for changes...'
    ]);
  });

  it('reruns an operation that requests a run after it completed in the executing iteration', async () => {
    const a: ITestOperation = createOperation('a');
    const b: ITestOperation = createOperation('b');
    const session: IWatchSession = createWatchSession([a.operation, b.operation]);
    // b is still running when a's result is written and a requests another run.
    b.runner.action = async (runCount: number) => {
      if (runCount === 1) {
        while (session.graph.resultByOperation.get(a.operation)?.status !== OperationStatus.Success) {
          await sleepAsync(1);
        }
        a.runner.requestRun();
      }
    };
    await startWatchSessionAsync(session);

    expect(session.iterations).toEqual([['a', 'b'], ['a']]);
    expect(a.runner.runCount).toBe(2);
    expect(b.runner.runCount).toBe(1);
  });

  it('reruns an operation that requests a run while it is executing', async () => {
    const a: ITestOperation = createOperation('a');
    const session: IWatchSession = createWatchSession([a.operation]);
    a.runner.action = (runCount: number) => {
      if (runCount === 2) {
        a.runner.requestRun();
      }
    };
    await startWatchSessionAsync(session);

    session.dirty.add(a.operation);
    simulateFileChange();
    await settleAsync(session);

    expect(session.iterations).toEqual([['a'], ['a'], ['a']]);
    expect(a.runner.runCount).toBe(3);
    expect(getStatuses(session)).toEqual([
      'Waiting for changes...',
      'File change detected. Queuing new iteration...',
      'Waiting for changes...',
      getRequestStatus('a'),
      'Waiting for changes...'
    ]);
  });

  it('reruns an operation that requests a run after it executed but before its result is written', async () => {
    const a: ITestOperation = createOperation('a');
    const session: IWatchSession = createWatchSession([a.operation]);
    session.graph.hooks.afterExecuteOperationAsync.tap('test', (record) => {
      if (record.operation === a.operation && a.runner.runCount === 2) {
        a.runner.requestRun();
      }
    });
    await startWatchSessionAsync(session);

    session.dirty.add(a.operation);
    simulateFileChange();
    await settleAsync(session);

    expect(session.iterations).toEqual([['a'], ['a'], ['a']]);
    expect(a.runner.runCount).toBe(3);
  });

  it('does not rerun an operation that requests a run before it starts in the executing iteration', async () => {
    const a: ITestOperation = createOperation('a');
    const b: ITestOperation = createOperation('b');
    a.operation.addDependency(b.operation);
    const session: IWatchSession = createWatchSession([a.operation, b.operation]);
    // a waits for b, so it starts after the request.
    b.runner.action = (runCount: number) => {
      if (runCount === 2) {
        a.runner.requestRun();
      }
    };
    await startWatchSessionAsync(session);

    session.dirty.add(a.operation);
    session.dirty.add(b.operation);
    simulateFileChange();
    await settleAsync(session);

    expect(session.iterations).toEqual([
      ['a', 'b'],
      ['a', 'b']
    ]);
    expect(a.runner.runCount).toBe(2);
  });

  it('reruns an operation that requests a run during an iteration that does not include it', async () => {
    const a: ITestOperation = createOperation('a');
    const b: ITestOperation = createOperation('b');
    a.operation.addDependency(b.operation);
    const session: IWatchSession = createWatchSession([a.operation, b.operation]);
    // a is not part of the second iteration, and has not been skipped yet when it requests a run.
    b.runner.action = (runCount: number) => {
      if (runCount === 2) {
        a.runner.requestRun();
      }
    };
    await startWatchSessionAsync(session);

    session.dirty.add(b.operation);
    simulateFileChange();
    await settleAsync(session);

    expect(session.iterations).toEqual([['a', 'b'], ['b'], ['a']]);
    expect(a.runner.runCount).toBe(2);
    expect(b.runner.runCount).toBe(2);
  });

  it('does not rerun an operation that a failed dependency blocked after its request', async () => {
    const a: ITestOperation = createOperation('a');
    const b: ITestOperation = createOperation('b');
    a.operation.addDependency(b.operation);
    const session: IWatchSession = createWatchSession([a.operation, b.operation]);
    await startWatchSessionAsync(session);

    b.runner.action = () => OperationStatus.Failure;
    session.dirty.add(b.operation);
    a.runner.requestRun();
    await settleAsync(session);

    expect(session.iterations).toEqual([
      ['a', 'b'],
      ['a', 'b']
    ]);
    expect(a.runner.runCount).toBe(1);
    expect(b.runner.runCount).toBe(2);
  });

  it('queues one iteration for the requests and file changes within the debounce interval', async () => {
    const a: ITestOperation = createOperation('a');
    const b: ITestOperation = createOperation('b');
    const session: IWatchSession = createWatchSession([a.operation, b.operation]);
    await startWatchSessionAsync(session);

    a.runner.requestRun();
    b.runner.requestRun();
    await settleAsync(session);
    expect(session.iterations).toEqual([
      ['a', 'b'],
      ['a', 'b']
    ]);

    a.runner.requestRun();
    simulateFileChange();
    await settleAsync(session);

    expect(session.iterations).toEqual([['a', 'b'], ['a', 'b'], ['a']]);
    expect(getStatuses(session)).toEqual([
      'Waiting for changes...',
      getRequestStatus('a', 'b'),
      'Waiting for changes...',
      'File change detected. Queuing new iteration...',
      'Waiting for changes...'
    ]);
  });

  it('does not rerun an operation whose request an earlier iteration served', async () => {
    const a: ITestOperation = createOperation('a');
    const b: ITestOperation = createOperation('b');
    a.operation.addDependency(b.operation);
    const session: IWatchSession = createWatchSession([a.operation, b.operation]);
    // a waits for b, so it starts after the request.
    b.runner.action = (runCount: number) => {
      if (runCount === 2) {
        a.runner.requestRun();
      }
    };
    // Queues a third iteration, which does not include a. It starts without the graph going idle in between.
    session.graph.hooks.afterExecuteIterationAsync.tapPromise('test', async (status: OperationStatus) => {
      if (session.iterations.length === 2 && !session.graph.hasScheduledIteration) {
        session.dirty.add(b.operation);
        await session.graph.scheduleIterationAsync({});
      }
      return status;
    });
    await startWatchSessionAsync(session);

    session.dirty.add(a.operation);
    session.dirty.add(b.operation);
    simulateFileChange();
    await settleAsync(session);

    expect(session.iterations).toEqual([['a', 'b'], ['a', 'b'], ['b']]);
    expect(session.idleCount).toBe(2);
    expect(a.runner.runCount).toBe(2);
  });

  it('serves a pending request with an iteration that starts before the debounce interval ends', async () => {
    const a: ITestOperation = createOperation('a');
    const b: ITestOperation = createOperation('b');
    const session: IWatchSession = createWatchSession([a.operation, b.operation], DEBOUNCE_MS * 5);
    await startWatchSessionAsync(session);

    a.runner.requestRun();
    // Like the build keybind.
    await session.graph.scheduleIterationAsync({});
    await settleAsync(session);
    expect(session.iterations).toEqual([['a', 'b'], ['a']]);

    b.runner.requestRun();
    await settleAsync(session);
    expect(session.iterations).toEqual([['a', 'b'], ['a'], ['b']]);
    expect(getStatuses(session)).toEqual([
      'Waiting for changes...',
      'Waiting for changes...',
      getRequestStatus('b'),
      'Waiting for changes...'
    ]);
  });

  it('queues one iteration for a request while the watch is paused', async () => {
    const a: ITestOperation = createOperation('a');
    const session: IWatchSession = createWatchSession([a.operation]);
    await startWatchSessionAsync(session);

    session.graph.pauseNextIteration = true;
    a.runner.requestRun();
    await sleepAsync(session.settleMs * 2);
    expect(session.graph.hasScheduledIteration).toBe(true);
    expect(session.iterations).toEqual([['a']]);
    expect(getStatuses(session)).toEqual(['Waiting for changes...', getRequestStatus('a')]);

    session.graph.pauseNextIteration = false;
    await settleAsync(session);
    expect(session.iterations).toEqual([['a'], ['a']]);
    expect(a.runner.runCount).toBe(2);
  });

  it('does not queue an iteration for a manual invalidation', async () => {
    const a: ITestOperation = createOperation('a');
    const b: ITestOperation = createOperation('b');
    const session: IWatchSession = createWatchSession([a.operation, b.operation]);
    await startWatchSessionAsync(session);

    session.graph.invalidateOperations(undefined, 'manual-invalidation');
    await settleAsync(session);
    expect(session.iterations).toEqual([['a', 'b']]);

    // The invalidated operations run in the next iteration.
    simulateFileChange();
    await settleAsync(session);
    expect(session.iterations).toEqual([
      ['a', 'b'],
      ['a', 'b']
    ]);
  });

  it('does not queue an iteration for a request after the watch session ends', async () => {
    const a: ITestOperation = createOperation('a');
    const session: IWatchSession = createWatchSession([a.operation]);
    await startWatchSessionAsync(session);

    session.abortController.abort();
    a.runner.requestRun();
    await sleepAsync(session.settleMs);

    expect(session.graph.hasScheduledIteration).toBe(false);
    expect(getStatuses(session)).toEqual(['Waiting for changes...']);
  });

  it('does not queue an iteration for a pending request when the watch session ends', async () => {
    const a: ITestOperation = createOperation('a');
    const session: IWatchSession = createWatchSession([a.operation]);
    await startWatchSessionAsync(session);

    a.runner.requestRun();
    session.abortController.abort();
    await sleepAsync(session.settleMs);

    expect(session.graph.hasScheduledIteration).toBe(false);
    expect(getStatuses(session)).toEqual(['Waiting for changes...']);
  });
});
