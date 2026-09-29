// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { OperationStatus } from '@microsoft/rush-lib';
import { LockFile } from '@rushstack/node-core-library';
import type { IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';

import { getInstalledWorkspaceSuccessorLaunchAsync } from '../WorkspaceProcessRestart';
import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';
import type { DaemonRequestWireClient, ITerminalExchange } from './DaemonRequestWireTestUtilities';
import { pongAsync, setDaemonPolicy } from './WarmGenerationTestUtilities';
import { stopSuccessorAsync } from './WorkspaceLifecycleTestProcess';

jest.setTimeout(60_000);

const BUILD_B: string[] = ['build', '--to', 'b', '--parallelism', '3'];

interface IEarlyFailureFixtureOptions {
  readonly restartable?: boolean;
  readonly slowToStop?: boolean;
}

/** Keeps the output that it inherits open until the test removes the `hold` marker. */
const HOLD_OUTPUT_SCRIPT: string =
  "const fs=require('node:fs');const t=setInterval(()=>{if(!fs.existsSync('../hold'))clearInterval(t);},20);";

/**
 * b consumes a and c. a fails, and c holds its build open until the test removes the `hold` marker, so a build of b
 * that returns early on failure leaves c running. With `slowToStop`, c first starts a detached process that shares
 * its output, like a stray watcher: stopping c kills c's process group but not that process, so c's operation ends
 * only when the test removes the marker.
 */
function createEarlyFailureFixtureAsync({
  restartable = false,
  slowToStop = false
}: IEarlyFailureFixtureOptions = {}): Promise<DaemonGraphTestFixture> {
  const startOutputHolder: string = slowToStop
    ? `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(HOLD_OUTPUT_SCRIPT)}],` +
      "{detached:true,stdio:['ignore','inherit','inherit']}).unref();"
    : '';
  return DaemonGraphTestFixture.createAsync((created: DaemonGraphTestFixture) => {
    if (restartable) {
      setDaemonPolicy(created, {});
      created.getSuccessorLaunchAsync = getInstalledWorkspaceSuccessorLaunchAsync;
    }
    created.write('hold', '');
    created.write(
      'b/package.json',
      JSON.stringify({
        name: 'b',
        version: '1.0.0',
        dependencies: { a: '1.0.0', c: '1.0.0' },
        scripts: { '_phase:compile': 'node build.cjs' }
      })
    );
    created.write(
      'a/build.cjs',
      "require('node:fs').appendFileSync('../runs.txt','a\\n');console.error('failed-a');process.exitCode=1;"
    );
    created.write(
      'c/build.cjs',
      "const fs=require('node:fs');" +
        startOutputHolder +
        "fs.appendFileSync('../runs.txt','c\\n');" +
        "const t=setInterval(()=>{if(!fs.existsSync('../hold')){clearInterval(t);console.log('finished-c');}},20);"
    );
  });
}

function countRuns(fixture: DaemonGraphTestFixture, name: string): number {
  return fixture.runs().filter((run: string) => run === name).length;
}

async function waitUntilAsync(condition: () => boolean): Promise<void> {
  const deadline: number = Date.now() + 30_000;
  while (!condition() && Date.now() < deadline) await delayAsync(20);
}

async function waitForRunsAsync(fixture: DaemonGraphTestFixture, name: string, count: number): Promise<void> {
  await waitUntilAsync(() => countRuns(fixture, name) >= count);
}

/** Counts the stops that the daemon requested; every iteration's start also aborts, without options. */
function countTerminatingAborts(abortSpy: jest.SpyInstance): number {
  return abortSpy.mock.calls.filter(
    ([options]: ReadonlyArray<{ terminateRunning?: boolean } | undefined>) =>
      options?.terminateRunning === true
  ).length;
}

/** Whether an in-process Rush command could take the Rush lock that the daemon holds while it executes. */
function isNativeLockFree(fixture: DaemonGraphTestFixture): boolean {
  const probe: LockFile | undefined = LockFile.tryAcquire(
    fixture.session.rushConfiguration.commonTempFolder,
    'rush'
  );
  probe?.release();
  return probe !== undefined;
}

async function isSettledAsync(promise: Promise<unknown>): Promise<boolean> {
  let settled: boolean = false;
  promise.then(
    () => (settled = true),
    () => (settled = true)
  );
  await delayAsync(0);
  return settled;
}

async function returnEarlyAsync(fixture: DaemonGraphTestFixture): Promise<void> {
  const early: ITerminalExchange = await fixture.runAsync(BUILD_B, { returnEarlyOnFailure: true });
  expect(early.terminal).toMatchObject({
    kind: 'requestResult',
    payload: { exitCode: 1, outcome: 'failure' }
  });
  // The client disconnected with its result, while c still runs.
  await waitForRunsAsync(fixture, 'c', 1);
  expect(countRuns(fixture, 'c')).toBe(1);
  expect(countRuns(fixture, 'b')).toBe(0);
}

describe('a failed build that returns early', () => {
  it('lets a rebuild stop the work that continues instead of waiting for it', async () => {
    const fixture: DaemonGraphTestFixture = await createEarlyFailureFixtureAsync();
    const hold: string = path.join(fixture.folder, 'hold');
    try {
      await returnEarlyAsync(fixture);

      const rebuild: Promise<ITerminalExchange> = fixture.runAsync([
        'rebuild',
        '--to',
        'c',
        '--parallelism',
        '3'
      ]);
      // The rebuild runs c again while the first c is still held, so it did not wait for that c to finish.
      await waitForRunsAsync(fixture, 'c', 2);
      expect(countRuns(fixture, 'c')).toBe(2);
      expect(fs.existsSync(hold)).toBe(true);

      fs.rmSync(hold);
      expect((await rebuild).terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
    } finally {
      fs.rmSync(hold, { force: true });
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('lets a later build wait for the work that continues and find it done', async () => {
    const fixture: DaemonGraphTestFixture = await createEarlyFailureFixtureAsync();
    const hold: string = path.join(fixture.folder, 'hold');
    try {
      await returnEarlyAsync(fixture);

      const later: Promise<ITerminalExchange> = fixture.runAsync([
        'build',
        '--to',
        'c',
        '--parallelism',
        '3'
      ]);
      await delayAsync(1000);
      expect(await isSettledAsync(later)).toBe(false);
      expect(countRuns(fixture, 'c')).toBe(1);

      fs.rmSync(hold);
      expect((await later).terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      expect(countRuns(fixture, 'c')).toBe(1);
    } finally {
      fs.rmSync(hold, { force: true });
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('stops the work that continues before it rejects a command that the client then runs in-process', async () => {
    const fixture: DaemonGraphTestFixture = await createEarlyFailureFixtureAsync();
    const hold: string = path.join(fixture.folder, 'hold');
    try {
      await returnEarlyAsync(fixture);

      const custom: ITerminalExchange = await fixture.runAsync(['test', '--to', 'c'], {
        commandOrigin: 'custom'
      });
      expect(custom.terminal).toMatchObject({ kind: 'requestRejected', payload: { code: 'unsupported' } });
      // The held c was stopped before the rejection was sent, and the in-process command can take the Rush lock.
      expect(fs.existsSync(hold)).toBe(true);
      expect(fixture.session.operationGraph?.status).not.toBe(OperationStatus.Executing);
      expect(isNativeLockFree(fixture)).toBe(true);

      // So a later build runs c again at once, instead of waiting for the held c.
      const later: Promise<ITerminalExchange> = fixture.runAsync([
        'build',
        '--to',
        'c',
        '--parallelism',
        '3'
      ]);
      await waitForRunsAsync(fixture, 'c', 2);
      expect(countRuns(fixture, 'c')).toBe(2);
      fs.rmSync(hold);
      expect((await later).terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
    } finally {
      fs.rmSync(hold, { force: true });
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('answers a client that cancels while the work that continues is stopping, without waiting for it to stop', async () => {
    const fixture: DaemonGraphTestFixture = await createEarlyFailureFixtureAsync({ slowToStop: true });
    const hold: string = path.join(fixture.folder, 'hold');
    try {
      await returnEarlyAsync(fixture);
      const abortSpy: jest.SpyInstance = jest.spyOn(
        fixture.session.operationGraph!,
        'abortCurrentIterationAsync'
      );
      const client: DaemonRequestWireClient = await fixture.connectAsync();
      try {
        const custom: IDaemonRequestEnvelope = fixture.envelope(['test', '--to', 'c'], {
          commandOrigin: 'custom'
        });
        await client.sendControlAsync({ kind: 'requestStart', payload: custom });
        // Before it rejects `test`, the daemon stops c, which takes until the test removes the marker.
        await waitUntilAsync(() => countTerminatingAborts(abortSpy) > 0);
        expect(countTerminatingAborts(abortSpy)).toBe(1);
        const answer: Promise<ITerminalExchange> = client.readTerminalAsync(custom.requestId);
        expect(await Promise.race([answer, delayAsync(500).then(() => undefined)])).toBeUndefined();

        // rush-client cancels on Ctrl+C, and gives up on the daemon if it does not answer within 5 seconds.
        await client.sendControlAsync({ kind: 'requestCancel', payload: { requestId: custom.requestId } });
        const cancelled: ITerminalExchange | undefined = await Promise.race([
          answer,
          delayAsync(3_000).then(() => undefined)
        ]);
        expect(cancelled?.terminal).toMatchObject({
          kind: 'requestRejected',
          payload: { code: 'unsupported' }
        });
        // c is still stopping, so the client must not run `test` in-process now; rush-client reports a command
        // that it cancelled as cancelled instead.
        expect(fixture.session.operationGraph?.status).toBe(OperationStatus.Executing);
        expect(isNativeLockFree(fixture)).toBe(false);
      } finally {
        await client.closeAsync();
      }
    } finally {
      fs.rmSync(hold, { force: true });
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('leaves the work that continues running for a read-only command or a rushx script that it rejects', async () => {
    const fixture: DaemonGraphTestFixture = await createEarlyFailureFixtureAsync();
    const hold: string = path.join(fixture.folder, 'hold');
    try {
      await returnEarlyAsync(fixture);

      // As rush-client sends them: it marks every command that the daemon does not serve as a custom command.
      const requests: [string[], Partial<IDaemonRequestEnvelope>][] = [
        [['list'], { commandOrigin: 'custom' }],
        [['start'], { commandOrigin: 'custom', invocationKind: 'rushx' }]
      ];
      for (const [argv, overrides] of requests) {
        expect((await fixture.runAsync(argv, overrides)).terminal).toMatchObject({
          kind: 'requestRejected',
          payload: { code: 'unsupported' }
        });
      }
      expect(fixture.session.operationGraph?.status).toBe(OperationStatus.Executing);
      expect(isNativeLockFree(fixture)).toBe(false);
      expect(countRuns(fixture, 'c')).toBe(1);

      const later: Promise<ITerminalExchange> = fixture.runAsync([
        'build',
        '--to',
        'c',
        '--parallelism',
        '3'
      ]);
      fs.rmSync(hold);
      expect((await later).terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      expect(countRuns(fixture, 'c')).toBe(1);
    } finally {
      fs.rmSync(hold, { force: true });
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('lets a restart for another environment proceed without waiting for the work that continues', async () => {
    const fixture: DaemonGraphTestFixture = await createEarlyFailureFixtureAsync({ restartable: true });
    const hold: string = path.join(fixture.folder, 'hold');
    try {
      const before = await pongAsync(fixture);
      await returnEarlyAsync(fixture);

      const mismatched: Promise<ITerminalExchange> = fixture.runAsync(
        ['build', '--to', 'c', '--parallelism', '3'],
        {
          environment: { ...fixture.environment, RUSHD_RELOAD_TIER_TEST: 'changed' }
        }
      );
      const restart: ITerminalExchange | undefined = await Promise.race([
        mismatched,
        delayAsync(20_000).then(() => undefined)
      ]);
      expect(fs.existsSync(hold)).toBe(true);
      expect(restart?.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 1, retryAfterRestart: true }
      });
      const restarted = await fixture.host.restartCompleted;
      expect(restarted?.pid).not.toBe(before.pid);
    } finally {
      fs.rmSync(hold, { force: true });
      try {
        await fixture.host.closeAsync();
        await fixture.host.restartCompleted;
      } finally {
        await stopSuccessorAsync(fixture.host.paths);
        await fixture[Symbol.asyncDispose]();
      }
    }
  });
});
