// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IOperationGraph } from '@microsoft/rush-lib';
import type { IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';

import { DaemonGraphTestFixture, responseSnapshot } from './DaemonGraphTestFixture';

describe('graph-generation fencing over the native daemon wire', () => {
  let fixture: DaemonGraphTestFixture;
  beforeEach(async () => { fixture = await DaemonGraphTestFixture.createAsync(); });
  afterEach(async () => { await fixture[Symbol.asyncDispose](); });

  it('keeps a stable token for unchanged sessions, including cold snapshots', async () => {
    const cold = responseSnapshot(await fixture.graphAsync('status'));
    expect(cold.workspaceGeneration).toEqual(expect.any(String));
    expect(responseSnapshot(await fixture.graphAsync('show')).workspaceGeneration).toBe(cold.workspaceGeneration);
    await fixture.buildAsync();
    const initialized = responseSnapshot(await fixture.graphAsync('show'));
    expect(initialized.workspaceGeneration).not.toBe(cold.workspaceGeneration);
    await fixture.buildAsync();
    expect(responseSnapshot(await fixture.graphAsync('status')).workspaceGeneration)
      .toBe(initialized.workspaceGeneration);
  });

  it.each([undefined, 'another-session-token'])('rejects missing or stale token %s before mutation', async (token) => {
    await fixture.buildAsync();
    const before = responseSnapshot(await fixture.graphAsync('status'));
    const result = await fixture.runAsync(['daemon', 'graph', 'scope-out', '--project', 'a'], {
      expectedWorkspaceGeneration: token
    });
    expect(result.terminal).toMatchObject({ kind: 'requestRejected', payload: { code: 'invalidRequest' } });
    expect(responseSnapshot(await fixture.graphAsync('status'))).toEqual(before);
    expect(fixture.runs()).toEqual(['a', 'b']);
  });

  it('rejects an old reference after same-process soft reload without applying it to the replacement graph', async () => {
    await fixture.buildAsync();
    const before = responseSnapshot(await fixture.graphAsync('show'));
    const graph: IOperationGraph | undefined = fixture.session.operationGraph;
    const pid: number = process.pid;
    const stale: IDaemonRequestEnvelope = fixture.envelope(['daemon', 'graph', 'scope-out', '--project', 'a']);
    expect((await fixture.runAsync(['rebuild', '--to', 'b', '--parallelism', '3'])).terminal)
      .toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
    const current = responseSnapshot(await fixture.graphAsync('status'));
    expect(process.pid).toBe(pid);
    expect(fixture.session.operationGraph).not.toBe(graph);
    expect(current.workspaceGeneration).not.toBe(before.workspaceGeneration);
    expect((await fixture.runAsync([...stale.argv], stale)).terminal)
      .toMatchObject({ kind: 'requestRejected', payload: { code: 'invalidRequest' } });
    expect(responseSnapshot(await fixture.graphAsync('status'))).toEqual(current);
    expect(responseSnapshot(await fixture.graphAsync('scope-out', '--project', 'a')))
      .toMatchObject({ workspaceGeneration: current.workspaceGeneration, operations: [
        { enabled: false }, { enabled: false }, { enabled: false }
      ] });
  });

  it('does not reuse tokens after host replacement', async () => {
    const old = responseSnapshot(await fixture.graphAsync('status'));
    await fixture.restartAsync();
    expect(responseSnapshot(await fixture.graphAsync('status')).workspaceGeneration).not.toBe(old.workspaceGeneration);
  });
});
