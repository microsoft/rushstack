// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { OperationStatus } from '@microsoft/rush-lib';
import { LockFile } from '@rushstack/node-core-library';
import {
  DaemonFrameType,
  decodeDaemonControlMessage,
  type DaemonControlMessage,
  type IDaemonFrame,
  type IDaemonInstallationChange,
  type IDaemonRequestEnvelope,
  type IDaemonRequestQueuePositionMessage
} from '@rushstack/rush-daemon-protocol';

import type { IResolveDaemonRequestOptions, ResolvedDaemonRequest } from '../DaemonRequestDispatcher';
import { ProductionDaemonRequestResolver } from '../ProductionDaemonRequestResolver';
import { getInstalledWorkspaceSuccessorLaunchAsync } from '../WorkspaceProcessRestart';
import { DaemonGraphTestFixture, withScriptDeadline } from './DaemonGraphTestFixture';
import type { DaemonRequestWireClient, ITerminalExchange } from './DaemonRequestWireTestUtilities';
import { pongAsync, setDaemonPolicy } from './WarmGenerationTestUtilities';
import { stopSuccessorAsync } from './WorkspaceLifecycleTestProcess';

jest.setTimeout(60_000);

/** What the daemon's check of its own installation reports; each test that sets it clears it again. */
let installationChange: IDaemonInstallationChange | undefined;

const BUILD_B: string[] = ['build', '--to', 'b', '--parallelism', '3'];

interface IEarlyFailureFixtureOptions {
  readonly restartable?: boolean;
  readonly slowToStop?: boolean;
}

/** Keeps the output that it inherits open until the test removes the `hold` marker. */
const HOLD_OUTPUT_SCRIPT: string = withScriptDeadline(
  "const fs=require('node:fs');const t=setInterval(()=>{if(!fs.existsSync('../hold'))clearInterval(t);},20);"
);

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
    created.checkInstallation = () => installationChange;
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
      withScriptDeadline(
        "const fs=require('node:fs');" +
          startOutputHolder +
          "fs.appendFileSync('../runs.txt','c\\n');" +
          "const t=setInterval(()=>{if(!fs.existsSync('../hold')){clearInterval(t);console.log('finished-c');}},20);"
      )
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

function queuePositions(
  frames: ReadonlyArray<IDaemonFrame>
): IDaemonRequestQueuePositionMessage['payload'][] {
  return frames
    .filter((frame: IDaemonFrame) => frame.kind === DaemonFrameType.controlJson)
    .map((frame: IDaemonFrame) => decodeDaemonControlMessage(frame.payload))
    .filter((message: DaemonControlMessage) => message.kind === 'queuePosition')
    .map((message: DaemonControlMessage) => (message as IDaemonRequestQueuePositionMessage).payload);
}

async function readUntilQueuedAsync(client: DaemonRequestWireClient): Promise<IDaemonFrame[]> {
  const frames: IDaemonFrame[] = [];
  while (queuePositions(frames).length === 0) frames.push(await client.readFrameAsync());
  return frames;
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

  it('stops the work that continues before it answers with the restart for a changed installation', async () => {
    const fixture: DaemonGraphTestFixture = await createEarlyFailureFixtureAsync();
    const hold: string = path.join(fixture.folder, 'hold');
    try {
      await returnEarlyAsync(fixture);
      const change: IDaemonInstallationChange = {
        change: 'replaced',
        folder: path.join(fixture.folder, 'daemon')
      };
      installationChange = change;

      const { frames, terminal } = await fixture.runAsync(['build', '--to', 'c', '--parallelism', '3']);
      const restartReason: object = { kind: 'installationChanged', ...change };
      expect(terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 1, retryAfterRestart: true, restartReason }
      });
      // It waited only while the held c stopped, and it said why it waited.
      expect(queuePositions(frames)).toEqual([expect.objectContaining({ position: 1, restartReason })]);
      expect(fs.existsSync(hold)).toBe(true);
      expect(fixture.session.operationGraph?.status).not.toBe(OperationStatus.Executing);
      expect(isNativeLockFree(fixture)).toBe(true);
      await expect(fixture.host.restartCompleted).resolves.toBeUndefined();
    } finally {
      installationChange = undefined;
      fs.rmSync(hold, { force: true });
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('answers a command that it rejects with the restart once the installation changed, and leaves the work that continues running', async () => {
    const fixture: DaemonGraphTestFixture = await createEarlyFailureFixtureAsync();
    const hold: string = path.join(fixture.folder, 'hold');
    let later: DaemonRequestWireClient | undefined;
    let rejected: DaemonRequestWireClient | undefined;
    try {
      await returnEarlyAsync(fixture);
      // A later build waits for the held c, so the daemon serves it until that c finishes.
      later = await fixture.connectAsync();
      const build: IDaemonRequestEnvelope = fixture.envelope(['build', '--to', 'c', '--parallelism', '3']);
      await later.sendControlAsync({ kind: 'requestStart', payload: build });
      await readUntilQueuedAsync(later);

      // The installation changes while the daemon rejects a command that the client would run in-process.
      const change: IDaemonInstallationChange = {
        change: 'replaced',
        folder: path.join(fixture.folder, 'daemon')
      };
      const custom: IDaemonRequestEnvelope = fixture.envelope(['test', '--to', 'c'], {
        commandOrigin: 'custom'
      });
      const resolveAsync: ProductionDaemonRequestResolver['resolveRequestAsync'] =
        ProductionDaemonRequestResolver.prototype.resolveRequestAsync;
      jest
        .spyOn(ProductionDaemonRequestResolver.prototype, 'resolveRequestAsync')
        .mockImplementation(async function (
          this: ProductionDaemonRequestResolver,
          options: IResolveDaemonRequestOptions
        ) {
          if (options.envelope.requestId === custom.requestId) installationChange = change;
          const resolved: ResolvedDaemonRequest = await resolveAsync.call(this, options);
          return resolved;
        });
      rejected = await fixture.connectAsync();
      await rejected.sendControlAsync({ kind: 'requestStart', payload: custom });

      // So the client restarts the daemon instead of running the command in-process, and the restart waits for
      // the later build, which still waits for the held c.
      const restartReason: object = { kind: 'installationChanged', ...change };
      expect(queuePositions(await readUntilQueuedAsync(rejected))).toEqual([
        expect.objectContaining({ position: 1, restartReason })
      ]);
      expect(fixture.session.operationGraph?.status).toBe(OperationStatus.Executing);
      expect(countRuns(fixture, 'c')).toBe(1);

      fs.rmSync(hold);
      expect((await later.readTerminalAsync(build.requestId)).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      expect((await rejected.readTerminalAsync(custom.requestId)).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 1, retryAfterRestart: true, restartReason }
      });
      // The held c finished, and the later build found it done.
      expect(countRuns(fixture, 'c')).toBe(1);
      await expect(fixture.host.restartCompleted).resolves.toBeUndefined();
    } finally {
      installationChange = undefined;
      jest.restoreAllMocks();
      fs.rmSync(hold, { force: true });
      await later?.closeAsync();
      await rejected?.closeAsync();
      await fixture[Symbol.asyncDispose]();
    }
  });
});
