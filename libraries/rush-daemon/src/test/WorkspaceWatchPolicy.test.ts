// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { RequestExclusivityClass } from '../RequestScheduler';
import { getWorkspaceRequestScheduler } from '../WorkspaceRequestAdmission';
import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';
import { eventuallyAsync, pongAsync, setDaemonPolicy } from './WarmGenerationTestUtilities';
import { createScript, WarmSetTestFixture } from './WarmSetTestFixture';

jest.setTimeout(30_000);

async function createFixtureAsync(watch?: boolean): Promise<DaemonGraphTestFixture> {
  return await DaemonGraphTestFixture.createAsync((fixture) => {
    setDaemonPolicy(fixture, { watch });
    fixture.write('.gitignore', 'common/temp/\n**/.rush/\n**/rush-logs/\n**/lib/\nruns.txt\n');
    for (const name of ['a', 'b', 'c']) fixture.write(`${name}/build.cjs`, createScript(name, false));
  });
}

describe('daemon.watch observation-only policy', () => {
  let previousWatch: string | undefined;
  beforeEach(() => {
    previousWatch = process.env.RUSH_DAEMON_WATCH;
    delete process.env.RUSH_DAEMON_WATCH;
  });
  afterEach(() => {
    if (previousWatch === undefined) delete process.env.RUSH_DAEMON_WATCH;
    else process.env.RUSH_DAEMON_WATCH = previousWatch;
  });

  it('defaults to root/config guards only and still rebuilds unwatched source/config changes correctly', async () => {
    const fixture = await createFixtureAsync();
    try {
      await fixture.buildSuccessfullyAsync();
      const graph = fixture.session.operationGraph!;
      const generation: number = fixture.host.workspaceGeneration;
      expect((await pongAsync(fixture)).workspace?.warmSet).toMatchObject({
        configuration: { watch: false },
        watchedProjectNames: [],
        retainedProjectNames: ['a', 'b']
      });
      fixture.write('a/input.txt', 'changed-unwatched');
      await fixture.buildSuccessfullyAsync();
      expect(fixture.session.operationGraph).toBe(graph);
      expect(fixture.host.workspaceGeneration).toBe(generation);
      expect(fs.readFileSync(path.join(fixture.folder, 'a/lib/output.txt'), 'utf8')).toBe(
        'changed-unwatched'
      );

      fixture.write(
        'a/config/rush-project.json',
        JSON.stringify({
          operationSettings: [{ operationName: '_phase:compile', outputFolderNames: ['lib'] }]
        })
      );
      fixture.write('a/input.txt', 'changed-config');
      await fixture.buildSuccessfullyAsync();
      expect(fixture.host.workspaceGeneration).toBeGreaterThan(generation);
      expect(fs.readFileSync(path.join(fixture.folder, 'a/lib/output.txt'), 'utf8')).toBe('changed-config');
      expect(fixture.session.warmSetStatus?.watchedProjectNames).toEqual([]);

      fixture.write('common/config/rush/watch-probe.json', '{}');
      await eventuallyAsync(() =>
        expect(fixture.session.invalidations.getSnapshot().changedPaths).toContain(
          path.join(fixture.folder, 'common/config/rush/watch-probe.json')
        )
      );
      fixture.write('rush.json', fs.readFileSync(path.join(fixture.folder, 'rush.json'), 'utf8'));
      await eventuallyAsync(() =>
        expect(fixture.session.invalidations.getSnapshot().changedPaths).toContain(
          path.join(fixture.folder, 'rush.json')
        )
      );
      expect(fixture.runs()).toEqual(['a', 'b', 'a', 'b', 'a', 'b']);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('observes requested warm projects between requests when enabled, without scheduling scripts', async () => {
    const fixture = await createFixtureAsync(true);
    try {
      await fixture.buildSuccessfullyAsync();
      const graph = fixture.session.operationGraph!;
      expect(fixture.session.warmSetStatus?.watchedProjectNames).toEqual(['a', 'b']);
      fixture.write('a/input.txt', 'observed-idle-change');
      await eventuallyAsync(() =>
        expect(fixture.session.invalidations.getSnapshot().changedPaths).toContain(
          path.join(fixture.folder, 'a/input.txt')
        )
      );
      expect(graph.hasScheduledIteration).toBe(false);
      expect(fixture.runs()).toEqual(['a', 'b']);
      expect((await pongAsync(fixture)).workspace?.warmSet?.configuration.watch).toBe(true);
      await fixture.buildSuccessfullyAsync();
      expect(fs.readFileSync(path.join(fixture.folder, 'a/lib/output.txt'), 'utf8')).toBe(
        'observed-idle-change'
      );
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it.each([
    { json: false, environment: '1', expected: ['a', 'b'] },
    { json: true, environment: '0', expected: [] }
  ])('honors the existing environment override: %p', async ({ json, environment, expected }) => {
    process.env.RUSH_DAEMON_WATCH = environment;
    const fixture = await createFixtureAsync(json);
    try {
      await fixture.buildSuccessfullyAsync();
      expect(fixture.session.warmSetStatus?.watchedProjectNames).toEqual(expected);
      expect(fixture.session.warmSetStatus?.configuration.watch).toBe(environment === '1');
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('closes and restores project observation without dropping native results or warm IPC runners', async () => {
    const resources = await WarmSetTestFixture.createAsync({ ipc: true });
    try {
      await resources.fixture.buildSuccessfullyAsync();
      const records = new Map(resources.graph.resultByOperation);
      const closeRunners = jest.spyOn(resources.graph, 'closeRunnersAsync');
      resources.update({ watch: false });
      expect((await resources.warm.maintainAsync()).watchedProjectNames).toEqual([]);
      expect(resources.graph.resultByOperation).toEqual(records);
      expect(resources.operation('a').runner?.isActive).toBe(true);
      expect(resources.operation('b').runner?.isActive).toBe(true);
      expect(closeRunners).not.toHaveBeenCalled();
      resources.update({ watch: true });
      expect((await resources.warm.maintainAsync()).watchedProjectNames).toEqual(['a', 'b']);
      for (const [operation, record] of records)
        expect(resources.graph.resultByOperation.get(operation)).toBe(record);
      expect(resources.fixture.runs()).toEqual(['a', 'b']);
      closeRunners.mockRestore();
    } finally {
      await resources[Symbol.asyncDispose]();
    }
  });

  it('defers teardown behind active/protected work and diagnoses failed closes without false accounting', async () => {
    const resources = await WarmSetTestFixture.createAsync({ ipc: true });
    try {
      await resources.fixture.buildSuccessfullyAsync();
      const scheduler = getWorkspaceRequestScheduler(resources.fixture.session);
      const active = await scheduler.acquireAsync({ exclusivityClass: RequestExclusivityClass.SharedBuild });
      resources.update({ watch: false });
      try {
        expect((await resources.warm.maintainAsync()).deferredReason).toBe('workspace-busy');
        expect(resources.watcher.watchedProjectNames.size).toBe(2);
      } finally {
        active.release();
      }
      const protection = await scheduler.acquireAsync({
        exclusivityClass: RequestExclusivityClass.Exclusive
      });
      resources.protectedOperations.add(resources.operation('a'));
      protection.release();
      expect((await resources.warm.maintainAsync()).watchedProjectNames).toEqual(['a']);
      const unprotect = await scheduler.acquireAsync({ exclusivityClass: RequestExclusivityClass.Exclusive });
      resources.protectedOperations.clear();
      unprotect.release();
      const close = jest
        .spyOn(resources.watcher, 'unwatchProjectsAsync')
        .mockRejectedValueOnce(new Error('policy-close-failed'));
      try {
        const failed = await resources.warm.maintainAsync();
        expect(failed.watchedProjectNames).toEqual(['a']);
        expect(failed.cleanupFailures).toEqual([expect.stringContaining('policy-close-failed')]);
        expect(resources.graph.resultByOperation.size).toBe(2);
        expect(resources.diagnostics.some((error) => error.message.includes('daemon.watch'))).toBe(true);
        const recovered = await resources.warm.maintainAsync();
        expect(recovered.watchedProjectNames).toEqual([]);
        expect(recovered.cleanupFailures).toEqual([]);
        await resources.fixture.buildSuccessfullyAsync();
      } finally {
        close.mockRestore();
      }
    } finally {
      await resources[Symbol.asyncDispose]();
    }
  });

  it('does not alter observation while an unstarted native iteration is prepared', async () => {
    const resources = await WarmSetTestFixture.createAsync({ ipc: true });
    try {
      await resources.fixture.buildSuccessfullyAsync();
      const session = resources.fixture.session;
      const scheduler = getWorkspaceRequestScheduler(session);
      const admission = await scheduler.acquireAsync({ exclusivityClass: RequestExclusivityClass.Exclusive });
      const native = await session.acquireExecutionLeaseAsync();
      try {
        resources.graph.pauseNextIteration = true;
        resources.graph.invalidateOperations();
        await resources.graph.scheduleIterationAsync({ inputsSnapshot: session.inputsSnapshot });
      } finally {
        await native?.[Symbol.asyncDispose]();
        admission.release();
      }
      resources.update({ watch: false });
      expect((await resources.warm.maintainAsync()).deferredReason).toBe('graph-busy');
      expect(resources.watcher.watchedProjectNames.size).toBe(2);
      expect(resources.graph.hasScheduledIteration).toBe(true);
      const discard = await scheduler.acquireAsync({ exclusivityClass: RequestExclusivityClass.Exclusive });
      try {
        resources.graph.discardScheduledIteration();
      } finally {
        discard.release();
      }
      expect((await resources.warm.maintainAsync()).watchedProjectNames).toEqual([]);
      expect(resources.fixture.runs()).toEqual(['a', 'b']);
    } finally {
      await resources[Symbol.asyncDispose]();
    }
  });
});
