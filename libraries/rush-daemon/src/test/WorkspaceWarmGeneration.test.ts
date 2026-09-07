// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { PhasedCommandEngine, type IPhasedCommandEngine } from '@microsoft/rush-lib';
import { LockFile } from '@rushstack/node-core-library';

import { getWorkspaceGenerationToken } from '../WorkspaceGeneration';
import { getWorkspaceRequestScheduler } from '../WorkspaceRequestAdmission';
import { DaemonGraphTestFixture, responseSnapshot } from './DaemonGraphTestFixture';
import { createDeferred } from './DaemonRequestWireTestUtilities';
import {
  eventuallyAsync,
  GENERATION_POLICY,
  getWarmSet,
  pongAsync,
  setDaemonPolicy
} from './WarmGenerationTestUtilities';
import { createScript, useNativeIpcRunners } from './WarmSetTestFixture';

jest.setTimeout(30_000);

describe('automatic warm generation ownership and pong accounting', () => {
  let fixture: DaemonGraphTestFixture;
  beforeEach(async () => {
    fixture = await DaemonGraphTestFixture.createAsync((created) => setDaemonPolicy(created, {}));
  });
  afterEach(async () => {
    await fixture[Symbol.asyncDispose]();
  });

  it('reports a cold generation without initializing a graph, and automatically applies configured limits', async () => {
    const cold = await pongAsync(fixture);
    expect(cold.workspace).toMatchObject({
      generation: fixture.host.workspaceGeneration,
      generationToken: getWorkspaceGenerationToken(fixture.session),
      graphInitialized: false
    });
    expect(cold.workspace?.warmSet).toBeUndefined();
    expect(fixture.session.operationGraph).toBeUndefined();
    expect(fixture.runs()).toEqual([]);
    setDaemonPolicy(fixture, { warmSetMaxProjects: 1, autoWarmByTelemetry: true });
    await fixture.buildSuccessfullyAsync();
    const warm = getWarmSet(fixture);
    await eventuallyAsync(() => expect(warm.getStatus().retainedProjectNames).toHaveLength(1));
    const status = await pongAsync(fixture);
    expect(status.pid).toBe(cold.pid);
    expect(status.workspace?.generation).toBeGreaterThan(cold.workspace!.generation);
    expect(status.workspace?.warmSet).toMatchObject({
      configuration: { ...GENERATION_POLICY, warmSetMaxProjects: 1, autoWarmByTelemetry: true },
      maintenanceState: 'running',
      measuredRunnerMemoryBytes: 0,
      unmeasuredRunnerCount: 0,
      overProjectLimit: false
    });
    expect(status.workspace?.warmSet?.watchedProjectNames).toEqual(
      status.workspace?.warmSet?.retainedProjectNames
    );
    expect(fixture.runs()).toEqual(['a', 'b']);
    expect(fixture.host.workspaceStatus.generationToken).toBe(status.workspace?.generationToken);
  });

  it('applies idle and memory knobs in the default host while reporting irreducible pressure honestly', async () => {
    setDaemonPolicy(fixture, { warmIdleTimeoutSeconds: 0.05 });
    await fixture.buildSuccessfullyAsync();
    const generation: number = fixture.host.workspaceGeneration;
    await eventuallyAsync(() => expect(fixture.session.warmSetStatus?.retainedProjectNames).toEqual([]));
    expect((await pongAsync(fixture)).workspace?.warmSet?.configuration.warmIdleTimeoutSeconds).toBe(0.05);
    const observed: string[][] = [];
    fixture.session.operationGraph!.hooks.beforeExecuteIterationAsync.tap(
      'restored-project-observation',
      () => {
        observed.push([...(fixture.session.warmSetStatus?.watchedProjectNames ?? [])]);
      }
    );
    fixture.write('a/input.txt', 'cold-source-change');
    await fixture.buildSuccessfullyAsync();
    expect(fixture.host.workspaceGeneration).toBe(generation);
    expect(observed).toContainEqual(['a', 'b']);
    expect(fixture.runs()).toEqual(['a', 'b', 'a', 'b']);
    const warning = jest.spyOn(process, 'emitWarning').mockImplementation(() => {});
    try {
      setDaemonPolicy(fixture, { warmMemoryBudgetMB: 0.01 });
      await fixture.buildSuccessfullyAsync();
      await eventuallyAsync(() => expect(fixture.session.warmSetStatus?.retainedProjectNames).toEqual([]));
      const status = await pongAsync(fixture);
      expect(status.workspace?.warmSet).toMatchObject({
        configuration: { warmMemoryBudgetMB: 0.01 },
        daemonResidentMemoryBytes: expect.any(Number),
        measuredRunnerMemoryBytes: 0,
        overMemoryBudget: true,
        maintenanceState: 'running'
      });
      expect(status.workspace!.warmSet!.daemonResidentMemoryBytes).toBeGreaterThan(0.01 * 1024 * 1024);
      expect(warning).toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });

  it('does not certify evicted graph results from historical observer state', async () => {
    await fixture.buildSuccessfullyAsync();
    responseSnapshot(await fixture.graphAsync('status'));
    const warning = jest.spyOn(process, 'emitWarning').mockImplementation(() => {});
    try {
      const warm = getWarmSet(fixture);
      warm.updateConfiguration({ ...GENERATION_POLICY, warmMemoryBudgetMB: 0.01 });
      await warm.maintainAsync();
      expect(fixture.session.operationGraph!.resultByOperation.size).toBe(0);
      const snapshot = responseSnapshot(await fixture.graphAsync('invalidate', '--project', 'a'));
      if (!snapshot.initialized) throw new Error('Expected the retained graph definition.');
      expect(snapshot.operations.find((operation) => operation.projectName === 'a')?.status).toBe('READY');
      expect(fixture.runs()).toEqual(['a', 'b']);
    } finally {
      warning.mockRestore();
    }
  });

  it.each([false, true])(
    'applies automatic telemetry retention from configuration (enabled: %s)',
    async (telemetry) => {
      setDaemonPolicy(fixture, { warmSetMaxProjects: 2, autoWarmByTelemetry: telemetry });
      fixture.write(
        '.gitignore',
        'common/temp/\n**/.rush/\n**/rush-logs/\n**/lib/\n**/node_modules/\nruns.txt\n'
      );
      for (const name of ['a', 'b', 'c']) fixture.write(`${name}/build.cjs`, createScript(name, true));
      const create = PhasedCommandEngine.prototype.createEngineAsync;
      const engines = jest
        .spyOn(PhasedCommandEngine.prototype, 'createEngineAsync')
        .mockImplementation(async function (
          this: PhasedCommandEngine,
          lock?: LockFile
        ): Promise<IPhasedCommandEngine> {
          const engine: IPhasedCommandEngine = await create.call(this, lock);
          useNativeIpcRunners(engine.operationGraph);
          return engine;
        });
      try {
        await fixture.buildSuccessfullyAsync();
        fixture.write('a/input.txt', 'two');
        fixture.write('b/input.txt', 'two');
        await fixture.buildSuccessfullyAsync();
        await fixture.runAsync(['build', '--only', 'b', '--parallelism', '3']);
        expect(
          (await fixture.runAsync(['build', '--only', 'c', '--parallelism', '3'])).terminal
        ).toMatchObject({ payload: { exitCode: 0 } });
        const expected: string[] = telemetry ? ['a', 'b'] : ['c', 'b'];
        await eventuallyAsync(() =>
          expect(fixture.session.warmSetStatus?.retainedProjectNames).toEqual(expected)
        );
        const status = await pongAsync(fixture);
        expect(status.workspace?.warmSet).toMatchObject({
          configuration: { autoWarmByTelemetry: telemetry },
          retainedProjectNames: expected,
          measuredRunnerMemoryBytes: expect.any(Number),
          unmeasuredRunnerCount: 0
        });
        expect(status.workspace!.warmSet!.measuredRunnerMemoryBytes).toBeGreaterThan(0);
        expect(fixture.runs()).toEqual(['a', 'b', 'a', 'b', 'c']);
      } finally {
        engines.mockRestore();
      }
    }
  );

  it('quiesces the old controller before workspace/native locks and replaces it on a same-PID soft reload', async () => {
    await fixture.buildSuccessfullyAsync();
    const oldSession = fixture.session;
    const oldGraph = oldSession.operationGraph!;
    const oldWarm = getWarmSet(fixture);
    const oldStatus = await pongAsync(fixture);
    const entered = createDeferred<void>();
    const release = createDeferred<void>();
    const quiescing = createDeferred<void>();
    const close = oldGraph.closeRunnersAsync.bind(oldGraph);
    const closeSpy = jest.spyOn(oldGraph, 'closeRunnersAsync').mockImplementation(async (operations) => {
      entered.resolve();
      await release.promise;
      await close(operations);
    });
    oldWarm.updateConfiguration({ ...GENERATION_POLICY, warmSetMaxProjects: 1 });
    const maintenance = oldWarm.maintainAsync();
    await entered.promise;
    const scheduler = getWorkspaceRequestScheduler(oldSession);
    const admission = jest.spyOn(scheduler, 'acquireAsync');
    const native = jest.spyOn(LockFile, 'tryAcquire');
    const quiesce = oldSession.quiesceWarmSetAsync.bind(oldSession);
    const quiesceSpy = jest.spyOn(oldSession, 'quiesceWarmSetAsync').mockImplementation(() => {
      const promise = quiesce();
      quiescing.resolve();
      return promise;
    });
    const manifestPath: string = path.join(fixture.folder, 'a/package.json');
    const manifest: { scripts: Record<string, string> } = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.scripts['_phase:compile'] = 'node build.cjs --soft-reload';
    fixture.write('a/package.json', JSON.stringify(manifest));
    const build = fixture.buildSuccessfullyAsync();
    try {
      await quiescing.promise;
      expect(admission).not.toHaveBeenCalled();
      expect(native).not.toHaveBeenCalled();
      expect(fixture.session).toBe(oldSession);
      const pending = await pongAsync(fixture);
      expect(pending.workspace?.generationToken).toBe(oldStatus.workspace?.generationToken);
      expect(pending.workspace?.warmSet).toMatchObject({
        maintenanceState: 'quiescing',
        retainedProjectNames: expect.arrayContaining(['a', 'b'])
      });
    } finally {
      release.resolve();
      await maintenance;
      closeSpy.mockRestore();
      quiesceSpy.mockRestore();
      admission.mockRestore();
      native.mockRestore();
    }
    expect((await build).terminal).toMatchObject({ payload: { exitCode: 0 } });
    const current = await pongAsync(fixture);
    expect(current.pid).toBe(oldStatus.pid);
    expect(current.workspace?.generationToken).not.toBe(oldStatus.workspace?.generationToken);
    expect(current.workspace!.generation).toBeGreaterThan(oldStatus.workspace!.generation);
    expect(fixture.session).not.toBe(oldSession);
    expect(getWarmSet(fixture)).not.toBe(oldWarm);
    expect(current.workspace?.warmSet?.maintenanceState).toBe('running');
    expect(oldWarm.getStatus()).toMatchObject({ maintenanceState: 'stopped', watchedProjectNames: [] });
    expect(oldGraph.abortController.signal.aborted).toBe(true);
  });
});
