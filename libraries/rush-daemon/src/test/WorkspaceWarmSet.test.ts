// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { OperationStatus, type IOperationExecutionResult } from '@microsoft/rush-lib';

import { RequestExclusivityClass } from '../RequestScheduler';
import { getWorkspaceRequestScheduler } from '../WorkspaceRequestAdmission';
import { WorkspaceWarmSet } from '../WorkspaceWarmSet';
import { createDeferred } from './DaemonRequestWireTestUtilities';
import { createNativeScriptGateAsync, runNativeCommandAsync } from './NativeEngineTestCommands';
import { WarmSetTestFixture, type IWarmFixtureOptions } from './WarmSetTestFixture';

jest.setTimeout(30_000);

describe('warm policies attached to native graphs and real filesystem watchers', () => {
  let test: WarmSetTestFixture | undefined;
  afterEach(async () => {
    const closing: WarmSetTestFixture | undefined = test;
    test = undefined;
    await closing?.[Symbol.asyncDispose]();
  });

  async function startAsync(options: IWarmFixtureOptions = {}): Promise<WarmSetTestFixture> {
    test = await WarmSetTestFixture.createAsync(options);
    expect((await test.fixture.buildAsync()).terminal).toMatchObject({ payload: { exitCode: 0 } });
    await test.warm.maintainAsync();
    return test;
  }

  it('drops unrequested project observation, expires idle resources automatically and restores them on demand', async () => {
    const { fixture, watcher, warm, graph } = await startAsync({ ipc: true });
    expect(fixture.runs()).toEqual(['a', 'b']);
    expect([...watcher.watchedProjectNames].sort()).toEqual(['a', 'b']);
    expect(test!.operation('a').runner?.isActive).toBe(true);
    expect(() => graph.deleteResults!([test!.operation('a')])).toThrow('active runner');
    expect(warm.getStatus().measuredRunnerMemoryBytes).toBeGreaterThan(0);
    expect(warm.getStatus().unmeasuredRunnerCount).toBe(0);
    test!.update({ warmIdleTimeoutSeconds: 0.06 });
    await eventuallyAsync(() => expect(graph.resultByOperation.size).toBe(0));
    expect(watcher.watchedProjectNames.size).toBe(0);
    expect(test!.operation('a').runner?.isActive).toBe(false);
    expect(test!.operation('b').runner?.isActive).toBe(false);
    expect(fs.existsSync(path.join(fixture.folder, 'common/temp/closed-a'))).toBe(true);
    expect(warm.getStatus().measuredRunnerMemoryBytes).toBe(0);
    expect(fixture.runs()).toEqual(['a', 'b']);

    test!.update({ warmIdleTimeoutSeconds: 300 });
    fixture.write('a/input.txt', 'changed-while-cold');
    expect((await fixture.buildAsync()).terminal).toMatchObject({ payload: { exitCode: 0 } });
    expect([...watcher.watchedProjectNames].sort()).toEqual(['a', 'b']);
    expect(fs.readFileSync(path.join(fixture.folder, 'a/lib/output.txt'), 'utf8')).toBe('changed-while-cold');
    expect(test!.operation('a').runner?.isActive).toBe(true);
    const before: number = fixture.session.invalidations.getSnapshot().sequence;
    fixture.write('a/input.txt', 'observed-after-rewarming');
    await eventuallyAsync(() =>
      expect(fixture.session.invalidations.getSnapshot().sequence).toBeGreaterThan(before)
    );
    expect(fixture.runs()).not.toContain('c');
  });

  it('enforces max-project LRU, including unchanged requests, without changing selections or survivor hashes', async () => {
    const { fixture, warm, graph, watcher } = await startAsync();
    const b = test!.operation('b');
    const record: IOperationExecutionResult = graph.resultByOperation.get(b)!;
    const hash: string = record.getStateHash();
    expect((await fixture.runAsync(['build', '--only', 'b', '--parallelism', '3'])).terminal).toMatchObject({
      payload: { exitCode: 0 }
    });
    const runs: string[] = fixture.runs();
    test!.update({ warmSetMaxProjects: 1 });
    expect((await warm.maintainAsync()).retainedProjectNames).toEqual(['b']);
    expect([...watcher.watchedProjectNames]).toEqual(['b']);
    expect(graph.resultByOperation.get(b)).toBe(record);
    expect(record.getStateHash()).toBe(hash);
    expect(record.status).toBe(OperationStatus.Success);
    expect(test!.operation('a').enabled).toBe(false);
    expect(b.enabled).toBe(true);
    expect(fixture.runs()).toEqual(runs);
    expect((await fixture.runAsync(['build', '--only', 'b', '--parallelism', '3'])).terminal).toMatchObject({
      payload: { exitCode: 0 }
    });
    expect(fixture.runs()).toEqual(runs);
  });

  it('lets autoWarmByTelemetry change actual retention using real cold/reused durations and IPC RSS', async () => {
    const { fixture, warm, graph } = await startAsync({ ipc: true });
    fixture.write('a/input.txt', 'two');
    fixture.write('b/input.txt', 'two');
    expect((await fixture.buildAsync()).terminal).toMatchObject({ payload: { exitCode: 0 } });
    await fixture.runAsync(['build', '--only', 'b', '--parallelism', '3']);
    test!.update({ autoWarmByTelemetry: true });
    expect(warm.getStatus().retainedProjectNames).toEqual(['a', 'b']);
    test!.update({ autoWarmByTelemetry: false });
    expect(warm.getStatus().retainedProjectNames).toEqual(['b', 'a']);
    test!.update({ autoWarmByTelemetry: true, warmSetMaxProjects: 1 });
    await warm.maintainAsync();
    expect(warm.getStatus().retainedProjectNames).toEqual(['a']);
    expect(graph.resultByOperation.has(test!.operation('b'))).toBe(false);
    expect(test!.operation('b').runner?.isActive).toBe(false);

    // Requested rewarming, not a speculative script launch, then pure LRU keeps the most recent request.
    test!.update({ autoWarmByTelemetry: false, warmSetMaxProjects: 2 });
    await fixture.runAsync(['build', '--only', 'b', '--parallelism', '3']);
    test!.update({ autoWarmByTelemetry: false, warmSetMaxProjects: 1 });
    await warm.maintainAsync();
    expect(warm.getStatus().retainedProjectNames).toEqual(['b']);
    expect(test!.operation('a').runner?.isActive).toBe(false);
    expect(fixture.runs()).not.toContain('c');
  });

  it('reports a deferred project cap in status without warning before idle cleanup can run', async () => {
    const { fixture, warm, diagnostics } = await startAsync();
    const lease = await getWorkspaceRequestScheduler(fixture.session).acquireAsync({
      exclusivityClass: RequestExclusivityClass.Exclusive
    });
    try {
      test!.update({ warmSetMaxProjects: 1 });
      expect(await warm.maintainAsync()).toMatchObject({
        deferredReason: 'workspace-busy', overProjectLimit: true, overMemoryBudget: false
      });
      expect(diagnostics).toEqual([]);
    } finally {
      lease.release();
    }
    expect((await warm.maintainAsync()).retainedProjectNames).toHaveLength(1);
    expect(diagnostics).toEqual([]);
  });

  it('evicts under measured memory pressure and reports a budget below remaining daemon RSS honestly', async () => {
    const { warm, fixture, graph } = await startAsync({ ipc: true });
    const initial = warm.getStatus();
    expect(initial.overMemoryBudget).toBe(false);
    expect(initial.measuredRunnerMemoryBytes).toBeGreaterThan(0);
    test!.update({
      warmMemoryBudgetMB:
        (initial.daemonResidentMemoryBytes + initial.measuredRunnerMemoryBytes * 0.75) / (1024 * 1024)
    });
    const underPressure = await warm.maintainAsync();
    expect(underPressure.retainedProjectNames.length).toBeLessThan(2);
    expect(underPressure.measuredRunnerMemoryBytes).toBeLessThan(initial.measuredRunnerMemoryBytes);
    test!.update({ warmMemoryBudgetMB: 0.01 });
    const belowBase = await warm.maintainAsync();
    expect(belowBase.retainedProjectNames).toEqual([]);
    expect(belowBase.overMemoryBudget).toBe(true);
    expect(belowBase.daemonResidentMemoryBytes).toBeGreaterThan(0.01 * 1024 * 1024);
    expect(belowBase.measuredRunnerMemoryBytes).toBe(0);
    expect(graph.resultByOperation.size).toBe(0);
    expect(test!.diagnostics.some((error) => error.message.includes('remaining daemon memory'))).toBe(true);
    expect(fixture.runs()).toEqual(['a', 'b']);
  });

  it('reports missing child measurements and uses conservative LRU instead of inventing memory scores', async () => {
    const { fixture, warm } = await startAsync({ ipc: true });
    const missing = ['a', 'b'].map((name) => test!.operation(name).runner!);
    for (const runner of missing) {
      Object.defineProperty(runner, 'residentMemoryBytes', { configurable: true, get: () => undefined });
    }
    try {
      fixture.write('a/input.txt', 'two');
      await fixture.buildAsync();
      await fixture.runAsync(['build', '--only', 'b', '--parallelism', '3']);
      test!.update({ autoWarmByTelemetry: true });
      expect(warm.getStatus().unmeasuredRunnerCount).toBe(2);
      expect(warm.getStatus().retainedProjectNames).toEqual(['b', 'a']);
      test!.update({ autoWarmByTelemetry: true, warmSetMaxProjects: 1 });
      expect((await warm.maintainAsync()).retainedProjectNames).toEqual(['b']);
      expect(warm.getStatus().unmeasuredRunnerCount).toBe(1);
    } finally {
      for (const runner of missing) Reflect.deleteProperty(runner, 'residentMemoryBytes');
    }
  });

  it('defers maintenance during a real native build and keeps protected resources despite impossible limits', async () => {
    const { fixture, warm, graph } = await startAsync({ ipc: true });
    const before: IOperationExecutionResult = graph.resultByOperation.get(test!.operation('a'))!;
    const gate = await createNativeScriptGateAsync(fixture.folder, 'a');
    fixture.write('a/input.txt', 'gated');
    const build = fixture.buildAsync();
    try {
      await gate.entered;
      test!.update({ warmMemoryBudgetMB: 0.01, warmIdleTimeoutSeconds: 0.01, warmSetMaxProjects: 1 });
      const status = await warm.maintainAsync();
      expect(status.deferredReason).toBe('workspace-busy');
      expect(status.overMemoryBudget).toBe(true);
      expect(test!.operation('a').runner?.isActive).toBe(true);
      expect(graph.resultByOperation.get(test!.operation('a'))).toBe(before);
      expect(() => graph.deleteResults!([test!.operation('a')])).toThrow('executing or prepared');
    } finally {
      await gate.releaseAsync();
    }
    expect((await build).terminal).toMatchObject({ payload: { exitCode: 0 } });
    test!.protectedOperations.add(test!.operation('a'));
    test!.protectedOperations.add(test!.operation('b'));
    const protectedStatus = await warm.maintainAsync();
    expect([...protectedStatus.protectedProjectNames].sort()).toEqual(['a', 'b']);
    expect(protectedStatus.overMemoryBudget).toBe(true);
    expect(protectedStatus.overProjectLimit).toBe(true);
    expect(graph.resultByOperation.size).toBe(2);
  });

  it('takes the real repository execution lease and leaves records/watchers intact during native CLI contention', async () => {
    const { fixture, warm, graph, watcher } = await startAsync();
    const gate = await createNativeScriptGateAsync(fixture.folder, 'c');
    const native = runNativeCommandAsync(fixture.folder, ['build', '--only', 'c', '--parallelism', '3']);
    try {
      await gate.entered;
      test!.update({ warmMemoryBudgetMB: 0.01 });
      const status = await warm.maintainAsync();
      expect(status.deferredReason).toBe('native-busy');
      expect(graph.resultByOperation.size).toBe(2);
      expect([...watcher.watchedProjectNames].sort()).toEqual(['a', 'b']);
    } finally {
      await gate.releaseAsync();
    }
    expect((await native).exitCode).toBe(0);
    await warm.maintainAsync();
    expect(graph.resultByOperation.size).toBe(0);
  });

  it('does not touch paused prepared records or native ownership until a plan has been discarded', async () => {
    const { fixture, warm, graph } = await startAsync();
    const admission = await getWorkspaceRequestScheduler(fixture.session).acquireAsync({
      exclusivityClass: RequestExclusivityClass.Exclusive
    });
    const native = await fixture.session.acquireExecutionLeaseAsync();
    try {
      graph.pauseNextIteration = true;
      graph.invalidateOperations();
      await graph.scheduleIterationAsync({ inputsSnapshot: fixture.session.inputsSnapshot });
    } finally {
      await native?.[Symbol.asyncDispose]();
      admission.release();
    }
    test!.update({ warmMemoryBudgetMB: 0.01 });
    const acquire = jest.spyOn(fixture.session, 'acquireExecutionLeaseAsync');
    try {
      expect((await warm.maintainAsync()).deferredReason).toBe('graph-busy');
      expect(acquire).not.toHaveBeenCalled();
      expect(graph.resultByOperation.size).toBe(2);
      expect(() => graph.deleteResults!([test!.operation('a')])).toThrow('prepared');
      expect(graph.hasScheduledIteration).toBe(true);
      graph.discardScheduledIteration();
      await warm.maintainAsync();
      expect(graph.resultByOperation.size).toBe(0);
      expect(fixture.runs()).toEqual(['a', 'b']);
    } finally {
      acquire.mockRestore();
    }
  });

  it('awaits real runner closure and watcher teardown while excluding graph mutation and new builds', async () => {
    const { fixture, warm, graph, watcher } = await startAsync({ ipc: true });
    fixture.write('common/temp/close-delay-b', 'yes');
    const closing = createDeferred<void>();
    const release = createDeferred<void>();
    const close = graph.closeRunnersAsync.bind(graph);
    const closeSpy = jest.spyOn(graph, 'closeRunnersAsync').mockImplementation(async (operations) => {
      closing.resolve();
      await release.promise;
      await close(operations);
    });
    test!.update({ warmMemoryBudgetMB: 0.01 });
    const maintenance = warm.maintainAsync();
    try {
      await closing.promise;
      expect(graph.resultByOperation.size).toBe(2);
      expect(watcher.watchedProjectNames.size).toBe(2);
      expect(
        (await fixture.runAsync(['daemon', 'graph', 'pause'], { admission: { noWait: true } })).terminal
      ).toMatchObject({ payload: { admissionErrorCode: 'no-wait' } });
      expect(
        (
          await fixture.runAsync(['build', '--to', 'b', '--parallelism', '3'], {
            admission: { noWait: true }
          })
        ).terminal
      ).toMatchObject({ payload: { admissionErrorCode: 'no-wait' } });
    } finally {
      release.resolve();
      await maintenance;
      closeSpy.mockRestore();
    }
    expect(fs.existsSync(path.join(fixture.folder, 'common/temp/closed-b'))).toBe(true);
    expect(graph.resultByOperation.size).toBe(0);
    expect(watcher.watchedProjectNames.size).toBe(0);
  });

  it.each(['runner', 'watcher'] as const)(
    'diagnoses %s cleanup failure without false record deletion or build failure',
    async (kind) => {
      const { fixture, warm, graph, watcher } = await startAsync({ ipc: true });
      const operation = test!.operation('a');
      test!.protectedOperations.add(test!.operation('b'));
      const record: IOperationExecutionResult = graph.resultByOperation.get(operation)!;
      const close =
        kind === 'runner'
          ? jest.spyOn(operation.runner!, 'closeAsync').mockRejectedValue(new Error('runner-close-failed'))
          : jest.spyOn(watcher, 'unwatchProjectsAsync').mockRejectedValue(new Error('watcher-close-failed'));
      try {
        test!.update({ warmMemoryBudgetMB: 0.01 });
        const status = await warm.maintainAsync();
        expect(status.cleanupFailures).toHaveLength(1);
        expect(graph.resultByOperation.get(operation)).toBe(record);
        expect(record.status).toBe(OperationStatus.Success);
        expect(watcher.watchedProjectNames.has('a')).toBe(true);
        expect(operation.runner?.isActive).toBe(kind === 'runner');
        expect(test!.diagnostics.some((error) => error.message.includes('Could not evict'))).toBe(true);
        expect((await fixture.buildAsync()).terminal).toMatchObject({ payload: { exitCode: 0 } });
      } finally {
        close.mockRestore();
      }
      await warm.maintainAsync();
      expect(graph.resultByOperation.has(operation)).toBe(false);
      expect(warm.getStatus().cleanupFailures).toEqual([]);
    }
  );

  it('does not drop records when a resolved close still leaves a native child resident', async () => {
    const { warm, graph, watcher } = await startAsync({ ipc: true });
    const operation = test!.operation('a');
    test!.protectedOperations.add(test!.operation('b'));
    const retained: IOperationExecutionResult = graph.resultByOperation.get(operation)!;
    const close = jest.spyOn(operation.runner!, 'closeAsync').mockResolvedValue(undefined);
    try {
      test!.update({ warmMemoryBudgetMB: 0.01 });
      const status = await warm.maintainAsync();
      expect(status.cleanupFailures[0]).toContain('still reports active');
      expect(graph.resultByOperation.get(operation)).toBe(retained);
      expect(watcher.watchedProjectNames.has('a')).toBe(true);
      expect(status.measuredRunnerMemoryBytes).toBeGreaterThan(0);
    } finally {
      close.mockRestore();
    }
  });

  it('preserves real cache restoration, warning and failed-build semantics after eviction', async () => {
    const { fixture, warm, graph } = await startAsync({ cache: true });
    test!.update({ warmMemoryBudgetMB: 0.01 });
    await warm.maintainAsync();
    fs.rmSync(path.join(fixture.folder, 'a/lib'), { recursive: true });
    test!.update({});
    expect((await fixture.buildAsync()).terminal).toMatchObject({ payload: { exitCode: 0 } });
    expect(fixture.runs()).toEqual(['a', 'b']);
    expect(graph.resultByOperation.get(test!.operation('a'))?.status).toBe(OperationStatus.FromCache);
    expect(fs.readFileSync(path.join(fixture.folder, 'a/lib/output.txt'), 'utf8')).toBe('one');
    for (const input of ['warning', 'failure']) {
      test!.update({ warmMemoryBudgetMB: 0.01 });
      await warm.maintainAsync();
      test!.update({});
      fixture.write('a/input.txt', input);
      expect((await fixture.buildAsync()).terminal).toMatchObject({ payload: { exitCode: 1 } });
      expect(graph.resultByOperation.get(test!.operation('a'))?.status).toBe(
        input === 'warning' ? OperationStatus.SuccessWithWarning : OperationStatus.Failure
      );
    }
  });

  it('detaches surviving record/context links and cache scratch state without losing warning results', async () => {
    const { fixture, warm, graph } = await startAsync({ cache: true });
    fixture.write('b/input.txt', 'warning');
    expect((await fixture.buildAsync()).terminal).toMatchObject({ payload: { exitCode: 1 } });
    const operation = test!.operation('b');
    const record: IOperationExecutionResult = graph.resultByOperation.get(operation)!;
    const hash: string = record.getStateHash();
    const warnings: string = record.stdioSummarizer.getReport();
    const duration: number = record.stopwatch.duration;
    expect(record.getStateHashComponents().dependencies).toHaveLength(1);
    expect(Reflect.get(record, '_context')).toHaveProperty('records');
    expect(
      graph.hooks.beforeDeleteResults.taps.some((tap) => tap.name === 'CacheablePhasedOperationPlugin')
    ).toBe(true);
    test!.protectedOperations.add(operation);
    test!.update({ warmMemoryBudgetMB: 0.01 });
    await warm.maintainAsync();
    expect(graph.resultByOperation.get(operation)).toBe(record);
    expect(graph.resultByOperation.has(test!.operation('a'))).toBe(false);
    expect(Reflect.get(record, 'dependencies')).toEqual(new Set());
    expect(Reflect.get(record, '_context')).not.toHaveProperty('records');
    expect(Reflect.get(record, '_context').inputsSnapshot).toBeUndefined();
    expect(record.getStateHash()).toBe(hash);
    expect(record.stopwatch.duration).toBe(duration);
    expect(record.stdioSummarizer.getReport()).toBe(warnings);
    expect(warnings).toContain('warning-b');
    expect(record.status).toBe(OperationStatus.SuccessWithWarning);
    expect(operation.dependencies.has(test!.operation('a'))).toBe(true);
    test!.update({});
    fixture.write('a/input.txt', 'after-cache-state-release');
    expect((await fixture.buildAsync()).terminal).toMatchObject({ payload: { exitCode: 1 } });
    expect(fs.readFileSync(path.join(fixture.folder, 'a/lib/output.txt'), 'utf8')).toBe(
      'after-cache-state-release'
    );
  });

  it('surfaces a native plugin resource-release error without removing completed results', async () => {
    const { warm, graph, watcher } = await startAsync({ ipc: true });
    const operation = test!.operation('a');
    test!.protectedOperations.add(test!.operation('b'));
    const record: IOperationExecutionResult = graph.resultByOperation.get(operation)!;
    let fail: boolean = true;
    graph.hooks.beforeDeleteResults.tap('release-error-test', () => {
      if (fail) throw new Error('plugin-resource-release-failed');
    });
    test!.update({ warmMemoryBudgetMB: 0.01 });
    const status = await warm.maintainAsync();
    expect(status.cleanupFailures[0]).toContain('plugin-resource-release-failed');
    expect(graph.resultByOperation.get(operation)).toBe(record);
    expect(record.status).toBe(OperationStatus.Success);
    expect(operation.runner?.isActive).toBe(false);
    expect(watcher.watchedProjectNames.has('a')).toBe(false);
    fail = false;
    await warm.maintainAsync();
    expect(graph.resultByOperation.has(operation)).toBe(false);
  });

  it.each(['direct', 'rig', 'inherited'] as const)(
    'does not lose cold %s configuration changes: fails closed, then a fresh generation builds correctly',
    async (configurationKind) => {
      const { fixture, warm, graph } = await startAsync({ configurationKind });
      test!.update({ warmMemoryBudgetMB: 0.01 });
      await warm.maintainAsync();
      expect(graph.resultByOperation.size).toBe(0);
      const configPath: string =
        configurationKind === 'direct'
          ? 'a/config/rush-project.json'
          : configurationKind === 'rig'
            ? 'a/node_modules/fixture-rig/profiles/default/config/rush-project.json'
            : 'common/temp/inherited.json';
      fixture.write(
        configPath,
        JSON.stringify({
          operationSettings: [
            {
              operationName: '_phase:compile',
              outputFolderNames: ['lib'],
              disableBuildCacheForOperation: true
            }
          ]
        })
      );
      fixture.write('a/input.txt', 'new-configuration');
      const result = await fixture.buildAsync();
      expect(result.terminal).toMatchObject({
        kind: 'requestRejected',
        payload: { code: 'workspaceRecreationRequired' }
      });
      expect(fixture.runs()).toEqual(['a', 'b']);
      test!.update({});
      await test!.restartAsync();
      expect((await fixture.buildAsync()).terminal).toMatchObject({ payload: { exitCode: 0 } });
      expect(fs.readFileSync(path.join(fixture.folder, 'a/lib/output.txt'), 'utf8')).toBe(
        'new-configuration'
      );
    }
  );

  it('validates updates, rejects duplicate attachment and stops its timer without disposing generation resources', async () => {
    const { fixture, warm, graph, watcher } = await startAsync();
    expect(() => warm.updateConfiguration({ warmSetMaxProjects: 0 })).toThrow();
    expect(() =>
      WorkspaceWarmSet.attach({
        operationGraph: graph,
        watcher,
        configuration: {},
        scheduler: getWorkspaceRequestScheduler(fixture.session),
        acquireExecutionLeaseAsync: () => fixture.session.acquireExecutionLeaseAsync()
      })
    ).toThrow('already attached');
    await warm[Symbol.asyncDispose]();
    expect((await warm.maintainAsync()).deferredReason).toBe('disposed');
    expect(graph.resultByOperation.size).toBe(2);
    expect(watcher.watchedProjectNames.size).toBe(2);
    expect(() => warm.updateConfiguration({})).toThrow('disposed');
  });
});

async function eventuallyAsync(assert: () => void): Promise<void> {
  const deadline: number = performance.now() + 5000;
  for (;;) {
    try {
      assert();
      return;
    } catch (error) {
      if (performance.now() >= deadline) throw error;
      await delayAsync(10);
    }
  }
}
