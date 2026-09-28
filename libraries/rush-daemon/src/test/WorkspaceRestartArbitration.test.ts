// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { WorkspaceInputChangeTier } from '@microsoft/rush-lib';

import { getInstalledWorkspaceSuccessorLaunchAsync } from '../WorkspaceProcessRestart';
import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';
import type { ITerminalExchange } from './DaemonRequestWireTestUtilities';
import { pongAsync, setDaemonPolicy } from './WarmGenerationTestUtilities';
import { stopSuccessorAsync } from './WorkspaceLifecycleTestProcess';

jest.setTimeout(60_000);

it('queues a mismatched-environment restart until matching queued and in-flight requests drain', async () => {
  const fixture = await DaemonGraphTestFixture.createAsync((created) => {
    setDaemonPolicy(created, {});
    created.getSuccessorLaunchAsync = getInstalledWorkspaceSuccessorLaunchAsync;
    // Project c holds its build open until the test removes the marker.
    created.write('hold', '');
    created.write(
      'c/build.cjs',
      "const fs=require('node:fs');fs.appendFileSync('../runs.txt','c\\n');" +
        "const t=setInterval(()=>{if(!fs.existsSync('../hold')){clearInterval(t);console.log('finished-c');}},20);"
    );
  });
  const order: string[] = [];
  const track = (name: string, exchange: Promise<ITerminalExchange>): Promise<ITerminalExchange> =>
    exchange.then((result) => {
      order.push(name);
      return result;
    });
  try {
    const before = await pongAsync(fixture);
    const matching = track('matching', fixture.runAsync(['build', '--to', 'c', '--parallelism', '3']));
    const deadline: number = Date.now() + 30_000;
    while (!fixture.runs().includes('c') && Date.now() < deadline) await delayAsync(20);
    expect(fixture.runs()).toContain('c');

    const mismatched = track(
      'mismatched',
      fixture.runAsync(['build', '--to', 'b', '--parallelism', '3'], {
        environment: { ...fixture.environment, RUSHD_RELOAD_TIER_TEST: 'changed' }
      })
    );
    await delayAsync(1000);
    // Arrives after the mismatched request; it must still be served by this process.
    const lateMatching = track('late', fixture.runAsync(['build', '--to', 'c', '--parallelism', '3']));
    await delayAsync(1000);
    expect(order).toEqual([]);
    expect(fixture.host.workspaceStatus.lastReloadTier).not.toBe(WorkspaceInputChangeTier.Restart);

    fs.rmSync(path.join(fixture.folder, 'hold'));
    const [held, late, restart] = await Promise.all([matching, lateMatching, mismatched]);
    expect(held.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
    expect(held.terminal.payload).not.toHaveProperty('retryAfterRestart');
    expect(late.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
    expect(late.terminal.payload).not.toHaveProperty('retryAfterRestart');
    expect(restart.terminal).toMatchObject({
      kind: 'requestResult',
      payload: { exitCode: 1, retryAfterRestart: true }
    });
    expect(order[order.length - 1]).toBe('mismatched');

    const restarted = await fixture.host.restartCompleted;
    expect(restarted?.pid).not.toBe(before.pid);
    expect((await pongAsync(fixture)).pid).toBe(restarted?.pid);
    expect(fixture.runs()).not.toContain('b');
  } finally {
    fs.rmSync(path.join(fixture.folder, 'hold'), { force: true });
    try {
      await fixture.host.closeAsync();
      await fixture.host.restartCompleted;
    } finally {
      await stopSuccessorAsync(fixture.host.paths);
      await fixture[Symbol.asyncDispose]();
    }
  }
});