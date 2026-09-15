// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Rush, type IPhasedCommandEngine } from '@microsoft/rush-lib';
import { LockFile } from '@rushstack/node-core-library';

import { RequestExclusivityClass } from '../RequestScheduler';
import { WorkspaceSession } from '../WorkspaceSession';
import { WorkspaceSessionFileWatcher } from '../WorkspaceSessionFileWatcher';
import { WorkspaceSessionProvider } from '../WorkspaceSessionProvider';
import { WorkspaceWarmSet } from '../WorkspaceWarmSet';
import { getWorkspaceRequestScheduler } from '../WorkspaceRequestAdmission';
import { getWorkspaceStatus } from '../WorkspaceStatus';
import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';
import { createDeferred } from './DaemonRequestWireTestUtilities';
import {
  createNativeEngineAsync,
  createObservedSessionAsync,
  GENERATION_POLICY,
  setDaemonPolicy
} from './WarmGenerationTestUtilities';

jest.setTimeout(30_000);

describe('warm-set generation barriers', () => {
  let fixture: DaemonGraphTestFixture;
  beforeEach(async () => {
    fixture = await DaemonGraphTestFixture.createAsync((created) => setDaemonPolicy(created, {}));
  });
  afterEach(async () => {
    await fixture[Symbol.asyncDispose]();
  });

  it('fences later initialization after cold quiescence without invoking a factory', async () => {
    const { session } = await createObservedSessionAsync({
      repoRoot: fixture.folder,
      rushVersion: Rush.version
    });
    try {
      await session.quiesceWarmSetAsync();
      const factory = jest.fn(async () => createNativeEngineAsync(session.rushConfiguration));
      await expect(session.initializeEngineAsync(factory)).rejects.toThrow('quiescing');
      expect(factory).not.toHaveBeenCalled();
      expect(session.operationGraph).toBeUndefined();
      expect(session.warmSetStatus).toBeUndefined();
    } finally {
      await session[Symbol.asyncDispose]();
    }
  });

  it('publishes pending initialization before construction can reenter the quiescence barrier', async () => {
    const { session } = await createObservedSessionAsync({
      repoRoot: fixture.folder,
      rushVersion: Rush.version
    });
    const engine: IPhasedCommandEngine = await createNativeEngineAsync(session.rushConfiguration);
    const entered = createDeferred<void>();
    const release = createDeferred<void>();
    let stopped: boolean = false;
    let stopping: Promise<void> | undefined;
    const initialization = session.initializeEngineAsync(async () => {
      stopping = session.quiesceWarmSetAsync().then(() => {
        stopped = true;
      });
      entered.resolve();
      await release.promise;
      return engine;
    });
    const rejected = expect(initialization).rejects.toThrow('quiescence/disposal');
    try {
      await entered.promise;
      await Promise.resolve();
      await Promise.resolve();
      expect(stopped).toBe(false);
      release.resolve();
      await rejected;
      await stopping;
      expect(stopped).toBe(true);
      expect(engine.operationGraph.abortController.signal.aborted).toBe(true);
    } finally {
      release.resolve();
      await session[Symbol.asyncDispose]();
    }
  });

  it.each(['quiesce', 'dispose'] as const)(
    'awaits pending initialization and stops an integration-supplied late controller during %s',
    async (mode) => {
      const { session, watcher } = await createObservedSessionAsync({
        repoRoot: fixture.folder,
        rushVersion: Rush.version
      });
      const engine: IPhasedCommandEngine = await createNativeEngineAsync(session.rushConfiguration);
      const release = createDeferred<void>();
      const acquire = jest.fn(async () => await engine.acquireExecutionLeaseAsync?.());
      let warm: WorkspaceWarmSet | undefined;
      const initialization = session.initializeEngineAsync(async () => {
        await release.promise;
        warm = WorkspaceWarmSet.attach({
          operationGraph: engine.operationGraph,
          configuration: GENERATION_POLICY,
          watcher,
          scheduler: getWorkspaceRequestScheduler(session),
          acquireExecutionLeaseAsync: acquire
        });
        return engine;
      });
      const rejected = expect(initialization).rejects.toThrow('quiescence/disposal');
      let stopped: boolean = false;
      const stopping = (
        mode === 'quiesce' ? session.quiesceWarmSetAsync() : session[Symbol.asyncDispose]()
      ).then(() => {
        stopped = true;
      });
      try {
        await Promise.resolve();
        expect(stopped).toBe(false);
        release.resolve();
        await Promise.all([rejected, stopping]);
        expect(acquire).not.toHaveBeenCalled();
        expect(warm?.getStatus().maintenanceState).toBe('stopped');
        expect(engine.operationGraph.abortController.signal.aborted).toBe(true);
        expect(session.operationGraph).toBeUndefined();
      } finally {
        release.resolve();
        await session[Symbol.asyncDispose]();
      }
    }
  );

  it.each([false, true])(
    'automatically owns an eagerly supplied real graph (injected watcher: %s)',
    async (injected) => {
      const session: WorkspaceSession = await WorkspaceSession.createAsync({
        repoRoot: fixture.folder,
        rushVersion: Rush.version,
        createComponentsAsync: async ({ rushConfiguration }) => {
          const engine: IPhasedCommandEngine = await createNativeEngineAsync(rushConfiguration);
          if (!injected) return engine;
          const watcher: WorkspaceSessionFileWatcher = new WorkspaceSessionFileWatcher({
            rushConfiguration,
            projectNames: []
          });
          return {
            ...engine,
            projectWatcher: watcher,
            [Symbol.asyncDispose]: async () => {
              await watcher[Symbol.asyncDispose]();
              await engine[Symbol.asyncDispose]();
            }
          };
        }
      });
      try {
        expect(session.warmSetStatus).toMatchObject({
          maintenanceState: 'running',
          watchedProjectNames: [],
          configuration: GENERATION_POLICY
        });
        await session.quiesceWarmSetAsync();
        expect(session.warmSetStatus?.maintenanceState).toBe('stopped');
        expect(fixture.runs()).toEqual([]);
      } finally {
        await session[Symbol.asyncDispose]();
      }
    }
  );

  it('never publishes a replacement or token when real generation resource disposal fails', async () => {
    let creations: number = 0;
    let engine: IPhasedCommandEngine | undefined;
    const provider: WorkspaceSessionProvider = new WorkspaceSessionProvider(
      async (options) => {
        creations++;
        return await WorkspaceSession.createAsync({
          ...options,
          createComponentsAsync: async ({ rushConfiguration }) => {
            const created = await createNativeEngineAsync(rushConfiguration);
            engine = created;
            return {
              ...created,
              [Symbol.asyncDispose]: async () => {
                await created[Symbol.asyncDispose]();
                throw new Error('generation-resource-disposal-failed');
              }
            };
          }
        });
      },
      { repoRoot: fixture.folder, rushVersion: Rush.version }
    );
    const session = await provider.getSessionAsync();
    const before = getWorkspaceStatus(provider);
    await session.quiesceWarmSetAsync?.();
    const admission = await getWorkspaceRequestScheduler(session).acquireAsync({
      exclusivityClass: RequestExclusivityClass.Exclusive
    });
    const native = LockFile.tryAcquire(session.rushConfiguration.commonTempFolder, 'rush');
    expect(native).toBeDefined();
    try {
      await expect(provider.reloadAsync()).rejects.toThrow('generation-resource-disposal-failed');
      expect(creations).toBe(1);
      expect(provider.currentGenerationToken).toBe(before.generationToken);
      expect(provider.generation).toBe(before.generation);
      expect(engine?.operationGraph.abortController.signal.aborted).toBe(true);
      expect(getWorkspaceStatus(provider).warmSet?.maintenanceState).toBe('stopped');
      await expect(provider.getSessionAsync()).rejects.toThrow('generation-resource-disposal-failed');
    } finally {
      native?.release();
      admission.release();
      await expect(provider[Symbol.asyncDispose]()).rejects.toThrow('generation-resource-disposal-failed');
    }
  });

  it('does not forget cleanup failure from rejected late components when quiescing', async () => {
    const { session, watcher } = await createObservedSessionAsync({
      repoRoot: fixture.folder,
      rushVersion: Rush.version
    });
    const engine: IPhasedCommandEngine = await createNativeEngineAsync(session.rushConfiguration);
    const release = createDeferred<void>();
    const initialization = session.initializeEngineAsync(async () => {
      await release.promise;
      return {
        ...engine,
        [Symbol.asyncDispose]: async () => {
          await engine[Symbol.asyncDispose]();
          throw new Error('late-cleanup-failed');
        }
      };
    });
    const rejected = expect(initialization).rejects.toThrow('late-cleanup-failed');
    const quiescence = expect(session.quiesceWarmSetAsync()).rejects.toThrow('Failed to quiesce');
    release.resolve();
    try {
      await Promise.all([rejected, quiescence]);
      await expect(session[Symbol.asyncDispose]()).rejects.toThrow('Failed to quiesce');
      expect(engine.operationGraph.abortController.signal.aborted).toBe(true);
    } finally {
      // The deliberately failed ownership barrier keeps the watcher owned. The test knows the real
      // native engine is closed and explicitly releases this remaining test-owned resource.
      await watcher[Symbol.asyncDispose]();
    }
  });

  it('makes native lease-release failure sticky at quiescence without failing optional maintenance', async () => {
    const { session, watcher } = await createObservedSessionAsync({
      repoRoot: fixture.folder,
      rushVersion: Rush.version
    });
    const engine: IPhasedCommandEngine = await createNativeEngineAsync(session.rushConfiguration);
    const diagnostics: Error[] = [];
    const acquire = jest.fn(async () => {
      const native = await engine.acquireExecutionLeaseAsync?.();
      return {
        [Symbol.asyncDispose]: async () => {
          await native?.[Symbol.asyncDispose]();
          throw new Error('native-release-failed');
        }
      };
    });
    const warm = WorkspaceWarmSet.attach({
      operationGraph: engine.operationGraph,
      configuration: GENERATION_POLICY,
      watcher,
      scheduler: getWorkspaceRequestScheduler(session),
      acquireExecutionLeaseAsync: acquire,
      onDiagnostic: (error) => diagnostics.push(error)
    });
    await session.initializeEngineAsync(async () => engine);
    try {
      await warm.maintainAsync();
      expect(warm.getStatus()).toMatchObject({
        maintenanceState: 'failed',
        maintenanceFailure: expect.any(String)
      });
      expect(diagnostics).toHaveLength(1);
      await warm.maintainAsync();
      expect(acquire).toHaveBeenCalledTimes(1);
      await expect(session.quiesceWarmSetAsync()).rejects.toThrow('Failed to quiesce');
      await expect(session[Symbol.asyncDispose]()).rejects.toThrow('Failed to quiesce');
    } finally {
      await watcher[Symbol.asyncDispose]();
      await engine[Symbol.asyncDispose]();
    }
  });
});
