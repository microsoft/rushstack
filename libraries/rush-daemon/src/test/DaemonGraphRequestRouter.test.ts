// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { setTimeout as delayAsync } from 'node:timers/promises';

import { OperationStatus, type IOperationGraph } from '@microsoft/rush-lib';
import { LockFile } from '@rushstack/node-core-library';
import type {
  IDaemonEventEnvelope,
  IDaemonInitializedGraphSnapshot,
  IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';

import { DaemonGraphChanges, getDaemonGraphObserver } from '../DaemonGraphObserver';
import { RequestExclusivityClass } from '../RequestScheduler';
import { getWorkspaceRequestScheduler } from '../WorkspaceRequestAdmission';
import { DaemonWireRequestClient } from '../DaemonWireRequestClient';
import { DaemonGraphTestFixture, graphSnapshot, responseSnapshot } from './DaemonGraphTestFixture';
import { createDeferred, type DaemonRequestWireClient } from './DaemonRequestWireTestUtilities';

describe('experimental native graph over daemon transport', () => {
  let fixture: DaemonGraphTestFixture;
  let initialization: Promise<void>;
  let setupAbortController: AbortController;
  beforeEach(() => {
    setupAbortController = new AbortController();
    initialization = DaemonGraphTestFixture.createAsync(undefined, true, setupAbortController.signal).then(
      (created) => {
        fixture = created;
      }
    );
    return initialization;
  });
  afterEach(async () => {
    // A Jest hook timeout does not cancel initialization or its assignment continuation.
    setupAbortController.abort();
    const [result] = await Promise.allSettled([initialization]);
    if (result.status === 'rejected') {
      if (result.reason !== setupAbortController.signal.reason) throw result.reason;
      return;
    }
    await fixture[Symbol.asyncDispose]();
  });

  async function snapshotAsync(...argv: string[]): Promise<IDaemonInitializedGraphSnapshot> {
    const snapshot = responseSnapshot(await fixture.graphAsync(...argv));
    if (!snapshot.initialized) throw new Error('Expected an initialized graph.');
    return snapshot;
  }

  async function watchAsync(): Promise<{ client: DaemonRequestWireClient; request: IDaemonRequestEnvelope }> {
    const client: DaemonRequestWireClient = await fixture.connectAsync();
    const request: IDaemonRequestEnvelope = fixture.envelope(['daemon', 'graph', 'watch']);
    await client.sendControlAsync({ kind: 'requestStart', payload: request });
    expect(graphSnapshot(await client.readFrameAsync()).initialized).toBe(true);
    return { client, request };
  }

  it('reports cold state without creating a graph or running scripts', async () => {
    for (const verb of ['show', 'status']) {
      expect(responseSnapshot(await fixture.graphAsync(verb))).toMatchObject({ initialized: false });
      expect(responseSnapshot(await fixture.graphAsync(verb))).not.toHaveProperty('operations');
    }
    for (const argv of [
      ['watch'],
      ['pause'],
      ['resume'],
      ['scope-in', '--project', 'a'],
      ['invalidate', '--project', 'a']
    ]) {
      expect((await fixture.graphAsync(...argv)).terminal).toMatchObject({
        kind: 'requestRejected',
        payload: { code: 'routingFailed', message: expect.stringContaining('uninitialized') }
      });
    }
    expect(fixture.session.operationGraph).toBeUndefined();
    expect(fixture.runs()).toEqual([]);
  });

  it('rejects a disabled gate and malformed reserved requests before the production resolver', async () => {
    const invalidRequests: Partial<IDaemonRequestEnvelope>[] = [
      { environment: {} },
      { environment: { RUSH_DAEMON_EXPERIMENTAL: '0' } },
      { commandOrigin: 'custom' as const },
      { commandName: 'build' },
      { terminal: { isTTY: false, supportsColor: false, acceptsStdin: true } }
    ];
    for (const overrides of invalidRequests) {
      expect((await fixture.runAsync(['daemon', 'graph', 'show'], overrides)).terminal.kind).toBe(
        'requestRejected'
      );
    }
    expect(fixture.session.operationGraph).toBeUndefined();
    expect(fixture.runs()).toEqual([]);
  });

  describe('with a real initialized graph', () => {
    beforeEach(async () => {
      await fixture.buildSuccessfullyAsync();
    });

    it('maps exact selectors to native dependency-safe enablement and validates all selectors first', async () => {
      const initial = await snapshotAsync('show');
      expect(initial.operations).toEqual([
        {
          operationId: 'a (compile)',
          projectName: 'a',
          phaseName: '_phase:compile',
          enabled: true,
          status: 'SUCCESS',
          dependencyIds: []
        },
        {
          operationId: 'b (compile)',
          projectName: 'b',
          phaseName: '_phase:compile',
          enabled: true,
          status: 'SUCCESS',
          dependencyIds: ['a (compile)']
        },
        {
          operationId: 'c (compile)',
          projectName: 'c',
          phaseName: '_phase:compile',
          enabled: false,
          status: 'SKIPPED',
          dependencyIds: []
        }
      ]);
      const privateRequest = await fixture.runAsync(['daemon', 'graph', 'show'], {
        environment: { RUSH_DAEMON_EXPERIMENTAL: '1', GRAPH_SECRET: 'never-serialize-this-secret' }
      });
      expect(JSON.stringify(responseSnapshot(privateRequest))).not.toContain('never-serialize-this-secret');
      const out = await snapshotAsync('scope-out', '--project', 'a');
      expect(out.operations.map((op) => op.enabled)).toEqual([false, false, false]);
      const inside = await snapshotAsync('scope-in', '--operation', 'b (compile)');
      expect(inside.operations.map((op) => op.enabled)).toEqual([true, true, false]);
      for (const argv of [
        ['scope-out', '--project', 'a', '--project', 'missing'],
        ['invalidate', '--operation', 'a (compile)', '--operation', 'missing'],
        ['scope-in', '--project', 'a', '--bad', 'b'],
        ['scope-in'],
        ['show', '--project', 'a'],
        ['unknown'],
        ['scope-out', '--operation']
      ]) {
        expect((await fixture.graphAsync(...argv)).terminal).toMatchObject({
          kind: 'requestRejected',
          payload: { code: 'invalidRequest' }
        });
        expect((await snapshotAsync('status')).operations).toEqual(inside.operations);
      }
      const bOut = await snapshotAsync('scope-out', '--operation', 'b (compile)');
      expect(bOut.operations.map((op) => op.enabled)).toEqual([false, false, false]);
      expect(fixture.runs()).toEqual(['a', 'b']);
    });

    it('invalidates without executing and preserves manual mode across an explicit native build', async () => {
      expect((await snapshotAsync('pause')).pauseNextIteration).toBe(true);
      const invalidated = await snapshotAsync('invalidate', '--project', 'a');
      expect(invalidated.operations[0].status).toBe('READY');
      expect(invalidated.hasScheduledIteration).toBe(false);
      expect(fixture.runs()).toEqual(['a', 'b']);
      fixture.write('a/input.txt', 'two');
      await fixture.buildSuccessfullyAsync();
      expect((await snapshotAsync('status')).pauseNextIteration).toBe(true);
      expect(fixture.runs()).toEqual(['a', 'b', 'a', 'b']);
      expect((await snapshotAsync('resume')).pauseNextIteration).toBe(false);
      expect(fixture.runs()).toEqual(['a', 'b', 'a', 'b']);
    });

    it('observes real builds, invalidations and idle without a lease, and cleans cancel/disconnect subscribers', async () => {
      const graph: IOperationGraph = fixture.session.operationGraph!;
      const observer = getDaemonGraphObserver(graph);
      const taps: number = graph.hooks.onGraphStateChanged.taps.length;
      const { client, request } = await watchAsync();
      try {
        expect(observer.subscriberCount).toBe(1);
        fixture.session.invalidations.invalidate('a/input.txt');
        let snapshot = graphSnapshot(await client.readFrameAsync());
        expect(snapshot.invalidations.changedPathCount).toBeGreaterThan(0);
        fixture.write('a/input.txt', 'two');
        const build = fixture.buildSuccessfullyAsync();
        let sawExecuting: boolean = false;
        while (!sawExecuting) {
          snapshot = graphSnapshot(await client.readFrameAsync());
          sawExecuting = snapshot.initialized && snapshot.operations.some((op) => op.status === 'EXECUTING');
        }
        expect((await build).terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
        do {
          snapshot = graphSnapshot(await client.readFrameAsync());
        } while (!snapshot.initialized || snapshot.status !== 'SUCCESS');
        expect(snapshot.operations[0].status).toBe('SUCCESS');
        await client.sendControlAsync({ kind: 'requestCancel', payload: { requestId: request.requestId } });
        expect((await client.readTerminalAsync(request.requestId)).terminal).toMatchObject({
          kind: 'requestResult',
          payload: { outcome: 'aborted', aborted: true, exitCode: 130 }
        });
        expect(observer.subscriberCount).toBe(0);
      } finally {
        await client.closeAsync();
      }
      for (let i: number = 0; i < 3; i++) {
        const next = await watchAsync();
        await next.client.closeAsync();
        // Admission on another connection is a transport barrier after the disconnect.
        await fixture.graphAsync('pause');
        expect(observer.subscriberCount).toBe(0);
        expect(graph.hooks.onGraphStateChanged.taps).toHaveLength(taps);
      }
      await fixture.buildSuccessfullyAsync();
    });

    it('coalesces updates to one pending notification and removes resources immediately on cancellation', async () => {
      const graph: IOperationGraph = fixture.session.operationGraph!;
      const abort: AbortController = new AbortController();
      const changes = new DaemonGraphChanges(fixture.session, graph, abort.signal);
      expect(await changes.nextAsync()).toBe(true);
      for (let i: number = 0; i < 10000; i++) fixture.session.invalidations.invalidate();
      expect(await changes.nextAsync()).toBe(true);
      let delivered: boolean = false;
      const waiting = changes.nextAsync().then((value) => {
        delivered = true;
        return value;
      });
      await Promise.resolve();
      expect(delivered).toBe(false);
      abort.abort();
      expect(getDaemonGraphObserver(graph).subscriberCount).toBe(0);
      expect(await waiting).toBe(false);
      changes[Symbol.dispose]();
    });

    it('bounds a backpressured wire watch and cancels it without blocking another client', async () => {
      const graph: IOperationGraph = fixture.session.operationGraph!;
      const observer = getDaemonGraphObserver(graph);
      const { client, request } = await watchAsync();
      const blocked = createDeferred<void>();
      const release = createDeferred<void>();
      const original = DaemonWireRequestClient.prototype.writeEventAsync;
      let blockedWrites: number = 0;
      const writer = jest
        .spyOn(DaemonWireRequestClient.prototype, 'writeEventAsync')
        .mockImplementation(async function (
          this: DaemonWireRequestClient,
          event: IDaemonEventEnvelope
        ): Promise<void> {
          const payload = event.payload as { data?: { requestId?: string } };
          if (payload.data?.requestId === request.requestId) {
            blockedWrites++;
            blocked.resolve();
            await release.promise;
          }
          await original.call(this, event);
        });
      try {
        fixture.session.invalidations.invalidate('a/input.txt');
        await blocked.promise;
        for (let i: number = 0; i < 10000; i++) fixture.session.invalidations.invalidate('a/input.txt');
        expect(blockedWrites).toBe(1);
        expect(observer.subscriberCount).toBe(1);
        expect(responseSnapshot(await fixture.graphAsync('pause'))).toMatchObject({
          pauseNextIteration: true
        });
        await client.sendControlAsync({ kind: 'requestCancel', payload: { requestId: request.requestId } });
        for (let i: number = 0; i < 100 && observer.subscriberCount !== 0; i++) await delayAsync(5);
        expect(observer.subscriberCount).toBe(0);
        expect(blockedWrites).toBe(1);
        release.resolve();
        expect((await client.readTerminalAsync(request.requestId)).terminal).toMatchObject({
          kind: 'requestResult',
          payload: { outcome: 'aborted', exitCode: 130 }
        });
      } finally {
        release.resolve();
        writer.mockRestore();
        await client.closeAsync();
      }
    });

    it('queues mutations behind an active build and reports no-wait admission failure', async () => {
      const { client, request } = await watchAsync();
      try {
        fixture.write('a/input.txt', 'two');
        const build = fixture.buildSuccessfullyAsync();
        for (;;) {
          const snapshot = graphSnapshot(await client.readFrameAsync());
          if (snapshot.initialized && snapshot.status === OperationStatus.Executing) break;
        }
        const rejected = await fixture.runAsync(['daemon', 'graph', 'scope-out', '--project', 'a'], {
          admission: { noWait: true }
        });
        expect(rejected.terminal).toMatchObject({
          kind: 'requestResult',
          payload: { outcome: 'failure', admissionErrorCode: 'no-wait' }
        });
        const mutation = fixture.graphAsync('scope-out', '--project', 'a');
        await build;
        expect(responseSnapshot(await mutation)).toMatchObject({
          operations: [{ enabled: false }, { enabled: false }, { enabled: false }]
        });
        await client.sendControlAsync({ kind: 'requestCancel', payload: { requestId: request.requestId } });
        await client.readTerminalAsync(request.requestId);
      } finally {
        await client.closeAsync();
      }
    });

    it('resumes a prepared automatic iteration under admission until native idle', async () => {
      await fixture.graphAsync('pause');
      const graph: IOperationGraph = fixture.session.operationGraph!;
      const scheduler = getWorkspaceRequestScheduler(fixture.session);
      const lease = await scheduler.acquireAsync({ exclusivityClass: RequestExclusivityClass.Exclusive });
      const preparingLease: AsyncDisposable | undefined =
        await fixture.session.acquireExecutionLeaseAsync?.();
      try {
        fixture.write('a/input.txt', 'two');
        await fixture.session.reconcileInvalidationsAsync();
        graph.invalidateOperations();
        expect(await graph.scheduleIterationAsync({ inputsSnapshot: fixture.session.inputsSnapshot })).toBe(
          true
        );
      } finally {
        await preparingLease?.[Symbol.asyncDispose]();
        lease.release();
      }
      expect((await snapshotAsync('status')).hasScheduledIteration).toBe(true);
      expect(fixture.runs()).toEqual(['a', 'b']);
      fixture.write('a/input.txt', 'three');
      const started = createDeferred<void>();
      const release = createDeferred<void>();
      graph.hooks.beforeExecuteIterationAsync.tapPromise('hold-resume-lease', async () => {
        started.resolve();
        await release.promise;
      });
      const { client, request } = await watchAsync();
      try {
        const resumed = fixture.graphAsync('resume');
        await started.promise;
        for (;;) {
          const snapshot = graphSnapshot(await client.readFrameAsync());
          if (snapshot.initialized && snapshot.status === OperationStatus.Executing) break;
        }
        await expect(
          scheduler.acquireAsync({
            exclusivityClass: RequestExclusivityClass.SharedBuild,
            noWait: true
          })
        ).rejects.toMatchObject({ code: 'NO_WAIT' });
        const nativeProbe: LockFile | undefined = LockFile.tryAcquire(
          fixture.session.rushConfiguration.commonTempFolder,
          'rush'
        );
        try {
          expect(nativeProbe).toBeUndefined();
        } finally {
          nativeProbe?.release();
        }
        release.resolve();
        expect(responseSnapshot(await resumed)).toMatchObject({
          pauseNextIteration: false,
          hasScheduledIteration: false,
          status: 'SUCCESS'
        });
        expect(fixture.runs()).toEqual(['a', 'b', 'a', 'b']);
        expect(scheduler.activeRequestCount).toBe(0);
        await fixture.buildSuccessfullyAsync();
        expect(fixture.runs()).toEqual(['a', 'b', 'a', 'b']);
        await client.sendControlAsync({ kind: 'requestCancel', payload: { requestId: request.requestId } });
        await client.readTerminalAsync(request.requestId);
      } finally {
        release.resolve();
        await client.closeAsync();
      }
    });
  });
});
