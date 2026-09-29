// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { readDaemonLockfile, type IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { DaemonRequestWireClient } from './DaemonRequestWireTestUtilities';
import type { LeftBehind, Ownership, Reporter } from './fixtures/LingeringDaemon';
import { createTemporaryRepo } from './TemporaryRepoWorkspaceSession';

const FIXTURE_PATH: string = path.join(__dirname, 'fixtures', 'LingeringDaemon.js');
const POLL_INTERVAL_MS: number = 20;
const START_TIMEOUT_MS: number = 15000;
// Far beyond the 2 s after which the daemon exits anyway, and far below the test's timeout.
const EXIT_TIMEOUT_MS: number = 8000;
// Well past the 2 s after which a daemon that owns its process exits it.
const EMBEDDED_WAIT_MS: number = 3000;
const LINGER_REPORT: RegExp =
  /rushd \(PID (\d+)\) stopped at (\S+), but something kept its process running for 2 s, so it exits now\. Active resources that Node\.js reports: [^\n]*\bTimeout\b/;

interface IProcessExit {
  readonly code: number | undefined;
  readonly signal: NodeJS.Signals | undefined;
}

interface IFixtureDaemon {
  readonly process: ChildProcess;
  readonly exited: Promise<IProcessExit>;
  readonly getStderr: () => string;
}

type StopRoute = 'daemon stop' | 'SIGTERM';

