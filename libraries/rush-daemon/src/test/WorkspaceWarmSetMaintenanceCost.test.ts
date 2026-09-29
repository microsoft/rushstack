// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  OperationStatus,
  type IOperationGraph,
  type IOperationRunner,
  type Operation
} from '@microsoft/rush-lib';

import type { RequestScheduler } from '../RequestScheduler';
import type { WorkspaceSessionFileWatcher } from '../WorkspaceSessionFileWatcher';
import {
  WorkspaceWarmSet,
  type IWorkspaceWarmSetOptions,
  type IWorkspaceWarmSetStatus,
  type WorkspaceWarmSetConfiguration
} from '../WorkspaceWarmSet';

type Tap = (...args: unknown[]) => unknown;

const CONFIGURATION: WorkspaceWarmSetConfiguration = {
  watch: false,
  warmIdleTimeoutSeconds: 3600,
  warmMemoryBudgetMB: 1024 * 1024,
  warmSetMaxProjects: 20,
  autoWarmByTelemetry: false
};

interface ITestGraph {
  readonly graph: IOperationGraph;
  readonly operations: Operation[];
  readonly requestAll: () => void;
}

function createHook(taps: Tap[]): { tap: (options: unknown, fn: Tap) => void } {
  return {
    tap: (options: unknown, fn: Tap) => {
      taps.push(fn);
    }
  };
}

// A graph shaped like a warm odsp-web generation: every project has retained results and nothing is running.
function createGraph(projectCount: number): ITestGraph {
  const operations: Operation[] = [];
  for (let i: number = 0; i < projectCount; i++) {
    operations.push({
      name: `p${i} (build)`,
      associatedProject: { packageName: `p${i}` },
      enabled: true,
      runner: undefined,
      consumers: new Set()
    } as unknown as Operation);
  }
  const configureIterationTaps: Tap[] = [];
  const resultByOperation: Map<Operation, unknown> = new Map(
    operations.map((operation) => [operation, { status: OperationStatus.Success }])
  );
  const graph: IOperationGraph = {
    operations: new Set(operations),
    resultByOperation,
    hooks: {
      configureIteration: createHook(configureIterationTaps),
      beforeExecuteOperationAsync: createHook([]),
      afterExecuteIterationAsync: createHook([]),
      onIdle: createHook([])
    },
    hasScheduledIteration: false,
    status: OperationStatus.Ready,
    abortController: new AbortController(),
    deleteResults: (deleted: Iterable<Operation>): void => {
      for (const operation of deleted) resultByOperation.delete(operation);
    },
    closeRunnersAsync: async (closed: Iterable<Operation>): Promise<void> => {
      for (const operation of closed) await operation.runner?.closeAsync?.();
    }
  } as unknown as IOperationGraph;
  return {
    graph,
    operations,
    requestAll: () => {
      for (const tap of configureIterationTaps) tap(new Map(), new Map(), {});
    }
  };
}

function attach(
  graph: IOperationGraph,
  configuration: Partial<WorkspaceWarmSetConfiguration> = {},
  options: Partial<IWorkspaceWarmSetOptions> = {}
): WorkspaceWarmSet {
  return WorkspaceWarmSet.attach({
    operationGraph: graph,
    configuration: { ...CONFIGURATION, ...configuration },
    scheduler: { acquireAsync: async () => ({ release: () => undefined }) } as unknown as RequestScheduler,
    acquireExecutionLeaseAsync: async () => ({ [Symbol.asyncDispose]: async () => undefined }),
    watcher: {
      watchedProjectNames: new Set<string>(),
      watchProjects: () => undefined,
      unwatchProjectsAsync: async () => undefined
    } as unknown as WorkspaceSessionFileWatcher,
    ...options
  });
}

interface ITestWatcher {
  readonly watcher: WorkspaceSessionFileWatcher;
  readonly watched: Set<string>;
  readonly failNextWatch: () => void;
}

