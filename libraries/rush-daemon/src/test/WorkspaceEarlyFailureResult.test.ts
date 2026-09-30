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
  type IDaemonRequestQueuePositionMessage,
  type IDaemonRequestRejectedMessage
} from '@rushstack/rush-daemon-protocol';

import type { IResolveDaemonRequestOptions } from '../DaemonRequestDispatcher';
import type { IOutputFolderSet } from '../OutputFolderDigest';
import * as outputFolderDigestPool from '../OutputFolderDigestPool';
import { ProductionDaemonRequestResolver } from '../ProductionDaemonRequestResolver';
import { RequestScheduler } from '../RequestScheduler';
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
  readonly writesOutputs?: boolean;
}

/** Keeps the output that it inherits open until the test removes the `hold` marker. */
const HOLD_OUTPUT_SCRIPT: string = withScriptDeadline(
  "const fs=require('node:fs');const t=setInterval(()=>{if(!fs.existsSync('../hold'))clearInterval(t);},20);"
);

/**
 * b consumes a and c. a fails, and c holds its build open until the test removes the `hold` marker, so a build of b
 * that returns early on failure leaves c running. With `slowToStop`, c first starts a detached process that shares
 * its output, like a stray watcher: stopping c kills c's process group but not that process, so c's operation ends
 * only when the test removes the marker. With `writesOutputs`, c declares its git-ignored `lib` folder as output, and
 * writes one file there when it starts and another when the test removes the marker.
 */
