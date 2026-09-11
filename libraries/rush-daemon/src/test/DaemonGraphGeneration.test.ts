// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IOperationGraph } from '@microsoft/rush-lib';
import type { IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';

import { DaemonGraphTestFixture, responseSnapshot } from './DaemonGraphTestFixture';
import { assertSuccessfulNativeBuild } from './NativeBuildTestResult';

// These cases start real hosts and run Git/build subprocesses rather than mocked unit work.
jest.setTimeout(15_000);

// Allow the host's 5s close/drain limit plus joins and fixture removal, without extending test budgets.
const GRAPH_FIXTURE_CLEANUP_TIMEOUT_MS: number = 10_000;

describe('graph-generation fencing over the native daemon wire', () => {
  let fixturePromise: Promise<DaemonGraphTestFixture>;
  let pendingWork: Promise<void> | undefined;
  beforeEach(async () => {
    pendingWork = undefined;
    fixturePromise = DaemonGraphTestFixture.createAsync();
    await fixturePromise;
  });
  afterEach(async () => {
    const work: Promise<void> | undefined = pendingWork;
    const [created] = await Promise.allSettled([fixturePromise]);
    try {
      if (created.status === 'fulfilled') await created.value.host.closeAsync();
    } finally {
      // Jest reports the test/setup failure; join its entire continuation before another fixture can start.
      await Promise.allSettled([work]);
      if (created.status === 'fulfilled') await created.value[Symbol.asyncDispose]();
    }
  }, GRAPH_FIXTURE_CLEANUP_TIMEOUT_MS);

  function runWithFixtureAsync(work: (fixture: DaemonGraphTestFixture) => Promise<void>): Promise<void> {
    pendingWork = fixturePromise.then(work);
    return pendingWork;
  }

  it('keeps a stable token for unchanged sessions, including cold snapshots', () =>
    runWithFixtureAsync(async (fixture) => {
      const cold = responseSnapshot(await fixture.graphAsync('status'));
      expect(cold.workspaceGeneration).toEqual(expect.any(String));
      expect(responseSnapshot(await fixture.graphAsync('show')).workspaceGeneration).toBe(
        cold.workspaceGeneration
      );
      await fixture.buildSuccessfullyAsync();
      const initialized = responseSnapshot(await fixture.graphAsync('show'));
      expect(initialized.workspaceGeneration).not.toBe(cold.workspaceGeneration);
      await fixture.buildSuccessfullyAsync();
      expect(responseSnapshot(await fixture.graphAsync('status')).workspaceGeneration).toBe(
        initialized.workspaceGeneration
      );
    }));

  it.each([undefined, 'another-session-token'])(
    'rejects missing or stale token %s before mutation',
    (token) =>
      runWithFixtureAsync(async (fixture) => {
        await fixture.buildSuccessfullyAsync();
        const before = responseSnapshot(await fixture.graphAsync('status'));
        const result = await fixture.runAsync(['daemon', 'graph', 'scope-out', '--project', 'a'], {
          expectedWorkspaceGeneration: token
        });
        expect(result.terminal).toMatchObject({
          kind: 'requestRejected',
          payload: { code: 'invalidRequest' }
        });
        expect(responseSnapshot(await fixture.graphAsync('status'))).toEqual(before);
        expect(fixture.runs()).toEqual(['a', 'b']);
      })
  );

  describe('after an initial native build', () => {
    let previousGeneration: string | undefined;
    let previousGraph: IOperationGraph | undefined;
    let previousPid: number;
    let stale: IDaemonRequestEnvelope;
    beforeEach(() =>
      runWithFixtureAsync(async (fixture) => {
        // Real Git/build subprocess preparation can exceed the unit-test budget on shared Windows runners.
        await fixture.buildSuccessfullyAsync();
        previousGeneration = responseSnapshot(await fixture.graphAsync('show')).workspaceGeneration;
        previousGraph = fixture.session.operationGraph;
        previousPid = process.pid;
        stale = fixture.envelope(['daemon', 'graph', 'scope-out', '--project', 'a']);
      })
    );

    it('rejects an old reference after same-process soft reload without applying it to the replacement graph', () =>
      runWithFixtureAsync(async (fixture) => {
        assertSuccessfulNativeBuild(
          await fixture.runAsync(['rebuild', '--to', 'b', '--parallelism', '3']),
          fixture.session.operationGraph
        );
        const current = responseSnapshot(await fixture.graphAsync('status'));
        expect(process.pid).toBe(previousPid);
        expect(fixture.session.operationGraph).not.toBe(previousGraph);
        expect(current.workspaceGeneration).not.toBe(previousGeneration);
        expect((await fixture.runAsync([...stale.argv], stale)).terminal).toMatchObject({
          kind: 'requestRejected',
          payload: { code: 'invalidRequest' }
        });
        expect(responseSnapshot(await fixture.graphAsync('status'))).toEqual(current);
        expect(responseSnapshot(await fixture.graphAsync('scope-out', '--project', 'a'))).toMatchObject({
          workspaceGeneration: current.workspaceGeneration,
          operations: [{ enabled: false }, { enabled: false }, { enabled: false }]
        });
      }));
  });

  it('does not reuse tokens after host replacement', () =>
    runWithFixtureAsync(async (fixture) => {
      const old = responseSnapshot(await fixture.graphAsync('status'));
      await fixture.restartAsync();
      expect(responseSnapshot(await fixture.graphAsync('status')).workspaceGeneration).not.toBe(
        old.workspaceGeneration
      );
    }));
});