function createWatcher(): ITestWatcher {
  const watched: Set<string> = new Set();
  let fail: boolean = false;
  const watcher: WorkspaceSessionFileWatcher = {
    get watchedProjectNames(): ReadonlySet<string> {
      return new Set(watched);
    },
    watchProjects: (projectNames: Iterable<string>): void => {
      if (fail) {
        fail = false;
        throw new Error('watch failed');
      }
      for (const name of projectNames) watched.add(name);
    },
    unwatchProjectsAsync: async (projectNames: Iterable<string>): Promise<void> => {
      for (const name of projectNames) watched.delete(name);
    }
  } as unknown as WorkspaceSessionFileWatcher;
  return {
    watcher,
    watched,
    failNextWatch: () => {
      fail = true;
    }
  };
}

function createLease(): jest.Mock<Promise<AsyncDisposable>, []> {
  return jest.fn(async () => ({ [Symbol.asyncDispose]: async () => undefined }));
}

async function settleAsync(warm: WorkspaceWarmSet): Promise<void> {
  // Lets the passes scheduled by attachment and by a simulated request finish.
  await new Promise((resolve) => setTimeout(resolve, 10));
  await warm.maintainAsync();
}

function createResidentRunner(): IOperationRunner {
  let active: boolean = true;
  return {
    name: 'resident',
    isNoOp: false,
    cacheable: false,
    reportTiming: false,
    silent: false,
    warningsAreAllowed: false,
    get isActive(): boolean {
      return active;
    },
    getConfigHash: () => '',
    executeAsync: async () => OperationStatus.Success,
    closeAsync: async () => {
      active = false;
    }
  };
}

async function countStatusReadsInPassAsync(warm: WorkspaceWarmSet): Promise<number> {
  // Let the pass scheduled by attachment and by the simulated request settle, so only the measured pass is counted.
  await new Promise((resolve) => setTimeout(resolve, 10));
  await warm.maintainAsync();
  const getStatus: jest.SpyInstance = jest.spyOn(warm, 'getStatus');
  try {
    await warm.maintainAsync();
    return getStatus.mock.calls.length;
  } finally {
    getStatus.mockRestore();
  }
}

