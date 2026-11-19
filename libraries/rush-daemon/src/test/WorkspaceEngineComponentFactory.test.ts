// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type {
  IInputsSnapshot,
  IOperationExecutionResult,
  IOperationGraph,
  IPhase,
  Parallelism,
  RushConfigurationProject
} from '@microsoft/rush-lib';
import { Operation, OperationGraphHooks, OperationStatus, RushSession } from '@microsoft/rush-lib';

import {
  WorkspaceEngineComponentFactory,
  WorkspaceEngineRecreationRequiredError
} from '../WorkspaceEngineComponentFactory';
import type {
  IClassifyWorkspaceInvalidationsOptions,
  ICreateWorkspaceEngineComponentsOptions,
  IMapWorkspaceInvalidationsOptions,
  IWorkspaceEngineComponentFactoryOptions,
  IWorkspaceEngineComponents,
  IWorkspaceEngineShape,
  IWorkspaceInvalidationPeek
} from '../WorkspaceEngineComponentFactory';
import { WorkspaceSession } from '../WorkspaceSession';
import type { IWorkspaceInvalidationWatcher, IWorkspaceSessionComponents } from '../WorkspaceSession';
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

  public discardScheduledIteration(): boolean {
    const hadScheduled: boolean = this.hasScheduledIteration;
    this.hasScheduledIteration = false;
    return hadScheduled;
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

interface IDeferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}

function createDeferred<T>(): IDeferred<T> {
  let resolveDeferred!: (value: T) => void;
  let rejectDeferred!: (error: Error) => void;
  const promise: Promise<T> = new Promise<T>((resolve, reject) => {
    resolveDeferred = resolve;
    rejectDeferred = reject;
  });
  return { promise, resolve: resolveDeferred, reject: rejectDeferred };
}

// Lets every pending callback run, including those of timers
function waitForTurnsAsync(): Promise<void> {
  return new Promise((resolve: () => void) => setTimeout(resolve, 10));
}