function createEarlyFailureFixtureAsync({
  restartable = false,
  slowToStop = false,
  writesOutputs = false
}: IEarlyFailureFixtureOptions = {}): Promise<DaemonGraphTestFixture> {
  const startOutputHolder: string = slowToStop
    ? `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(HOLD_OUTPUT_SCRIPT)}],` +
      "{detached:true,stdio:['ignore','inherit','inherit']}).unref();"
    : '';
  const startOutputs: string = writesOutputs
    ? "fs.mkdirSync('lib',{recursive:true});fs.writeFileSync('lib/started.js','');"
    : '';
  const finishOutputs: string = writesOutputs ? "fs.writeFileSync('lib/finished.js','');" : '';
  return DaemonGraphTestFixture.createAsync((created: DaemonGraphTestFixture) => {
    if (restartable) {
      setDaemonPolicy(created, {});
      created.getSuccessorLaunchAsync = getInstalledWorkspaceSuccessorLaunchAsync;
    }
    if (writesOutputs) {
      fs.appendFileSync(path.join(created.folder, '.gitignore'), '**/lib/\n');
      created.write(
        'c/config/rush-project.json',
        JSON.stringify({
          operationSettings: [{ operationName: '_phase:compile', outputFolderNames: ['lib'] }]
        })
      );
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
          startOutputs +
          "fs.appendFileSync('../runs.txt','c\\n');" +
          `const t=setInterval(()=>{if(!fs.existsSync('../hold')){clearInterval(t);${finishOutputs}` +
          "console.log('finished-c');}},20);"
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

/**
 * The daemon rejects this command before admission, as rush-client sends it: rush-client marks only build, rebuild,
 * install and update as built-in commands, and the daemon finds a built-in command that is not phased by its name.
 * Unlike `list`, it does not only read the workspace.
 */
const NOT_PHASED: string[] = ['install-autoinstaller', '--name', 'tools'];

/** What a request that stops the held c is told while it waits; see `returnEarlyAsync`. */
const STOPPING_C: object = { count: 1, names: ['c (compile)'], stopping: true };

/** Changes project c's configuration, so that the next build reloads the graph. */
function changeProjectConfiguration(fixture: DaemonGraphTestFixture): void {
  const packageJsonPath: string = path.join(fixture.folder, 'c/package.json');
  const packageJson: Record<string, unknown> = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  fs.writeFileSync(packageJsonPath, JSON.stringify({ ...packageJson, description: 'changed' }));
}

/** The line that the daemon adds to a rejection after it stopped the held c; see `returnEarlyAsync`. */
const STOPPED_C: string =
  'rushd stopped 1 operation left running by an earlier failed command (c (compile)), so that this command can ' +
  'run in-process.';

/** The message of the `unsupported` rejection that ends `exchange`. */
function getUnsupportedMessage(exchange: ITerminalExchange | undefined): string {
  expect(exchange?.terminal).toMatchObject({ kind: 'requestRejected', payload: { code: 'unsupported' } });
  return (exchange?.terminal as IDaemonRequestRejectedMessage).payload.message;
}

/**
 * After a failed build returned early, sends `argv`, which the daemon rejects so that the client runs it in-process,
 * and checks that the daemon stopped the work that continues before it sent the rejection, which says so.
 */
async function expectStopBeforeRejectionAsync(argv: string[]): Promise<void> {
  const fixture: DaemonGraphTestFixture = await createEarlyFailureFixtureAsync();
  const hold: string = path.join(fixture.folder, 'hold');
  try {
    await returnEarlyAsync(fixture);

    const message: string = getUnsupportedMessage(await fixture.runAsync(argv, { commandOrigin: 'custom' }));
    // The held c was stopped before the rejection was sent, and the in-process command can take the Rush lock.
    expect(fs.existsSync(hold)).toBe(true);
    expect(fixture.session.operationGraph?.status).not.toBe(OperationStatus.Executing);
    expect(isNativeLockFree(fixture)).toBe(true);

    // So a later build runs c again at once, instead of waiting for the held c.
    const later: Promise<ITerminalExchange> = fixture.runAsync(['build', '--to', 'c', '--parallelism', '3']);
    await waitForRunsAsync(fixture, 'c', 2);
    expect(countRuns(fixture, 'c')).toBe(2);
    fs.rmSync(hold);
    expect((await later).terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });

    // The rejection names the stopped c after its first line. Once nothing continues, the same command's rejection
    // doesn't.
    const [reason, ...details] = getUnsupportedMessage(
      await fixture.runAsync(argv, { commandOrigin: 'custom' })
    ).split('\n');
    expect(message).toBe([reason, STOPPED_C, ...details].join('\n'));
  } finally {
    fs.rmSync(hold, { force: true });
    await fixture[Symbol.asyncDispose]();
  }
}

/**
 * After a failed build returned early, and while a later build waits for the work that continues, sends `argv`,
 * which the daemon rejects so that the client would run it in-process. `changeInstallationWhenChecked` changes the
 * installation while the daemon checks the command. Checks that the daemon answers with the restart instead, and
 * leaves the work that continues running.
 */
async function expectRestartForRejectedCommandAsync(
  argv: string[],
  changeInstallationWhenChecked: (custom: IDaemonRequestEnvelope, change: IDaemonInstallationChange) => void
): Promise<void> {
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
    const custom: IDaemonRequestEnvelope = fixture.envelope(argv, { commandOrigin: 'custom' });
    changeInstallationWhenChecked(custom, change);
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
      const { frames, terminal } = await rebuild;
      expect(terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      // It was told that the daemon stopped the held c for it (task 345).
      expect(queuePositions(frames)).toEqual([
        expect.objectContaining({ position: 1, continuingOperations: STOPPING_C })
      ]);
    } finally {
      fs.rmSync(hold, { force: true });
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('lets a build that reloads the graph stop the work that continues, and says so (task 345)', async () => {
    const fixture: DaemonGraphTestFixture = await createEarlyFailureFixtureAsync();
    const hold: string = path.join(fixture.folder, 'hold');
    try {
      await returnEarlyAsync(fixture);
      const generation: number = fixture.host.workspaceGeneration;

      changeProjectConfiguration(fixture);
      const reload: Promise<ITerminalExchange> = fixture.runAsync([
        'build',
        '--to',
        'c',
        '--parallelism',
        '3'
      ]);
      // The reloaded graph runs c again while the first c is still held, so the reload did not wait for that c.
      await waitForRunsAsync(fixture, 'c', 2);
      expect(countRuns(fixture, 'c')).toBe(2);
      expect(fs.existsSync(hold)).toBe(true);

      fs.rmSync(hold);
      const { frames, terminal } = await reload;
      expect(terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      expect(fixture.host.workspaceGeneration).toBeGreaterThan(generation);
      expect(queuePositions(frames)).toEqual([
        expect.objectContaining({ position: 1, continuingOperations: STOPPING_C })
      ]);
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
      const { frames, terminal } = await later;
      expect(terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      expect(countRuns(fixture, 'c')).toBe(1);
      // It was told that it waited for the held c, which the daemon did not stop.
      expect(queuePositions(frames)).toEqual([
        expect.objectContaining({ position: 1, continuingOperations: { count: 1, names: ['c (compile)'] } })
      ]);
    } finally {
      fs.rmSync(hold, { force: true });
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('walks the outputs of the work that continues only after that work ended, for a later build', async () => {
    const digester: outputFolderDigestPool.OutputFolderDigester =
      new outputFolderDigestPool.OutputFolderDigester({
        threadCount: 2,
        poolStartThresholdMs: -1
      });
    const sharedDigesterSpy: jest.SpyInstance = jest
      .spyOn(outputFolderDigestPool, 'getSharedOutputFolderDigester')
      .mockReturnValue(digester);
    const fixture: DaemonGraphTestFixture = await createEarlyFailureFixtureAsync({ writesOutputs: true });
    const hold: string = path.join(fixture.folder, 'hold');
    try {
      // Start the pool, so that each reconciliation walks the output folders on its workers.
      digester.digest(
        ['a', 'b'].map((name: string) => ({ projectFolder: fixture.folder, folderNames: [name] }))
      );
      expect(digester.isParallel).toBe(true);
      const startSpy: jest.SpyInstance = jest.spyOn(digester, 'start');
      fs.rmSync(hold);
      expect((await fixture.runAsync(['build', '--to', 'c'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });

      // An edit inside c's outputs makes the next build run c again, and c then holds its build open.
      fixture.write('hold', '');
      fixture.write('c/lib/started.js', 'edited');
      const early: ITerminalExchange = await fixture.runAsync(BUILD_B, { returnEarlyOnFailure: true });
      expect(early.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 1, outcome: 'failure' }
      });
      await waitForRunsAsync(fixture, 'c', 2);
      const { projectFolder } = fixture.session.rushConfiguration.getProjectByName('c')!;
      const walkOfC: IOutputFolderSet[][] = [[{ projectFolder, folderNames: ['lib'] }]];
      expect(startSpy.mock.calls).toEqual([walkOfC]);

      const later: Promise<ITerminalExchange> = fixture.runAsync([
        'build',
        '--to',
        'c',
        '--parallelism',
        '3'
      ]);
      await delayAsync(1000);
      expect(await isSettledAsync(later)).toBe(false);
      // The last iteration walked c's outputs, but nothing walks them again while c still writes them.
      expect(startSpy.mock.calls).toEqual([walkOfC]);

      fs.rmSync(hold);
      expect((await later).terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      expect(startSpy.mock.calls).toEqual([walkOfC, walkOfC]);
      // That walk found the outputs that c finished, so c did not run again.
      expect(countRuns(fixture, 'c')).toBe(2);
    } finally {
      fs.rmSync(hold, { force: true });
      await fixture[Symbol.asyncDispose]();
      sharedDigesterSpy.mockRestore();
      digester.dispose();
    }
  });

  it('stops the work that continues before it rejects a command that the client then runs in-process', async () => {
    // The fixture's `test` is not a phased command, so the daemon rejects it at its parse, after admission.
    await expectStopBeforeRejectionAsync(['test', '--to', 'c']);
  });

  it('stops the work that continues before it rejects a built-in command that is not phased, before admission', async () => {
    await expectStopBeforeRejectionAsync(NOT_PHASED);
  });

  it('does not say that it stopped work that continues if it could not stop that work', async () => {
    // As before the failed build's result drained: until then, nothing can preempt the build's lease.
    jest.spyOn(RequestScheduler.prototype, 'markLeasePreemptible').mockImplementation(() => undefined);
    const fixture: DaemonGraphTestFixture = await createEarlyFailureFixtureAsync();
    const hold: string = path.join(fixture.folder, 'hold');
    try {
      await returnEarlyAsync(fixture);

      const custom: ITerminalExchange = await fixture.runAsync(['test', '--to', 'c'], {
        commandOrigin: 'custom'
      });
      expect(getUnsupportedMessage(custom)).not.toContain('rushd stopped');
      expect(fixture.session.operationGraph?.status).toBe(OperationStatus.Executing);
      expect(countRuns(fixture, 'c')).toBe(1);
    } finally {
      jest.restoreAllMocks();
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
        // c was not stopped yet when the client left, so the rejection doesn't say that it was.
        expect(getUnsupportedMessage(cancelled)).not.toContain('rushd stopped');
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
        expect(getUnsupportedMessage(await fixture.runAsync(argv, overrides))).not.toContain('rushd stopped');
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
    // The daemon parses a custom command before it resolves the request, and rejects this one there.
    await expectRestartForRejectedCommandAsync(['test', '--to', 'c'], (custom, change) => {
      const getIdentityAsync: ProductionDaemonRequestResolver['getCommandParameterIdentityAsync'] =
        ProductionDaemonRequestResolver.prototype.getCommandParameterIdentityAsync;
      jest
        .spyOn(ProductionDaemonRequestResolver.prototype, 'getCommandParameterIdentityAsync')
        .mockImplementation(async function (
          this: ProductionDaemonRequestResolver,
          options: IResolveDaemonRequestOptions
        ) {
          if (options.envelope.requestId === custom.requestId) installationChange = change;
          return await getIdentityAsync.call(this, options);
        });
    });
  });

  it('answers a built-in command that it rejects before admission with the restart once the installation changed, and leaves the work that continues running', async () => {
    // The daemon rejects it before admission, since it never serves the command.
    await expectRestartForRejectedCommandAsync(NOT_PHASED, (custom, change) => {
      const getUnsupportedCommandError: ProductionDaemonRequestResolver['getUnsupportedCommandError'] =
        ProductionDaemonRequestResolver.prototype.getUnsupportedCommandError;
      jest
        .spyOn(ProductionDaemonRequestResolver.prototype, 'getUnsupportedCommandError')
        .mockImplementation(function (
          this: ProductionDaemonRequestResolver,
          envelope: IDaemonRequestEnvelope
        ) {
          if (envelope.requestId === custom.requestId) installationChange = change;
          return getUnsupportedCommandError.call(this, envelope);
        });
    });
  });
});
