// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { WorkspaceInputChangeTier } from '@microsoft/rush-lib';

import { getInstalledWorkspaceSuccessorLaunchAsync } from '../WorkspaceProcessRestart';
import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';
import { pongAsync, setDaemonPolicy } from './WarmGenerationTestUtilities';
import { stopSuccessorAsync } from './WorkspaceLifecycleTestProcess';

jest.setTimeout(30_000);

it('reports actual lifecycle tiers through both status surfaces without status reads causing work', async () => {
  const fixture = await DaemonGraphTestFixture.createAsync((created) => setDaemonPolicy(created, {}));
  try {
    expect(fixture.host.workspaceStatus.lastReloadTier).toBe(WorkspaceInputChangeTier.Reuse);
    expect((await pongAsync(fixture)).workspace).toMatchObject({
      lastReloadTier: WorkspaceInputChangeTier.Reuse,
      graphInitialized: false
    });
    expect(fixture.runs()).toEqual([]);
    expect((await fixture.buildAsync()).terminal).toMatchObject({ payload: { exitCode: 0 } });
    expect(fixture.host.workspaceStatus.lastReloadTier).toBe(WorkspaceInputChangeTier.Reload);
    const generation: number = fixture.host.workspaceGeneration;
    const graph = fixture.session.operationGraph;
    await fixture.graphAsync('status');
    expect((await pongAsync(fixture)).workspace?.lastReloadTier).toBe(WorkspaceInputChangeTier.Reload);
    expect(fixture.host.workspaceStatus.lastReloadTier).toBe(WorkspaceInputChangeTier.Reload);
    expect(fixture.host.workspaceGeneration).toBe(generation);
    expect(fixture.session.operationGraph).toBe(graph);
    expect(fixture.runs()).toEqual(['a', 'b']);

    expect((await fixture.buildAsync()).terminal).toMatchObject({ payload: { exitCode: 0 } });
    expect((await pongAsync(fixture)).workspace?.lastReloadTier).toBe(WorkspaceInputChangeTier.Reuse);
    expect(fixture.host.workspaceStatus.lastReloadTier).toBe(WorkspaceInputChangeTier.Reuse);
    setDaemonPolicy(fixture, { warmSetMaxProjects: 19 });
    expect((await fixture.buildAsync()).terminal).toMatchObject({ payload: { exitCode: 0 } });
    expect(fixture.host.workspaceGeneration).toBeGreaterThan(generation);
    expect((await pongAsync(fixture)).workspace?.lastReloadTier).toBe(WorkspaceInputChangeTier.Reload);
    expect(fixture.host.workspaceStatus.lastReloadTier).toBe(WorkspaceInputChangeTier.Reload);
  } finally {
    await fixture[Symbol.asyncDispose]();
  }
});

it('uses zero when a host has no native workspace lifecycle, without inventing a reload', async () => {
  const fixture = await DaemonGraphTestFixture.createAsync((created) => setDaemonPolicy(created, {}), false);
  try {
    expect((await pongAsync(fixture)).workspace).toMatchObject({
      lastReloadTier: 0,
      graphInitialized: false
    });
    expect(fixture.host.workspaceStatus.lastReloadTier).toBe(0);
    expect((await fixture.buildAsync()).terminal).toMatchObject({ payload: { exitCode: 0 } });
    expect((await pongAsync(fixture)).workspace?.lastReloadTier).toBe(0);
    expect(fixture.host.workspaceStatus.lastReloadTier).toBe(0);
  } finally {
    await fixture[Symbol.asyncDispose]();
  }
});

it('retains the requested restart tier on the old host while a real successor starts cold', async () => {
  const fixture = await DaemonGraphTestFixture.createAsync((created) => {
    setDaemonPolicy(created, {});
    created.getSuccessorLaunchAsync = getInstalledWorkspaceSuccessorLaunchAsync;
  });
  try {
    expect((await fixture.buildAsync()).terminal).toMatchObject({ payload: { exitCode: 0 } });
    const before = await pongAsync(fixture);
    const result = await fixture.runAsync(['build', '--to', 'b', '--parallelism', '3'], {
      environment: { ...fixture.environment, RUSHD_RELOAD_TIER_TEST: 'changed' }
    });
    expect(result.terminal).toMatchObject({
      kind: 'requestResult',
      payload: { exitCode: 1, retryAfterRestart: true }
    });
    const restarted = await fixture.host.restartCompleted;
    expect(restarted?.pid).not.toBe(before.pid);
    expect(fixture.host.workspaceStatus.lastReloadTier).toBe(WorkspaceInputChangeTier.Restart);
    expect(fixture.host.workspaceStatus.graphInitialized).toBe(false);
    const successor = await pongAsync(fixture);
    expect(successor.pid).toBe(restarted?.pid);
    expect(successor.workspace).toMatchObject({ lastReloadTier: 0, graphInitialized: false });
    expect(fixture.runs()).toEqual(['a', 'b']);
  } finally {
    try {
      await fixture.host.closeAsync();
      await fixture.host.restartCompleted;
    } finally {
      await stopSuccessorAsync(fixture.host.paths);
      await fixture[Symbol.asyncDispose]();
    }
  }
});
