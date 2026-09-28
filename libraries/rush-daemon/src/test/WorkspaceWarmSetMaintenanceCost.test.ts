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
  configuration: Partial<WorkspaceWarmSetConfiguration> = {}
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
    } as unknown as WorkspaceSessionFileWatcher
  });
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
});
