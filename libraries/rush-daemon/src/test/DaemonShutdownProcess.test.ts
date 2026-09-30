// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { LockFile } from '@rushstack/node-core-library';
import { readDaemonLockfile, type IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { DEFAULT_SHUTDOWN_DEADLINE_MS } from '../serveRushDaemon';
import { createWireEnvelope, DaemonRequestWireClient } from './DaemonRequestWireTestUtilities';
import { createDaemonTestRuntimeBase } from './DaemonTestRuntimeBase';
import { createTemporaryRepo } from './TemporaryRepoWorkspaceSession';
import {
  captureTestProcessIdentity,
  isTestProcessRunning,
  type ITestProcessIdentity
} from './TestProcessExit';

const FIXTURE_PATH: string = path.join(__dirname, 'fixtures', 'StuckShutdownDaemon.js');
const REQUEST_ID: string = 'stuck-request';
const POLL_INTERVAL_MS: number = 20;
const START_TIMEOUT_MS: number = 15000;

interface IProcessExit {
  readonly code: number | undefined;
  readonly signal: NodeJS.Signals | undefined;
}

interface IStuckDaemon {
  readonly process: ChildProcess;
  readonly pid: number;
  readonly exited: Promise<IProcessExit>;
  readonly getStderr: () => string;
}

interface IStuckRequest {
  readonly client: DaemonRequestWireClient;
  readonly paths: IDaemonPaths;
  readonly operation: ITestProcessIdentity;
  readonly repoLockPath: string;
}

// A daemon process whose request ignores its abort signal, as one that waits for another process's lock does.
(process.platform === 'win32' ? describe.skip : describe)('a daemon process whose shutdown is stuck', () => {
  let folder: string;
  let runtimeBase: string;
  let repoRoot: string;
  let commonTempFolder: string;
  let controlFolder: string;
  let daemon: IStuckDaemon | undefined;
  let client: DaemonRequestWireClient | undefined;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-stuck-shutdown-'));
    runtimeBase = createDaemonTestRuntimeBase();
    repoRoot = path.join(folder, 'repo');
    controlFolder = path.join(folder, 'control');
    commonTempFolder = createTemporaryRepo(repoRoot);
    fs.mkdirSync(controlFolder);
  });

  afterEach(async () => {
    const openClient: DaemonRequestWireClient | undefined = client;
    const startedDaemon: IStuckDaemon | undefined = daemon;
    client = undefined;
    daemon = undefined;
    await openClient?.closeAsync();
    // Only the fixture process that this test started, if a failed test left it running.
    if (
      startedDaemon &&
      startedDaemon.process.exitCode === null &&
      startedDaemon.process.signalCode === null
    ) {
      startedDaemon.process.kill('SIGKILL');
      await startedDaemon.exited;
    }
    fs.rmSync(folder, { force: true, recursive: true });
    fs.rmSync(runtimeBase, { force: true, recursive: true });
  });

  async function waitForJsonAsync<T>(stuckDaemon: IStuckDaemon, name: string): Promise<T> {
    const filename: string = path.join(controlFolder, name);
    const deadlineMs: number = Date.now() + START_TIMEOUT_MS;
    while (!fs.existsSync(filename)) {
      if (stuckDaemon.process.exitCode !== null || Date.now() > deadlineMs) {
        throw new Error(`The fixture did not write ${name}. Its stderr:\n${stuckDaemon.getStderr()}`);
      }
      await delayAsync(POLL_INTERVAL_MS);
    }
    return JSON.parse(fs.readFileSync(filename, 'utf8'));
  }

  function startDaemon(shutdownDeadlineMs: number | 'default'): IStuckDaemon {
    const child: ChildProcess = spawn(
      process.execPath,
      [FIXTURE_PATH, repoRoot, controlFolder, String(shutdownDeadlineMs)],
      {
        // Like a daemon that rush-client launches: the leader of its own process group.
        detached: true,
        env: { ...process.env, RUSHD_RUNTIME_DIR: runtimeBase, RUSH_TEMP_FOLDER: undefined },
        stdio: ['ignore', 'ignore', 'pipe']
      }
    );
    let stderr: string = '';
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    const exited: Promise<IProcessExit> = new Promise((resolve) => {
      child.once('exit', (code, signal) => resolve({ code: code ?? undefined, signal: signal ?? undefined }));
    });
    if (child.pid === undefined) throw new Error('The fixture did not start.');
    daemon = { process: child, pid: child.pid, exited, getStderr: () => stderr };
    return daemon;
  }

  async function startStuckRequestAsync(stuckDaemon: IStuckDaemon): Promise<IStuckRequest> {
    const { paths } = await waitForJsonAsync<{ paths: IDaemonPaths }>(stuckDaemon, 'ready.json');
    const requestClient: DaemonRequestWireClient = await DaemonRequestWireClient.connectAsync(
      paths.socketPath
    );
    client = requestClient;
    await requestClient.handshakeAsync();
    await requestClient.sendControlAsync({
      kind: 'requestStart',
      payload: createWireEnvelope(REQUEST_ID, 'build', repoRoot, { argv: ['build', '-t', 'mini-a'] })
    });
    const { operationPid } = await waitForJsonAsync<{ operationPid: number }>(stuckDaemon, 'request.json');
    const repoLockPath: string = LockFile.getLockFilePath(commonTempFolder, 'rush', stuckDaemon.pid);
    expect(fs.existsSync(repoLockPath)).toBe(true);
    return {
      client: requestClient,
      paths,
      operation: captureTestProcessIdentity(operationPid),
      repoLockPath
    };
  }

  function expectReleased(request: IStuckRequest): void {
    // SubprocessTerminator killed the operation on the first signal, so there was nothing left to reap.
    expect(isTestProcessRunning(request.operation)).toBe(false);
    expect(fs.existsSync(request.paths.socketPath)).toBe(false);
    expect(readDaemonLockfile(request.paths.lockfilePath)).toBeUndefined();
    expect(fs.existsSync(request.repoLockPath)).toBe(false);
  }

  it('exits at its deadline, after its request gets a typed result, and releases what it owned', async () => {
    const stuckDaemon: IStuckDaemon = startDaemon(6000);
    const request: IStuckRequest = await startStuckRequestAsync(stuckDaemon);
    const signaledAtMs: number = Date.now();
    // SubprocessTerminator sends this signal to the daemon again; that copy must not force the exit.
    stuckDaemon.process.kill('SIGTERM');

    // The fixture's request is stuck in its resolver, so it never started, and its result says that it was queued.
    expect((await request.client.readTerminalAsync(REQUEST_ID)).terminal).toEqual({
      kind: 'requestResult',
      payload: {
        aborted: true,
        errorMessage:
          'The Rush daemon was shut down (the daemon process received SIGTERM) while this request was ' +
          'queued; it did not start. Re-run the command.',
        exitCode: 1,
        outcome: 'failure',
        requestId: REQUEST_ID
      }
    });
    expect(await stuckDaemon.exited).toEqual({ code: 1, signal: undefined });
    expect(Date.now() - signaledAtMs).toBeGreaterThanOrEqual(5900);
    expect(stuckDaemon.getStderr()).toMatch(
      /The Rush daemon's shutdown did not finish within 6\.\d s, while waiting for requests to finish\. Unfinished requests: "build -t mini-a" \(running for \d+\.\d s\)\. The daemon released its socket, lockfile and repository lock, and exits\./
    );
    expectReleased(request);
  }, 30000);

  it('exits at the default deadline when it has none of its own', async () => {
    const stuckDaemon: IStuckDaemon = startDaemon('default');
    const request: IStuckRequest = await startStuckRequestAsync(stuckDaemon);
    const signaledAtMs: number = Date.now();
    stuckDaemon.process.kill('SIGTERM');

    expect(await stuckDaemon.exited).toEqual({ code: 1, signal: undefined });
    expect(Date.now() - signaledAtMs).toBeGreaterThanOrEqual(DEFAULT_SHUTDOWN_DEADLINE_MS - 100);
    expect(stuckDaemon.getStderr()).toMatch(
      /The Rush daemon's shutdown did not finish within 10\.\d s, while waiting for requests to finish\./
    );
    await request.client.closed;
    expectReleased(request);
  }, 40000);

  it('exits at once on a second signal', async () => {
    // Far beyond the test's timeout, so only the second signal can end the shutdown in time.
    const stuckDaemon: IStuckDaemon = startDaemon(60000);
    const request: IStuckRequest = await startStuckRequestAsync(stuckDaemon);
    stuckDaemon.process.kill('SIGTERM');
    await delayAsync(1500);
    stuckDaemon.process.kill('SIGTERM');

    expect(await stuckDaemon.exited).toEqual({ code: 1, signal: undefined });
    expect(stuckDaemon.getStderr()).toMatch(
      /The Rush daemon's shutdown was cut short by a second SIGTERM after \d+\.\d s, while waiting for requests to finish\. Unfinished requests: "build -t mini-a" \(running for \d+\.\d s\)\. The daemon released its socket, lockfile and repository lock, and exits\./
    );
    await request.client.closed;
    expectReleased(request);
  }, 30000);
});