function trackSettlement(promise: Promise<unknown>): { readonly isSettled: boolean } {
  const state: { isSettled: boolean } = { isSettled: false };
  const onSettled = (): void => {
    state.isSettled = true;
  };
  void promise.then(onSettled, onSettled);
  return state;
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
        const engineComponents: IWorkspaceSessionComponents = await factory.createAsync(createOptions);
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

  it('retains graph-defining invalidations and requires session recreation', async () => {
    const getInputsSnapshotAsync: jest.Mock = jest.fn(async () => createInputsSnapshot('next'));
    const engine: ITestEngine = createTestEngine(TEST_RUSH_CONFIGURATION.projects, getInputsSnapshotAsync);
    const mapInvalidationsToOperationsAsync: jest.Mock = jest.fn(async () => [engine.operations[0]]);
    const factory: WorkspaceEngineComponentFactory = new WorkspaceEngineComponentFactory({
      createEngineComponentsAsync: async () => engine.components,
      mapInvalidationsToOperationsAsync,
      shape: {
        phaseNames: [PHASE_NAME],
        pluginNames: [PLUGIN_NAME]
      }
    });
    const invalidations: WorkspaceInvalidationTracker = new WorkspaceInvalidationTracker();
    const changedPath: string = path.join(TEST_RUSH_CONFIGURATION.projects[0].projectFolder, 'package.json');
    invalidations.invalidate(changedPath);
    const components: IWorkspaceSessionComponents = await factory.createAsync({
      invalidations,
      rushConfiguration: TEST_RUSH_CONFIGURATION
    });
    const invalidateSpy: jest.SpyInstance = jest.spyOn(engine.graph, 'invalidateOperations');

    await expect(getReconcileAsync(components)()).rejects.toBeInstanceOf(
      WorkspaceEngineRecreationRequiredError
    );
    expect(getInputsSnapshotAsync).not.toHaveBeenCalled();
    expect(mapInvalidationsToOperationsAsync).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(components.inputsSnapshot).toBe(engine.components.inputsSnapshot);
    expect(invalidations.getSnapshot().changedPaths).toEqual([changedPath]);
    await disposeComponentsAsync(components);
  });

  it('supports integration-specific graph input classification', async () => {
    const engine: ITestEngine = createTestEngine(TEST_RUSH_CONFIGURATION.projects, () =>
      Promise.resolve(createInputsSnapshot('next'))
    );
    const changedPath: string = path.join(TEST_REPO_ROOT, 'config', 'test-plugin.json');
    const isEngineRecreationRequiredAsync: jest.Mock<
      Promise<boolean>,
      [IClassifyWorkspaceInvalidationsOptions]
    > = jest.fn(async (options: IClassifyWorkspaceInvalidationsOptions) => {
      void options;
      return true;
    });
    const factory: WorkspaceEngineComponentFactory = new WorkspaceEngineComponentFactory({
      createEngineComponentsAsync: async () => engine.components,
      isEngineRecreationRequiredAsync,
      mapInvalidationsToOperationsAsync: async () => [],
      shape: {
        phaseNames: [PHASE_NAME],
        pluginNames: [PLUGIN_NAME]
      }
    });
    const invalidations: WorkspaceInvalidationTracker = new WorkspaceInvalidationTracker();
    invalidations.invalidate(changedPath);
    const components: IWorkspaceSessionComponents = await factory.createAsync({
      invalidations,
      rushConfiguration: TEST_RUSH_CONFIGURATION
    });

    await expect(getReconcileAsync(components)()).rejects.toBeInstanceOf(
      WorkspaceEngineRecreationRequiredError
    );
    expect(isEngineRecreationRequiredAsync).toHaveBeenCalledWith({
      changedPaths: [changedPath],
      rushConfiguration: TEST_RUSH_CONFIGURATION
    });
    expect(invalidations.getSnapshot().changedPaths).toEqual([changedPath]);
    await disposeComponentsAsync(components);
  });

  it('requires recreation for unknown changes after the startup baseline', async () => {
    const getInputsSnapshotAsync: jest.Mock = jest.fn(async () => createInputsSnapshot('next'));
    const engine: ITestEngine = createTestEngine(TEST_RUSH_CONFIGURATION.projects, getInputsSnapshotAsync);
    const factory: WorkspaceEngineComponentFactory = new WorkspaceEngineComponentFactory({
      createEngineComponentsAsync: async () => engine.components,
      mapInvalidationsToOperationsAsync: async () => [],
      shape: {
        phaseNames: [PHASE_NAME],
        pluginNames: [PLUGIN_NAME]
      }
    });
    const invalidations: WorkspaceInvalidationTracker = new WorkspaceInvalidationTracker();
    invalidations.invalidateForInitialization();
    const components: IWorkspaceSessionComponents = await factory.createAsync({
      invalidations,
      rushConfiguration: TEST_RUSH_CONFIGURATION
    });

    await expect(getReconcileAsync(components)()).resolves.toMatchObject({
      isFullInvalidation: true,
      sequence: 1
    });
    invalidations.invalidate();
    await expect(getReconcileAsync(components)()).rejects.toBeInstanceOf(
      WorkspaceEngineRecreationRequiredError
    );
    expect(getInputsSnapshotAsync).toHaveBeenCalledTimes(1);
    expect(invalidations.getSnapshot()).toMatchObject({
      hasUnknownChanges: true,
      sequence: 2
    });
    await disposeComponentsAsync(components);
  });

  it('classifies known changes that arrive before the startup baseline', async () => {
    const engine: ITestEngine = createTestEngine(TEST_RUSH_CONFIGURATION.projects, () =>
      Promise.resolve(createInputsSnapshot('next'))
    );
    const mapInvalidationsToOperationsAsync: jest.Mock = jest.fn(async () => [engine.operations[0]]);
    const factory: WorkspaceEngineComponentFactory = new WorkspaceEngineComponentFactory({
      createEngineComponentsAsync: async () => engine.components,
      mapInvalidationsToOperationsAsync,
      shape: {
        phaseNames: [PHASE_NAME],
        pluginNames: [PLUGIN_NAME]
      }
    });
    const invalidations: WorkspaceInvalidationTracker = new WorkspaceInvalidationTracker();
    invalidations.invalidateForInitialization();
    const changedPath: string = path.join(
      TEST_RUSH_CONFIGURATION.projects[0].projectFolder,
      'src',
      'index.ts'
    );
    invalidations.invalidate(changedPath);
    const components: IWorkspaceSessionComponents = await factory.createAsync({
      invalidations,
      rushConfiguration: TEST_RUSH_CONFIGURATION
    });

    await expect(getReconcileAsync(components)()).resolves.toMatchObject({
      isFullInvalidation: true,
      sequence: 2
    });
    expect(mapInvalidationsToOperationsAsync).not.toHaveBeenCalled();
    expect(invalidations.getSnapshot()).toMatchObject({
      changedPaths: [],
      hasUnknownChanges: false
    });
    await disposeComponentsAsync(components);
  });

  it('retains invalidations when a mapper returns an operation outside the graph', async () => {
    const engine: ITestEngine = createTestEngine(TEST_RUSH_CONFIGURATION.projects, () =>
      Promise.resolve(createInputsSnapshot('next'))
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

    await expect(getReconcileAsync(components)()).rejects.toThrow('operation outside the graph');
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
    engine.graph.abortController.signal.addEventListener('abort', () => events.push('session-abort'), {
      once: true
    });
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
    const engine: ITestEngine = createTestEngine(TEST_RUSH_CONFIGURATION.projects, () =>
      Promise.resolve(createInputsSnapshot('next'))
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
    const engine: ITestEngine = createTestEngine(TEST_RUSH_CONFIGURATION.projects, () =>
      Promise.resolve(createInputsSnapshot('next'))
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

  describe('validation of the graph inputs', () => {
    const CHANGED_PATH: string = 'libraries/a/src/index.ts';

    async function createComponentsAsync(
      engine: ITestEngine,
      invalidations: WorkspaceInvalidationTracker,
      options: Partial<IWorkspaceEngineComponentFactoryOptions>
    ): Promise<IWorkspaceSessionComponents> {
      const factory: WorkspaceEngineComponentFactory = new WorkspaceEngineComponentFactory({
        createEngineComponentsAsync: async () => engine.components,
        mapInvalidationsToOperationsAsync: async () => [],
        refreshInputsOnEveryRequest: true,
        shape: {
          phaseNames: [PHASE_NAME],
          pluginNames: [PLUGIN_NAME]
        },
        ...options
      });
      return await factory.createAsync({ invalidations, rushConfiguration: TEST_RUSH_CONFIGURATION });
    }

    it('runs while the inputs snapshot is taken, if the inputs are refreshed on every request', async () => {
      const events: string[] = [];
      const nextSnapshot: IInputsSnapshot = createInputsSnapshot('next');
      const snapshot: IDeferred<IInputsSnapshot> = createDeferred();
      const validation: IDeferred<void> = createDeferred();
      const engine: ITestEngine = createTestEngine(TEST_RUSH_CONFIGURATION.projects, () => {
        events.push('snapshot');
        return snapshot.promise;
      });
      const components: IWorkspaceSessionComponents = await createComponentsAsync(
        engine,
        new WorkspaceInvalidationTracker(),
        {
          validateGraphInputsAsync: () => {
            events.push('validation');
            return validation.promise;
          }
        }
      );

      const reconciliationPromise: Promise<unknown> = getReconcileAsync(components)();
      await waitForTurnsAsync();
      expect(events).toEqual(['snapshot', 'validation']);
      validation.resolve();
      snapshot.resolve(nextSnapshot);
      await expect(reconciliationPromise).resolves.toMatchObject({
        inputsSnapshot: nextSnapshot,
        isFullInvalidation: false
      });
      // The inputs are not read again after the checks.
      expect(events).toEqual(['snapshot', 'validation']);
      expect(components.inputsSnapshot).toBe(nextSnapshot);
      await disposeComponentsAsync(components);
    });

    it('runs before the inputs snapshot is taken, if the inputs are not refreshed on every request', async () => {
      const events: string[] = [];
      const validation: IDeferred<void> = createDeferred();
      const engine: ITestEngine = createTestEngine(TEST_RUSH_CONFIGURATION.projects, async () => {
        events.push('snapshot');
        return createInputsSnapshot('next');
      });
      const invalidations: WorkspaceInvalidationTracker = new WorkspaceInvalidationTracker();
      invalidations.invalidate(CHANGED_PATH);
      const components: IWorkspaceSessionComponents = await createComponentsAsync(engine, invalidations, {
        refreshInputsOnEveryRequest: false,
        validateGraphInputsAsync: () => {
          events.push('validation');
          return validation.promise;
        }
      });

      const reconciliationPromise: Promise<unknown> = getReconcileAsync(components)();
      await waitForTurnsAsync();
      expect(events).toEqual(['validation']);
      validation.resolve();
      await reconciliationPromise;
      expect(events).toEqual(['validation', 'snapshot']);
      await disposeComponentsAsync(components);
    });

    it.each<[string, Partial<IWorkspaceEngineComponentFactoryOptions>]>([
      [
        'the graph inputs changed',
        {
          validateGraphInputsAsync: async (): Promise<void> => {
            throw new WorkspaceEngineRecreationRequiredError();
          }
        }
      ],
      [
        'a change requires a new engine',
        {
          isEngineRecreationRequiredAsync: async (): Promise<boolean> => true,
          validateGraphInputsAsync: async (): Promise<void> => undefined
        }
      ]
    ])(
      'waits for the inputs snapshot if %s, and keeps the invalidations',
      async (description: string, options: Partial<IWorkspaceEngineComponentFactoryOptions>) => {
        const snapshot: IDeferred<IInputsSnapshot> = createDeferred();
        const engine: ITestEngine = createTestEngine(
          TEST_RUSH_CONFIGURATION.projects,
          () => snapshot.promise
        );
        const invalidations: WorkspaceInvalidationTracker = new WorkspaceInvalidationTracker();
        invalidations.invalidate(CHANGED_PATH);
        const components: IWorkspaceSessionComponents = await createComponentsAsync(
          engine,
          invalidations,
          options
        );

        const reconciliationPromise: Promise<unknown> = getReconcileAsync(components)();
        const reconciliation: { readonly isSettled: boolean } = trackSettlement(reconciliationPromise);
        await waitForTurnsAsync();
        expect(reconciliation.isSettled).toBe(false);
        snapshot.reject(new Error('The inputs snapshot failed'));
        await expect(reconciliationPromise).rejects.toBeInstanceOf(WorkspaceEngineRecreationRequiredError);
        expect(components.inputsSnapshot).toBe(engine.components.inputsSnapshot);
        expect(invalidations.getSnapshot().changedPaths).toEqual([CHANGED_PATH]);
        await disposeComponentsAsync(components);
      }
    );

    it('handles an inputs snapshot that fails while it runs', async () => {
      const onUnhandledRejection: jest.Mock = jest.fn();
      process.on('unhandledRejection', onUnhandledRejection);
      try {
        const error: Error = new Error('The inputs snapshot failed');
        const engine: ITestEngine = createTestEngine(TEST_RUSH_CONFIGURATION.projects, () =>
          Promise.reject(error)
        );
        const components: IWorkspaceSessionComponents = await createComponentsAsync(
          engine,
          new WorkspaceInvalidationTracker(),
          { validateGraphInputsAsync: waitForTurnsAsync }
        );

        await expect(getReconcileAsync(components)()).rejects.toBe(error);
        expect(onUnhandledRejection).not.toHaveBeenCalled();
        await disposeComponentsAsync(components);
      } finally {
        process.off('unhandledRejection', onUnhandledRejection);
      }
    });

    it('acknowledges only the invalidations that precede the inputs snapshot', async () => {
      const laterPath: string = 'libraries/b/src/index.ts';
      const invalidations: WorkspaceInvalidationTracker = new WorkspaceInvalidationTracker();
      invalidations.invalidate(CHANGED_PATH);
      const engine: ITestEngine = createTestEngine(TEST_RUSH_CONFIGURATION.projects, async () => {
        // Git may read the file before this change
        invalidations.invalidate(laterPath);
        return createInputsSnapshot('next');
      });
      const mapInvalidationsToOperationsAsync: jest.Mock = jest.fn(async () => []);
      const components: IWorkspaceSessionComponents = await createComponentsAsync(engine, invalidations, {
        mapInvalidationsToOperationsAsync,
        validateGraphInputsAsync: async () => undefined
      });

      await getReconcileAsync(components)();
      expect(mapInvalidationsToOperationsAsync).toHaveBeenCalledTimes(1);
      expect(mapInvalidationsToOperationsAsync.mock.calls[0][0].changedPaths).toEqual([CHANGED_PATH]);
      expect(invalidations.getSnapshot().changedPaths).toEqual([laterPath]);
      await disposeComponentsAsync(components);
    });
  });

  describe('peeking at the invalidations for an executing iteration', () => {
    const CHANGED_PATH: string = 'libraries/a/src/index.ts';
    const ITERATION_RECORDS: ReadonlyMap<Operation, IOperationExecutionResult> = new Map();

    interface IPeekFixture {
      readonly components: IWorkspaceSessionComponents;
      readonly engine: ITestEngine;
      readonly invalidateSpy: jest.SpyInstance;
      readonly invalidations: WorkspaceInvalidationTracker;
      readonly mapInvalidationsToOperationsAsync: jest.Mock<
        Promise<Iterable<Operation>>,
        [IMapWorkspaceInvalidationsOptions]
      >;
      readonly nextSnapshot: IInputsSnapshot;
      peekAsync(): Promise<IWorkspaceInvalidationPeek | undefined>;
    }

    async function createPeekFixtureAsync(
      options: Partial<IWorkspaceEngineComponentFactoryOptions> = {}
    ): Promise<IPeekFixture> {
      const nextSnapshot: IInputsSnapshot = createInputsSnapshot('next');
      const engine: ITestEngine = createTestEngine(
        TEST_RUSH_CONFIGURATION.projects,
        async () => nextSnapshot
      );
      const mapInvalidationsToOperationsAsync: IPeekFixture['mapInvalidationsToOperationsAsync'] = jest.fn(
        async (mapOptions: IMapWorkspaceInvalidationsOptions) => {
          void mapOptions;
          return [engine.operations[0], engine.operations[0]];
        }
      );
      const invalidations: WorkspaceInvalidationTracker = new WorkspaceInvalidationTracker();
      const factory: WorkspaceEngineComponentFactory = new WorkspaceEngineComponentFactory({
        createEngineComponentsAsync: async () => engine.components,
        mapInvalidationsToOperationsAsync,
        refreshInputsOnEveryRequest: true,
        shape: {
          phaseNames: [PHASE_NAME],
          pluginNames: [PLUGIN_NAME]
        },
        ...options
      });
      const components: IWorkspaceSessionComponents = await factory.createAsync({
        invalidations,
        rushConfiguration: TEST_RUSH_CONFIGURATION
      });
      return {
        components,
        engine,
        invalidateSpy: jest.spyOn(engine.graph, 'invalidateOperations'),
        invalidations,
        mapInvalidationsToOperationsAsync,
        nextSnapshot,
        peekAsync: () => components.peekInvalidationsAsync!({ executingIterationRecords: ITERATION_RECORDS })
      };
    }

    it('maps the retained paths without applying them, and applies them when committed', async () => {
      const fixture: IPeekFixture = await createPeekFixtureAsync();
      const { components, engine, invalidateSpy, invalidations } = fixture;
      invalidations.invalidate(CHANGED_PATH);

      const peek: IWorkspaceInvalidationPeek | undefined = await fixture.peekAsync();

      expect(peek?.inputsSnapshot).toBe(fixture.nextSnapshot);
      expect(peek?.invalidatedOperations).toEqual(new Set([engine.operations[0]]));
      expect(peek?.invalidationReason).toBe('workspace-inputs-changed');
      expect(fixture.mapInvalidationsToOperationsAsync).toHaveBeenCalledTimes(1);
      expect(fixture.mapInvalidationsToOperationsAsync.mock.calls[0][0]).toMatchObject({
        changedPaths: [CHANGED_PATH],
        currentInputsSnapshot: engine.components.inputsSnapshot,
        executingIterationRecords: ITERATION_RECORDS,
        nextInputsSnapshot: fixture.nextSnapshot
      });
      expect(invalidateSpy).not.toHaveBeenCalled();
      expect(components.inputsSnapshot).toBe(engine.components.inputsSnapshot);
      expect(invalidations.getSnapshot().changedPaths).toEqual([CHANGED_PATH]);

      // Later reconciliations wait for the peek
      const reconciliation: Promise<unknown> = getReconcileAsync(components)();
      const reconciliationState: { readonly isSettled: boolean } = trackSettlement(reconciliation);
      await waitForTurnsAsync();
      expect(reconciliationState.isSettled).toBe(false);

      peek!.commit();
      expect(components.inputsSnapshot).toBe(fixture.nextSnapshot);
      expect(invalidations.getSnapshot().changedPaths).toEqual([]);
      expect(() => peek!.commit()).toThrow('already committed or discarded');
      expect(() => peek!.discard()).toThrow('already committed or discarded');
      await expect(reconciliation).resolves.toMatchObject({ invalidatedOperationCount: 1 });
      // The reconciliation after the peek compares against the committed snapshot
      expect(fixture.mapInvalidationsToOperationsAsync.mock.calls[1][0]).toMatchObject({
        changedPaths: [],
        currentInputsSnapshot: fixture.nextSnapshot
      });
      expect(fixture.mapInvalidationsToOperationsAsync.mock.calls[1][0]).not.toHaveProperty(
        'executingIterationRecords'
      );
      await disposeComponentsAsync(components);
    });

    it('leaves the inputs snapshot and the invalidations unchanged when discarded', async () => {
      const fixture: IPeekFixture = await createPeekFixtureAsync();
      const { components, engine, invalidateSpy, invalidations } = fixture;
      invalidations.invalidate(CHANGED_PATH);

      const peek: IWorkspaceInvalidationPeek | undefined = await fixture.peekAsync();
      peek!.discard();

      expect(components.inputsSnapshot).toBe(engine.components.inputsSnapshot);
      expect(invalidations.getSnapshot().changedPaths).toEqual([CHANGED_PATH]);
      await expect(getReconcileAsync(components)()).resolves.toMatchObject({
        inputsSnapshot: fixture.nextSnapshot,
        invalidatedOperationCount: 1
      });
      expect(fixture.mapInvalidationsToOperationsAsync.mock.calls[1][0]).toMatchObject({
        changedPaths: [CHANGED_PATH],
        currentInputsSnapshot: engine.components.inputsSnapshot
      });
      expect(invalidateSpy).toHaveBeenCalledWith(new Set([engine.operations[0]]), 'workspace-inputs-changed');
      await disposeComponentsAsync(components);
    });

    it('waits for an earlier reconciliation and maps against its inputs snapshot', async () => {
      const firstSnapshot: IDeferred<IInputsSnapshot> = createDeferred();
      const fixture: IPeekFixture = await createPeekFixtureAsync();
      const { components, engine, invalidations } = fixture;
      const getInputsSnapshotAsync: jest.Mock = jest
        .fn()
        .mockReturnValueOnce(firstSnapshot.promise)
        .mockResolvedValue(fixture.nextSnapshot);
      Object.assign(engine.components, { getInputsSnapshotAsync });
      invalidations.invalidate(CHANGED_PATH);

      const reconciliation: Promise<unknown> = getReconcileAsync(components)();
      const peekPromise: Promise<IWorkspaceInvalidationPeek | undefined> = fixture.peekAsync();
      await waitForTurnsAsync();
      expect(getInputsSnapshotAsync).toHaveBeenCalledTimes(1);
      const reconciledSnapshot: IInputsSnapshot = createInputsSnapshot('reconciled');
      firstSnapshot.resolve(reconciledSnapshot);
      await reconciliation;
      const peek: IWorkspaceInvalidationPeek | undefined = await peekPromise;

      expect(getInputsSnapshotAsync).toHaveBeenCalledTimes(2);
      expect(fixture.mapInvalidationsToOperationsAsync.mock.calls[1][0]).toMatchObject({
        changedPaths: [],
        currentInputsSnapshot: reconciledSnapshot,
        nextInputsSnapshot: fixture.nextSnapshot
      });
      peek!.discard();
      await disposeComponentsAsync(components);
    });

    it('returns undefined for changes that invalidate every operation, and keeps them', async () => {
      const fixture: IPeekFixture = await createPeekFixtureAsync();
      const { components, engine, invalidateSpy, invalidations } = fixture;
      invalidations.invalidateForInitialization();

      await expect(fixture.peekAsync()).resolves.toBeUndefined();

      expect(fixture.mapInvalidationsToOperationsAsync).not.toHaveBeenCalled();
      expect(invalidateSpy).not.toHaveBeenCalled();
      expect(components.inputsSnapshot).toBe(engine.components.inputsSnapshot);
      await expect(getReconcileAsync(components)()).resolves.toMatchObject({ isFullInvalidation: true });
      expect(invalidateSpy).toHaveBeenCalledWith(undefined, 'workspace-inputs-changed');
      await disposeComponentsAsync(components);
    });

    it('throws, keeping the invalidations, where a reconciliation throws', async () => {
      const fixture: IPeekFixture = await createPeekFixtureAsync();
      const { components, engine, invalidateSpy, invalidations } = fixture;
      const changedPath: string = path.join(
        TEST_RUSH_CONFIGURATION.projects[0].projectFolder,
        'package.json'
      );
      invalidations.invalidate(changedPath);

      await expect(fixture.peekAsync()).rejects.toBeInstanceOf(WorkspaceEngineRecreationRequiredError);

      expect(fixture.mapInvalidationsToOperationsAsync).not.toHaveBeenCalled();
      expect(invalidateSpy).not.toHaveBeenCalled();
      expect(components.inputsSnapshot).toBe(engine.components.inputsSnapshot);
      expect(invalidations.getSnapshot().changedPaths).toEqual([changedPath]);
      // The failed peek doesn't hold later reconciliations
      await expect(getReconcileAsync(components)()).rejects.toBeInstanceOf(
        WorkspaceEngineRecreationRequiredError
      );
      await disposeComponentsAsync(components);
    });

    it('rejects a peek once the engine is being disposed, without mapping the invalidations', async () => {
      const fixture: IPeekFixture = await createPeekFixtureAsync();
      const { components, invalidations } = fixture;
      invalidations.invalidate(CHANGED_PATH);
      const disposalPromise: Promise<void> = disposeComponentsAsync(components);

      await expect(fixture.peekAsync()).rejects.toThrow('The workspace engine is being disposed.');
      expect(fixture.mapInvalidationsToOperationsAsync).not.toHaveBeenCalled();
      await disposalPromise;
    });

    it('does not read the inputs without changes, if the inputs are not refreshed on every request', async () => {
      const fixture: IPeekFixture = await createPeekFixtureAsync({ refreshInputsOnEveryRequest: false });
      const { components, engine, invalidations } = fixture;
      const getInputsSnapshotAsync: jest.SpyInstance = jest.spyOn(
        engine.components,
        'getInputsSnapshotAsync'
      );
      await getReconcileAsync(components)();
      expect(invalidations.getSnapshot().sequence).toBe(0);

      const peek: IWorkspaceInvalidationPeek | undefined = await fixture.peekAsync();

      expect(peek?.inputsSnapshot).toBe(engine.components.inputsSnapshot);
      expect(peek?.invalidatedOperations).toEqual(new Set());
      expect(peek?.invalidationReason).toBe('workspace-inputs-changed');
      expect(getInputsSnapshotAsync).not.toHaveBeenCalled();
      expect(fixture.mapInvalidationsToOperationsAsync).not.toHaveBeenCalled();
      peek!.commit();
      invalidations.invalidate(CHANGED_PATH);
      const nextPeek: IWorkspaceInvalidationPeek | undefined = await fixture.peekAsync();
      expect(nextPeek?.inputsSnapshot).toBe(fixture.nextSnapshot);
      expect(getInputsSnapshotAsync).toHaveBeenCalledTimes(1);
      nextPeek!.commit();
      expect(components.inputsSnapshot).toBe(fixture.nextSnapshot);
      await disposeComponentsAsync(components);
    });

    it('makes the committed inputs snapshot the session inputs snapshot', async () => {
      const nextSnapshot: IInputsSnapshot = createInputsSnapshot('next');
      let engine: ITestEngine | undefined;
      const factory: WorkspaceEngineComponentFactory = new WorkspaceEngineComponentFactory({
        createEngineComponentsAsync: async (createOptions: ICreateWorkspaceEngineComponentsOptions) => {
          engine = createTestEngine(createOptions.rushConfiguration.projects, async () => nextSnapshot);
          return engine.components;
        },
        mapInvalidationsToOperationsAsync: async () => [engine!.operations[0]],
        refreshInputsOnEveryRequest: true,
        shape: {
          phaseNames: [PHASE_NAME],
          pluginNames: [PLUGIN_NAME]
        }
      });
      const session: WorkspaceSession = await WorkspaceSession.createAsync({
        createComponentsAsync: async (createOptions) => ({
          ...(await factory.createAsync(createOptions)),
          projectWatcher: {
            [Symbol.asyncDispose]: () => Promise.resolve(),
            startAsync: () => Promise.resolve()
          }
        }),
        repoRoot: TEST_REPO_ROOT,
        rushVersion: '5.178.1'
      });
      // The session invalidates every operation at startup
      await expect(
        session.peekInvalidationsAsync({ executingIterationRecords: ITERATION_RECORDS })
      ).resolves.toBeUndefined();
      const startupSnapshot: IInputsSnapshot = createInputsSnapshot('startup');
      jest.spyOn(engine!.components, 'getInputsSnapshotAsync').mockResolvedValueOnce(startupSnapshot);
      await session.reconcileInvalidationsAsync();
      expect(session.inputsSnapshot).toBe(startupSnapshot);

      session.invalidations.invalidate(CHANGED_PATH);
      const discarded: IWorkspaceInvalidationPeek | undefined = await session.peekInvalidationsAsync({
        executingIterationRecords: ITERATION_RECORDS
      });
      discarded!.discard();
      expect(session.inputsSnapshot).toBe(startupSnapshot);
      const committed: IWorkspaceInvalidationPeek | undefined = await session.peekInvalidationsAsync({
        executingIterationRecords: ITERATION_RECORDS
      });
      expect(committed?.invalidatedOperations).toEqual(new Set([engine!.operations[0]]));
      committed!.commit();
      expect(session.inputsSnapshot).toBe(nextSnapshot);
      expect(session.invalidations.getSnapshot().changedPaths).toEqual([]);
      await session[Symbol.asyncDispose]();
    });
  });
});
