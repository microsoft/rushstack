// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IInputsSnapshot,
  IOperationExecutionResult,
  IOperationGraph,
  IPhase,
  Parallelism,
  RushConfigurationProject
} from '@microsoft/rush-lib';
import {
  Operation,
  OperationGraphHooks,
  OperationStatus,
  RushSession
} from '@microsoft/rush-lib';

import {
  WorkspaceEngineComponentFactory
} from '../WorkspaceEngineComponentFactory';
import type {
  ICreateWorkspaceEngineComponentsOptions,
  IMapWorkspaceInvalidationsOptions,
  IWorkspaceEngineComponents,
  IWorkspaceEngineShape
} from '../WorkspaceEngineComponentFactory';
import { WorkspaceSession } from '../WorkspaceSession';
import type {
  IWorkspaceInvalidationWatcher,
  IWorkspaceSessionComponents
} from '../WorkspaceSession';
import { WorkspaceInvalidationTracker } from '../WorkspaceInvalidationTracker';
import { TEST_RUSH_CONFIGURATION, TEST_REPO_ROOT } from './TestWorkspaceSession';

const PHASE_NAME: string = '_phase:test';
const PLUGIN_NAME: string = 'test-plugin';
const TEST_PHASE: IPhase = {
  allowWarningsOnSuccess: false,
  associatedParameters: new Set(),
  dependencies: { self: new Set(), upstream: new Set() },
  isSynthetic: false,
  logFilenameIdentifier: '_phase_test',
  missingScriptBehavior: 'silent',
  name: PHASE_NAME
};

interface ITestEngine {
  readonly components: IWorkspaceEngineComponents;
  readonly graph: TestOperationGraph;
  readonly operations: ReadonlyArray<Operation>;
}

class TestOperationGraph implements IOperationGraph {
  #parallelism: number = 1;

  public readonly abortController: AbortController = new AbortController();
  public readonly hooks: OperationGraphHooks = new OperationGraphHooks();
  public readonly resultByOperation: ReadonlyMap<Operation, IOperationExecutionResult> = new Map();
  public readonly status: OperationStatus = OperationStatus.Ready;
  public readonly terminalDestinations: IOperationGraph['terminalDestinations'] = new Set();
  public allowOversubscription: boolean = true;
  public debugMode: boolean = false;
  public hasScheduledIteration: boolean = false;
  public pauseNextIteration: boolean = false;
  public quietMode: boolean = true;
  public readonly operations: ReadonlySet<Operation>;

  public constructor(operations: ReadonlySet<Operation>) {
    this.operations = operations;
  }

  public get parallelism(): number {
    return this.#parallelism;
  }

  public set parallelism(value: Parallelism) {
    this.#parallelism = typeof value === 'number' ? value : 1;
  }

  public abortCurrentIterationAsync(): Promise<void> {
    return Promise.resolve();
  }

  public addTerminalDestination(): void {}

  public closeRunnersAsync(): Promise<void> {
    return Promise.resolve();
  }

  public executeScheduledIterationAsync(): Promise<boolean> {
    return Promise.resolve(false);
  }

  public invalidateOperations(): void {}

  public removeTerminalDestination(): boolean {
    return false;
  }

  public scheduleIterationAsync(): Promise<boolean> {
    return Promise.resolve(false);
  }

  public setEnabledStates(): boolean {
    return false;
  }
}

function createInputsSnapshot(name: string): IInputsSnapshot {
  const hashes: ReadonlyMap<string, string> = new Map([[`${name}.ts`, name]]);
  return {
    getOperationOwnStateHash: () => name,
    getTrackedFileHashesForOperation: () => hashes,
    hasUncommittedChanges: true,
    hashes,
    rootDirectory: TEST_REPO_ROOT
  };
}