(process.platform === 'win32' ? describe.skip : describe)('a daemon process after the daemon stops', () => {
  let folder: string;
  let repoRoot: string;
  let controlFolder: string;
  let daemon: IFixtureDaemon | undefined;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-process-exit-'));
    repoRoot = path.join(folder, 'repo');
    controlFolder = path.join(folder, 'control');
    createTemporaryRepo(repoRoot);
    fs.mkdirSync(controlFolder);
    fs.mkdirSync(path.join(folder, 'runtime'), { mode: 0o700 });
  });

  afterEach(async () => {
    const startedDaemon: IFixtureDaemon | undefined = daemon;
    daemon = undefined;
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
  });

  function startDaemon(leftBehind: LeftBehind, reporter: Reporter, ownership: Ownership): IFixtureDaemon {
    const child: ChildProcess = spawn(
      process.execPath,
      [FIXTURE_PATH, repoRoot, controlFolder, leftBehind, reporter, ownership],
      {
        // Like a daemon that rush-client launches: the leader of its own process group.
        detached: true,
        env: { ...process.env, RUSHD_RUNTIME_DIR: path.join(folder, 'runtime'), RUSH_TEMP_FOLDER: undefined },
        stdio: ['ignore', 'ignore', 'pipe']
      }
    );
    let stderr: string = '';
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    const exited: Promise<IProcessExit> = new Promise((resolve) => {
      child.once('exit', (code, signal) => resolve({ code: code ?? undefined, signal: signal ?? undefined }));
    });
    daemon = { process: child, exited, getStderr: () => stderr };
    return daemon;
  }

  async function waitForJsonAsync<T>(fixture: IFixtureDaemon, name: string): Promise<T> {
    const filename: string = path.join(controlFolder, name);
    const deadlineMs: number = Date.now() + START_TIMEOUT_MS;
    while (!fs.existsSync(filename)) {
      if (fixture.process.exitCode !== null || Date.now() > deadlineMs) {
        throw new Error(`The fixture did not write ${name}. Its stderr:\n${fixture.getStderr()}`);
      }
      await delayAsync(POLL_INTERVAL_MS);
    }
    return JSON.parse(fs.readFileSync(filename, 'utf8'));
  }

  async function stopAsync(fixture: IFixtureDaemon, paths: IDaemonPaths, route: StopRoute): Promise<void> {
    if (route === 'SIGTERM') {
      fixture.process.kill('SIGTERM');
      return;
    }
    const client: DaemonRequestWireClient = await DaemonRequestWireClient.connectAsync(paths.socketPath);
    try {
      await client.handshakeAsync();
      await client.sendControlAsync({ kind: 'shutdown', payload: {} });
      expect(await client.readControlAsync()).toEqual({
        kind: 'shutdownAck',
        payload: { activeRequests: 0 }
      });
      await client.closed;
    } finally {
      await client.closeAsync();
    }
  }

  /** Resolves with the exit, when the daemon stopped and how long after that the exit came. */
  async function waitForExitAsync(
    fixture: IFixtureDaemon
  ): Promise<IProcessExit & { stoppedAtMs: number; afterStopMs: number }> {
    const { stoppedAtMs } = await waitForJsonAsync<{ stoppedAtMs: number }>(fixture, 'stopped.json');
    const timeout: AbortController = new AbortController();
    const exit: IProcessExit | undefined = await Promise.race([
      fixture.exited,
      delayAsync(EXIT_TIMEOUT_MS, undefined, { signal: timeout.signal }).catch(() => undefined)
    ]);
    timeout.abort();
    if (!exit) {
      throw new Error(
        `The fixture process was still running ${EXIT_TIMEOUT_MS} ms after the daemon stopped. ` +
          `Its stderr:\n${fixture.getStderr()}`
      );
    }
    return { ...exit, stoppedAtMs, afterStopMs: Date.now() - stoppedAtMs };
  }

  /** Checks the report of what kept the process running: its PID, and the time the daemon stopped. */
  function expectLingerReport(fixture: IFixtureDaemon, stoppedAtMs: number): void {
    const match: RegExpExecArray | null = LINGER_REPORT.exec(fixture.getStderr());
    if (!match) {
      throw new Error(`The fixture did not report what kept it running. Its stderr:\n${fixture.getStderr()}`);
    }
    expect(Number(match[1])).toBe(fixture.process.pid);
    // The daemon stopped, and then the fixture wrote stopped.json.
    const reportedStopMs: number = Date.parse(match[2]);
    expect(new Date(reportedStopMs).toISOString()).toBe(match[2]);
    expect(reportedStopMs).toBeLessThanOrEqual(stoppedAtMs);
    expect(stoppedAtMs - reportedStopMs).toBeLessThan(1000);
  }

  it.each<[StopRoute, Reporter, RegExp]>([
    ['daemon stop', 'callbacks', /^fixture log: rushd \(PID \d+\) stopped at /m],
    ['SIGTERM', 'default', /^rushd \(PID \d+\) stopped at /m]
  ])(
    'exits 2 s after %s if a timer that it did not start keeps it running, and logs that (%s)',
    async (route: StopRoute, reporter: Reporter, reportLine: RegExp) => {
      const fixture: IFixtureDaemon = startDaemon('timer', reporter, 'process');
      const { paths } = await waitForJsonAsync<{ paths: IDaemonPaths }>(fixture, 'ready.json');
      await stopAsync(fixture, paths, route);

      const { code, signal, stoppedAtMs, afterStopMs } = await waitForExitAsync(fixture);
      expect({ code, signal }).toEqual({ code: 0, signal: undefined });
      expect(afterStopMs).toBeGreaterThanOrEqual(1900);
      expect(afterStopMs).toBeLessThan(3000);
      expectLingerReport(fixture, stoppedAtMs);
      // A message for the daemon log, through onLog when there is one: not an error, and no stack.
      expect(fixture.getStderr()).toMatch(reportLine);
      expect(fixture.getStderr().match(/kept its process running/g)).toHaveLength(1);
      expect(fixture.getStderr()).not.toMatch(/fixture error: |Error: rushd|^\s+at /m);
      expect(fs.existsSync(paths.socketPath)).toBe(false);
      expect(readDaemonLockfile(paths.lockfilePath)).toBeUndefined();
    },
    30000
  );

  it('keeps the exit code that its caller set when it failed', async () => {
    const fixture: IFixtureDaemon = startDaemon('failing', 'callbacks', 'process');

    const { code, signal, stoppedAtMs, afterStopMs } = await waitForExitAsync(fixture);
    expect({ code, signal }).toEqual({ code: 1, signal: undefined });
    expect(afterStopMs).toBeGreaterThanOrEqual(1900);
    expect(fixture.getStderr()).toMatch(/The fixture failed after it started\./);
    expectLingerReport(fixture, stoppedAtMs);
  }, 30000);

  it('never exits the process when it is embedded, even if a timer keeps the process running', async () => {
    const fixture: IFixtureDaemon = startDaemon('timer', 'callbacks', 'embedded');
    const { paths } = await waitForJsonAsync<{ paths: IDaemonPaths }>(fixture, 'ready.json');
    await stopAsync(fixture, paths, 'daemon stop');
    await waitForJsonAsync<{ stoppedAtMs: number }>(fixture, 'stopped.json');

    await delayAsync(EMBEDDED_WAIT_MS);
    // afterEach ends the fixture process, which only its own timer keeps running now.
    expect({ code: fixture.process.exitCode, signal: fixture.process.signalCode }).toEqual({
      code: null,
      signal: null
    });
    expect(fixture.getStderr()).not.toMatch(/kept its process running/);
    expect(fs.existsSync(paths.socketPath)).toBe(false);
    expect(readDaemonLockfile(paths.lockfilePath)).toBeUndefined();
  }, 30000);

  it('exits as soon as it stops if nothing keeps it running', async () => {
    const fixture: IFixtureDaemon = startDaemon('nothing', 'callbacks', 'process');
    const { paths } = await waitForJsonAsync<{ paths: IDaemonPaths }>(fixture, 'ready.json');
    await stopAsync(fixture, paths, 'daemon stop');

    const { code, signal } = await waitForExitAsync(fixture);
    expect({ code, signal }).toEqual({ code: 0, signal: undefined });
    expect(fixture.getStderr()).not.toMatch(/kept its process running/);
    expect(fs.existsSync(paths.socketPath)).toBe(false);
    expect(readDaemonLockfile(paths.lockfilePath)).toBeUndefined();
  }, 30000);
});