describe('warm-set maintenance cost', () => {
  const disposables: WorkspaceWarmSet[] = [];
  afterEach(async () => {
    for (const warm of disposables.splice(0)) await warm[Symbol.asyncDispose]();
  });

  it('reads status a constant number of times in a pass that evicts nothing, regardless of project count', async () => {
    const counts: number[] = [];
    for (const projectCount of [10, 2000]) {
      const { graph, requestAll } = createGraph(projectCount);
      const warm: WorkspaceWarmSet = attach(graph);
      disposables.push(warm);
      requestAll();
      counts.push(await countStatusReadsInPassAsync(warm));
      expect(graph.resultByOperation.size).toBe(projectCount);
      expect(warm.getStatus().retainedProjectNames).toHaveLength(projectCount);
    }
    expect(counts[1]).toBe(counts[0]);
    expect(counts[0]).toBeLessThanOrEqual(2);
  });

  it('re-reads status after each eviction attempt, so it stops evicting once back under the project cap', async () => {
    const { graph, operations, requestAll } = createGraph(40);
    for (const operation of operations.slice(0, 5)) operation.runner = createResidentRunner();
    const warm: WorkspaceWarmSet = attach(graph, { warmSetMaxProjects: 3 });
    disposables.push(warm);
    requestAll();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const getStatus: jest.SpyInstance = jest.spyOn(warm, 'getStatus');
    const status: IWorkspaceWarmSetStatus = await warm.maintainAsync();
    // Two evictions: one read before the first attempt, one after each attempt, one for the pass result.
    expect(getStatus.mock.calls.length).toBeLessThanOrEqual(4);
    getStatus.mockRestore();
    expect(status.overProjectLimit).toBe(false);
    const evicted: Operation[] = operations.filter((operation) => !graph.resultByOperation.has(operation));
    expect(evicted).toHaveLength(2);
    expect(evicted.every((operation) => operation.runner?.isActive === false)).toBe(true);
    expect(graph.resultByOperation.size).toBe(38);
  });

  it('takes the native repository lease only for a pass that releases resources or stops observing a project', async () => {
    const { graph, operations, requestAll } = createGraph(10);
    const { watcher, watched } = createWatcher();
    const acquire: jest.Mock<Promise<AsyncDisposable>, []> = createLease();
    const warm: WorkspaceWarmSet = attach(
      graph,
      { warmSetMaxProjects: 3 },
      { watcher, acquireExecutionLeaseAsync: acquire }
    );
    disposables.push(warm);
    requestAll();
    await settleAsync(warm);
    acquire.mockClear();

    // Retained results with nothing to release: native Rush commands can take the repository lock meanwhile.
    const idle: IWorkspaceWarmSetStatus = await warm.maintainAsync();
    expect(acquire).not.toHaveBeenCalled();
    expect(idle.deferredReason).toBeUndefined();
    expect(idle.retainedProjectNames).toHaveLength(10);

    // With daemon.watch off, a remaining project watcher is closed under the lease.
    watched.add('p3');
    await warm.maintainAsync();
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(watched.size).toBe(0);
    await warm.maintainAsync();
    expect(acquire).toHaveBeenCalledTimes(1);

    // Resource holders over the project cap are released under the lease.
    for (const operation of operations.slice(0, 5)) operation.runner = createResidentRunner();
    const evicted: IWorkspaceWarmSetStatus = await warm.maintainAsync();
    expect(acquire).toHaveBeenCalledTimes(2);
    expect(evicted.overProjectLimit).toBe(false);
    expect(operations.filter((operation) => operation.runner?.isActive)).toHaveLength(3);
    await warm.maintainAsync();
    expect(acquire).toHaveBeenCalledTimes(2);
  });

  it('takes the native repository lease to observe a requested project again and to clear an observation failure', async () => {
    const { graph, requestAll } = createGraph(4);
    const { watcher, watched, failNextWatch } = createWatcher();
    const acquire: jest.Mock<Promise<AsyncDisposable>, []> = createLease();
    const diagnostics: string[] = [];
    const warm: WorkspaceWarmSet = attach(
      graph,
      { watch: true },
      {
        watcher,
        acquireExecutionLeaseAsync: acquire,
        onDiagnostic: (error: Error) => diagnostics.push(error.message)
      }
    );
    disposables.push(warm);
    requestAll();
    await settleAsync(warm);
    expect(watched.size).toBe(4);
    acquire.mockClear();
    await warm.maintainAsync();
    expect(acquire).not.toHaveBeenCalled();

    watched.delete('p1');
    failNextWatch();
    const failed: IWorkspaceWarmSetStatus = await warm.maintainAsync();
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(failed.cleanupFailures).toEqual([expect.stringContaining('watch failed')]);
    expect(watched.has('p1')).toBe(false);

    const recovered: IWorkspaceWarmSetStatus = await warm.maintainAsync();
    expect(acquire).toHaveBeenCalledTimes(2);
    expect(recovered.cleanupFailures).toEqual([]);
    expect(watched.has('p1')).toBe(true);
    await warm.maintainAsync();
    expect(acquire).toHaveBeenCalledTimes(2);

    // A request observes its projects again, but the reported failure is cleared only by a maintenance pass.
    watched.delete('p2');
    failNextWatch();
    await warm.maintainAsync();
    expect(acquire).toHaveBeenCalledTimes(3);
    requestAll();
    expect(watched.size).toBe(4);
    const cleared: IWorkspaceWarmSetStatus = await warm.maintainAsync();
    expect(acquire).toHaveBeenCalledTimes(4);
    expect(cleared.cleanupFailures).toEqual([]);
    await warm.maintainAsync();
    expect(acquire).toHaveBeenCalledTimes(4);
    expect(diagnostics).toEqual([
      expect.stringContaining('watch failed'),
      expect.stringContaining('watch failed')
    ]);
  });

  it('takes no native repository lease for a project that daemon.watch leaves unobserved after its eviction failed', async () => {
    const { graph, requestAll } = createGraph(4);
    const { watcher, watched } = createWatcher();
    const acquire: jest.Mock<Promise<AsyncDisposable>, []> = createLease();
    const diagnostics: string[] = [];
    // The eviction stops observing the project, then fails to drop its results.
    graph.deleteResults = () => {
      throw new Error('delete failed');
    };
    const warm: WorkspaceWarmSet = attach(
      graph,
      { watch: true, warmSetMaxProjects: 3 },
      {
        watcher,
        acquireExecutionLeaseAsync: acquire,
        onDiagnostic: (error: Error) => diagnostics.push(error.message)
      }
    );
    disposables.push(warm);
    requestAll();
    await settleAsync(warm);
    expect(watched.size).toBe(3);
    expect(diagnostics).toEqual([expect.stringContaining('Could not evict warm project')]);
    acquire.mockClear();

    // daemon.watch doesn't observe a project whose eviction failed again, so a pass has nothing to apply
    const status: IWorkspaceWarmSetStatus = await warm.maintainAsync();
    expect(acquire).not.toHaveBeenCalled();
    expect(status.cleanupFailures).toEqual([expect.stringContaining('delete failed')]);
    expect(status.retainedProjectNames).toHaveLength(4);
    expect(watched.size).toBe(3);
    expect(diagnostics).toHaveLength(1);
  });

  it('takes no native repository lease for a protected project that stays observed with daemon.watch off', async () => {
    const { graph, operations, requestAll } = createGraph(4);
    const { watcher, watched } = createWatcher();
    const acquire: jest.Mock<Promise<AsyncDisposable>, []> = createLease();
    const warm: WorkspaceWarmSet = attach(
      graph,
      {},
      {
        watcher,
        acquireExecutionLeaseAsync: acquire,
        getProtectedOperations: () => new Set([operations[0]])
      }
    );
    disposables.push(warm);
    requestAll();
    await settleAsync(warm);
    watched.add('p0');
    acquire.mockClear();

    // daemon.watch off stops observing only the projects that aren't protected
    const status: IWorkspaceWarmSetStatus = await warm.maintainAsync();
    expect(acquire).not.toHaveBeenCalled();
    expect(status.protectedProjectNames).toEqual(['p0']);
    expect(watched.has('p0')).toBe(true);
  });

  it('takes no native repository lease for an expired protected project that holds resources, pass after pass', async () => {
    const { graph, operations, requestAll } = createGraph(4);
    operations[0].runner = createResidentRunner();
    const acquire: jest.Mock<Promise<AsyncDisposable>, []> = createLease();
    const warm: WorkspaceWarmSet = attach(
      graph,
      { warmIdleTimeoutSeconds: 0.001 },
      { acquireExecutionLeaseAsync: acquire, getProtectedOperations: () => new Set([operations[0]]) }
    );
    disposables.push(warm);
    requestAll();
    await settleAsync(warm);
    acquire.mockClear();

    // Expiry never evicts a protected project, so no pass needs to own the repository for it
    for (let pass: number = 0; pass < 2; pass++) {
      const status: IWorkspaceWarmSetStatus = await warm.maintainAsync();
      expect(status.protectedProjectNames).toEqual(['p0']);
      expect(status.deferredReason).toBeUndefined();
    }
    expect(acquire).not.toHaveBeenCalled();
    expect(operations[0].runner?.isActive).toBe(true);
    expect(graph.resultByOperation.size).toBe(4);
  });
});