function createTestEngine(
  projects: Iterable<RushConfigurationProject>,
  getInputsSnapshotAsync: () => Promise<IInputsSnapshot | undefined>,
  onDisposeAsync?: () => Promise<void>
): ITestEngine {
  const operations: Operation[] = Array.from(
    projects,
    (project: RushConfigurationProject) =>
      new Operation({
        logFilenameIdentifier: '_phase_test',
        phase: TEST_PHASE,
        project
      })
  );
  const graph: TestOperationGraph = new TestOperationGraph(new Set(operations));
  const disposeEngineAsync = async (): Promise<void> => {
    const errors: unknown[] = [];
    graph.abortController.abort();
    for (const cleanupAsync of [
      () => graph.abortCurrentIterationAsync(),
      () => graph.closeRunnersAsync(),
      onDisposeAsync
    ]) {
      if (!cleanupAsync) {
        continue;
      }
      try {
        await cleanupAsync();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    } else if (errors.length > 1) {
      throw new AggregateError(errors, 'Failed to dispose test engine components.');
    }
  };
  const components: IWorkspaceEngineComponents = {
    [Symbol.asyncDispose]: disposeEngineAsync,
    getInputsSnapshotAsync,
    inputsSnapshot: createInputsSnapshot('initial'),
    operationGraph: graph,
    rushSession: new RushSession({
      getIsDebugMode: () => false,
      terminalProvider: {
        eolCharacter: '\n',
        supportsColor: false,
        write: () => undefined
      }
    })
  };
  return { components, graph, operations };
}

function getReconcileAsync(
  components: IWorkspaceSessionComponents
): NonNullable<IWorkspaceSessionComponents['reconcileInvalidationsAsync']> {
  const reconcileAsync: IWorkspaceSessionComponents['reconcileInvalidationsAsync'] =
    components.reconcileInvalidationsAsync;
  if (!reconcileAsync) {
    throw new Error('Expected workspace reconciliation to be configured.');
  }
  return reconcileAsync;
}

async function disposeComponentsAsync(components: IWorkspaceSessionComponents): Promise<void> {
  await components[Symbol.asyncDispose]();
}

describe(WorkspaceEngineComponentFactory.name, () => {
  it('initializes exactly once through WorkspaceSession and reconciles startup conservatively', async () => {
    const nextSnapshot: IInputsSnapshot = createInputsSnapshot('next');
    let initializedEngine: ITestEngine | undefined;
    let initializedRushConfiguration:
      | ICreateWorkspaceEngineComponentsOptions['rushConfiguration']
      | undefined;
    const createEngineComponentsAsync: jest.Mock<
      Promise<IWorkspaceEngineComponents>,
      [ICreateWorkspaceEngineComponentsOptions]
    > = jest.fn(async (createOptions: ICreateWorkspaceEngineComponentsOptions) => {
      initializedRushConfiguration = createOptions.rushConfiguration;
      initializedEngine = createTestEngine(createOptions.rushConfiguration.projects, () =>
        Promise.resolve(nextSnapshot)
      );
      return initializedEngine.components;
    });
    const factory: WorkspaceEngineComponentFactory = new WorkspaceEngineComponentFactory({
      createEngineComponentsAsync,
      mapInvalidationsToOperationsAsync: async () => [],
      shape: {
        phaseNames: [PHASE_NAME],
        pluginNames: []
      }
    });
    const watcher: IWorkspaceInvalidationWatcher = {
      [Symbol.asyncDispose]: () => Promise.resolve(),
      startAsync: () => Promise.resolve()
    };
    const session: WorkspaceSession = await WorkspaceSession.createAsync({
      createComponentsAsync: async (createOptions) => {
        const engineComponents: IWorkspaceSessionComponents =
          await factory.createAsync(createOptions);
        return {
          ...engineComponents,
          projectWatcher: watcher,
          [Symbol.asyncDispose]: async () => {
            await watcher[Symbol.asyncDispose]();
            await engineComponents[Symbol.asyncDispose]();
          }
        };
      },
      repoRoot: TEST_REPO_ROOT,
      rushVersion: '5.178.1'
    });
    const engine: ITestEngine | undefined = initializedEngine;
    if (!engine) {
      throw new Error('Expected the workspace engine to be initialized.');
    }
    const invalidateSpy: jest.SpyInstance = jest.spyOn(engine.graph, 'invalidateOperations');

    const result = await session.reconcileInvalidationsAsync();

    expect(createEngineComponentsAsync).toHaveBeenCalledTimes(1);
    expect(initializedRushConfiguration).toBe(session.rushConfiguration);
    expect(session.operationGraph).toBe(engine.graph);
    expect(
      engine.operations.every((operation: Operation) =>
        session.rushConfiguration.projects.includes(operation.associatedProject)
      )
    ).toBe(true);
    expect(session.engineShape).toEqual({
      phaseNames: [PHASE_NAME],
      pluginNames: []
    });
    expect(result).toMatchObject({
      inputsSnapshot: nextSnapshot,
      invalidatedOperationCount: engine.operations.length,
      isFullInvalidation: true,
      sequence: 1
    });
    expect(session.inputsSnapshot).toBe(nextSnapshot);
    expect(invalidateSpy).toHaveBeenCalledWith(undefined, 'workspace-inputs-changed');
    await session[Symbol.asyncDispose]();
  });

  it('constructs an explicitly shaped all-project engine and maps retained paths', async () => {
    const nextSnapshot: IInputsSnapshot = createInputsSnapshot('next');
    const engine: ITestEngine = createTestEngine(TEST_RUSH_CONFIGURATION.projects, () =>
      Promise.resolve(nextSnapshot)
    );
    const targetOperation: Operation = engine.operations[0];
    const createEngineComponentsAsync: jest.Mock<
      Promise<IWorkspaceEngineComponents>,
      [ICreateWorkspaceEngineComponentsOptions]
    > = jest.fn(async (createOptions: ICreateWorkspaceEngineComponentsOptions) => {
      void createOptions;
      return engine.components;
    });
    const mapInvalidationsToOperationsAsync: jest.Mock<
      Promise<Iterable<Operation>>,
      [IMapWorkspaceInvalidationsOptions]
    > = jest.fn(async (mapOptions: IMapWorkspaceInvalidationsOptions) => {
      void mapOptions;
      return [targetOperation, targetOperation];
    });
    const factory: WorkspaceEngineComponentFactory = new WorkspaceEngineComponentFactory({
      createEngineComponentsAsync,
      mapInvalidationsToOperationsAsync,
      shape: {
        phaseNames: [PHASE_NAME],
        pluginNames: [PLUGIN_NAME]
      }
    });
    const invalidations: WorkspaceInvalidationTracker = new WorkspaceInvalidationTracker();
    invalidations.invalidate('libraries/a/src/index.ts');
    const components: IWorkspaceSessionComponents = await factory.createAsync({
      invalidations,
      rushConfiguration: TEST_RUSH_CONFIGURATION
    });
    const invalidateSpy: jest.SpyInstance = jest.spyOn(engine.graph, 'invalidateOperations');

    const result = await getReconcileAsync(components)();

    const createOptions: ICreateWorkspaceEngineComponentsOptions =
      createEngineComponentsAsync.mock.calls[0][0];
    expect(createOptions.projectSelection).toEqual(new Set(TEST_RUSH_CONFIGURATION.projects));
    expect(createOptions.phaseNames).toEqual([PHASE_NAME]);
    expect(createOptions.pluginNames).toEqual([PLUGIN_NAME]);
    expect(result).toMatchObject({
      inputsSnapshot: nextSnapshot,
      invalidatedOperationCount: 1,
      isFullInvalidation: false,
      sequence: 1
    });
    expect(components.inputsSnapshot).toBe(nextSnapshot);
    expect(invalidateSpy).toHaveBeenCalledWith(new Set([targetOperation]), 'workspace-inputs-changed');
    expect(invalidations.getSnapshot()).toMatchObject({
      changedPaths: [],
      hasUnknownChanges: false
    });
    await disposeComponentsAsync(components);
  });

  it('serializes concurrent reconciliation against the latest inputs snapshot', async () => {
    const initialSnapshot: IInputsSnapshot = createInputsSnapshot('initial');
    const firstSnapshot: IInputsSnapshot = createInputsSnapshot('first');
    const secondSnapshot: IInputsSnapshot = createInputsSnapshot('second');
    let startFirstSnapshot: (() => void) | undefined;
    const firstSnapshotStarted: Promise<void> = new Promise((resolve: () => void) => {
      startFirstSnapshot = resolve;
    });
    let finishFirstSnapshot: (() => void) | undefined;
    const blockedFirstSnapshot: Promise<IInputsSnapshot> = new Promise(
      (resolve: (snapshot: IInputsSnapshot) => void) => {
        finishFirstSnapshot = () => resolve(firstSnapshot);
      }
    );
    let snapshotCalls: number = 0;
    const engine: ITestEngine = createTestEngine(TEST_RUSH_CONFIGURATION.projects, () => {
      snapshotCalls++;
      if (snapshotCalls === 1) {
        startFirstSnapshot?.();
        return blockedFirstSnapshot;
      }
      return Promise.resolve(secondSnapshot);
    });
    const mapInvalidationsToOperationsAsync: jest.Mock<
      Promise<Iterable<Operation>>,
      [IMapWorkspaceInvalidationsOptions]
    > = jest.fn(async (mapOptions: IMapWorkspaceInvalidationsOptions) => {
      void mapOptions;
      return [engine.operations[0]];
    });
    const factory: WorkspaceEngineComponentFactory = new WorkspaceEngineComponentFactory({
      createEngineComponentsAsync: async () => ({
        ...engine.components,
        inputsSnapshot: initialSnapshot
      }),
      mapInvalidationsToOperationsAsync,
      shape: {
        phaseNames: [PHASE_NAME],
        pluginNames: [PLUGIN_NAME]
      }
    });
    const invalidations: WorkspaceInvalidationTracker = new WorkspaceInvalidationTracker();
    invalidations.invalidate('libraries/a/src/index.ts');
    const components: IWorkspaceSessionComponents = await factory.createAsync({
      invalidations,
      rushConfiguration: TEST_RUSH_CONFIGURATION
    });

    const firstReconciliation: Promise<unknown> = getReconcileAsync(components)();
    await firstSnapshotStarted;
    const queueSecondInvalidation: Promise<void> = firstReconciliation.then(() => {
      invalidations.invalidate('libraries/b/src/index.ts');
    });
    const secondReconciliation: Promise<unknown> = getReconcileAsync(components)();

    expect(snapshotCalls).toBe(1);
    expect(mapInvalidationsToOperationsAsync).not.toHaveBeenCalled();
    finishFirstSnapshot?.();
    await Promise.all([firstReconciliation, queueSecondInvalidation, secondReconciliation]);

    expect(mapInvalidationsToOperationsAsync).toHaveBeenCalledTimes(2);
    expect(mapInvalidationsToOperationsAsync.mock.calls[0][0]).toMatchObject({
      currentInputsSnapshot: initialSnapshot,
      nextInputsSnapshot: firstSnapshot
    });
    expect(mapInvalidationsToOperationsAsync.mock.calls[1][0]).toMatchObject({
      currentInputsSnapshot: firstSnapshot,
      nextInputsSnapshot: secondSnapshot
    });
    expect(components.inputsSnapshot).toBe(secondSnapshot);
    await disposeComponentsAsync(components);
  });

  it('uses a full invalidation for unknown changes and for snapshot races', async () => {
    const invalidations: WorkspaceInvalidationTracker = new WorkspaceInvalidationTracker();
    invalidations.invalidate('libraries/a/src/index.ts');
    let snapshotCalls: number = 0;
    const engine: ITestEngine = createTestEngine(TEST_RUSH_CONFIGURATION.projects, () => {
      snapshotCalls++;
      if (snapshotCalls === 1) {
        invalidations.invalidate('libraries/b/src/index.ts');
      }
      return Promise.resolve(createInputsSnapshot(`next-${snapshotCalls}`));
    });
    const mapInvalidationsToOperationsAsync: jest.Mock = jest.fn(async () => [engine.operations[0]]);
    const factory: WorkspaceEngineComponentFactory = new WorkspaceEngineComponentFactory({
      createEngineComponentsAsync: async () => engine.components,
      mapInvalidationsToOperationsAsync,
      shape: {
        phaseNames: [PHASE_NAME],
        pluginNames: [PLUGIN_NAME]
      }
    });
    const components: IWorkspaceSessionComponents = await factory.createAsync({
      invalidations,
      rushConfiguration: TEST_RUSH_CONFIGURATION
    });
    const invalidateSpy: jest.SpyInstance = jest.spyOn(engine.graph, 'invalidateOperations');

    const firstResult = await getReconcileAsync(components)();
    const secondResult = await getReconcileAsync(components)();

    expect(firstResult.isFullInvalidation).toBe(false);
    expect(secondResult).toMatchObject({
      invalidatedOperationCount: engine.operations.length,
      isFullInvalidation: true,
      sequence: 2
    });
    expect(mapInvalidationsToOperationsAsync).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenLastCalledWith(undefined, 'workspace-inputs-changed');
    await disposeComponentsAsync(components);
  });

  it('retains invalidations when a mapper returns an operation outside the graph', async () => {
    const engine: ITestEngine = createTestEngine(
      TEST_RUSH_CONFIGURATION.projects,
      () => Promise.resolve(createInputsSnapshot('next'))
    );
    const invalidations: WorkspaceInvalidationTracker = new WorkspaceInvalidationTracker();
    invalidations.invalidate('libraries/a/src/index.ts');
    const outsider: Operation = new Operation({
      logFilenameIdentifier: '_phase_test',
      phase: TEST_PHASE,
      project: TEST_RUSH_CONFIGURATION.projects[0]
    });
    const factory: WorkspaceEngineComponentFactory = new WorkspaceEngineComponentFactory({
      createEngineComponentsAsync: async () => engine.components,
      mapInvalidationsToOperationsAsync: async () => [outsider],
      shape: {
        phaseNames: [PHASE_NAME],
        pluginNames: [PLUGIN_NAME]
      }
    });
    const components: IWorkspaceSessionComponents = await factory.createAsync({
      invalidations,
      rushConfiguration: TEST_RUSH_CONFIGURATION
    });

    await expect(getReconcileAsync(components)()).rejects.toThrow(
      'operation outside the graph'
    );
    expect(components.inputsSnapshot).toBe(engine.components.inputsSnapshot);
    expect(invalidations.getSnapshot().changedPaths).toEqual(['libraries/a/src/index.ts']);
    await disposeComponentsAsync(components);
  });

  it('waits for reconciliation and aggregates deterministic graph cleanup failures', async () => {
    const events: string[] = [];
    let finishSnapshot: (() => void) | undefined;
    const snapshotPromise: Promise<IInputsSnapshot> = new Promise(
      (resolve: (snapshot: IInputsSnapshot) => void) => {
        finishSnapshot = () => {
          events.push('snapshot');
          resolve(createInputsSnapshot('next'));
        };
      }
    );
    const engine: ITestEngine = createTestEngine(
      TEST_RUSH_CONFIGURATION.projects,
      () => snapshotPromise,
      async () => {
        events.push('components-dispose');
        throw new Error('component cleanup failed');
      }
    );
    engine.graph.abortController.signal.addEventListener(
      'abort',
      () => events.push('session-abort'),
      { once: true }
    );
    jest.spyOn(engine.graph, 'abortCurrentIterationAsync').mockImplementation(async () => {
      events.push('iteration-abort');
      throw new Error('graph abort failed');
    });
    jest.spyOn(engine.graph, 'closeRunnersAsync').mockImplementation(async () => {
      events.push('runners-close');
      throw new Error('runner cleanup failed');
    });
    const factory: WorkspaceEngineComponentFactory = new WorkspaceEngineComponentFactory({
      createEngineComponentsAsync: async () => engine.components,
      mapInvalidationsToOperationsAsync: async () => [engine.operations[0]],
      shape: {
        phaseNames: [PHASE_NAME],
        pluginNames: [PLUGIN_NAME]
      }
    });
    const invalidations: WorkspaceInvalidationTracker = new WorkspaceInvalidationTracker();
    invalidations.invalidate('libraries/a/src/index.ts');
    const components: IWorkspaceSessionComponents = await factory.createAsync({
      invalidations,
      rushConfiguration: TEST_RUSH_CONFIGURATION
    });
    const reconciliationPromise: Promise<unknown> = getReconcileAsync(components)();
    const disposalPromise: Promise<void> = Promise.resolve(components[Symbol.asyncDispose]());
    finishSnapshot?.();

    await reconciliationPromise;
    await expect(disposalPromise).rejects.toThrow('Failed to dispose test engine components');
    expect(events).toEqual([
      'snapshot',
      'session-abort',
      'iteration-abort',
      'runners-close',
      'components-dispose'
    ]);
  });

  it('accepts an explicitly empty plugin shape', () => {
    const factory: WorkspaceEngineComponentFactory = new WorkspaceEngineComponentFactory({
      createEngineComponentsAsync: async () =>
        createTestEngine(TEST_RUSH_CONFIGURATION.projects, () =>
          Promise.resolve(createInputsSnapshot('next'))
        ).components,
      mapInvalidationsToOperationsAsync: async () => [],
      shape: {
        phaseNames: [PHASE_NAME],
        pluginNames: []
      }
    });

    expect(factory.shape.pluginNames).toEqual([]);
  });

  it('rejects a graph that does not represent every configured project', async () => {
    const engine: ITestEngine = createTestEngine(
      TEST_RUSH_CONFIGURATION.projects,
      () => Promise.resolve(createInputsSnapshot('next'))
    );
    const shape: IWorkspaceEngineShape = {
      phaseNames: [PHASE_NAME],
      pluginNames: [PLUGIN_NAME]
    };
    const subsetGraph: TestOperationGraph = new TestOperationGraph(new Set([engine.operations[0]]));
    const factory: WorkspaceEngineComponentFactory = new WorkspaceEngineComponentFactory({
      createEngineComponentsAsync: async () => ({
        ...engine.components,
        operationGraph: subsetGraph
      }),
      mapInvalidationsToOperationsAsync: async () => [],
      shape
    });

    await expect(
      factory.createAsync({
        invalidations: new WorkspaceInvalidationTracker(),
        rushConfiguration: TEST_RUSH_CONFIGURATION
      })
    ).rejects.toThrow('does not represent project');
  });

  it('rejects a graph containing an undeclared plugin phase', async () => {
    const engine: ITestEngine = createTestEngine(
      TEST_RUSH_CONFIGURATION.projects,
      () => Promise.resolve(createInputsSnapshot('next'))
    );
    const factory: WorkspaceEngineComponentFactory = new WorkspaceEngineComponentFactory({
      createEngineComponentsAsync: async () => engine.components,
      mapInvalidationsToOperationsAsync: async () => [],
      shape: {
        phaseNames: ['_phase:other'],
        pluginNames: [PLUGIN_NAME]
      }
    });

    await expect(
      factory.createAsync({
        invalidations: new WorkspaceInvalidationTracker(),
        rushConfiguration: TEST_RUSH_CONFIGURATION
      })
    ).rejects.toThrow('is not declared in the workspace engine shape');
  });
});
