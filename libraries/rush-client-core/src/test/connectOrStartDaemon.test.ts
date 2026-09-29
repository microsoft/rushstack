// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { FileSystem } from '@rushstack/node-core-library';
import type { IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';
import {
  readDaemonLockfile,
  type IDaemonLockfile,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';

import { DaemonClient, type DaemonClientOutcome } from '../DaemonClient';
import { DAEMON_DISCONNECTED_MESSAGE, DaemonClientError } from '../DaemonClientError';
import { captureDaemonRequest } from '../captureDaemonRequest';
import { getDaemonLogFilePath } from '../DaemonLogFile';
import { resetDaemonArtifactsAsync } from '../DaemonOwnership';
import {
  connectOrStartDaemonAsync,
  connectToPlannedSuccessorAsync,
  requestDaemonShutdownAsync,
  resolveDaemonStartupReservationAsync,
  type IConnectOrStartDaemonOptions,
  type IDaemonStartCommand
} from '../connectOrStartDaemon';
import {
  DaemonRestartFailedError,
  executeWithDaemonRestartAsync,
  type IDaemonRestartNotice
} from '../executeWithDaemonRestart';
import {
  getDaemonStartupFilePath,
  readDaemonStartupReservation,
  releaseDaemonStartup,
  reserveDaemonStartup,
  type IDaemonStartupReservation
} from '../DaemonStartup';
import {
  inspectDaemonStartupReservation,
  tryTakeOverAbandonedStartupReservationAsync
} from '../DaemonStartupReservation';
import { tryAcquireStartupLockAsync, type IStartupLock } from '../StartupLock';
import { removeTestFolderAsync, waitForTestProcessExitAsync } from './TestProcessExit';

/** How long after a launch a client may take over its reservation once the helper exited. */
const RELAUNCH_DELAY_MS: number = 15000;

function readIfPresent(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

describe('detached daemon startup', () => {
  let folder: string;
  let paths: IDaemonPaths;
  let options: IConnectOrStartDaemonOptions;
  let starterProcesses: ChildProcess[];

  beforeEach(() => {
    starterProcesses = [];
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-'));
    paths = {
      runtimeDir: folder,
      socketPath:
        process.platform === 'win32'
          ? `\\\\.\\pipe\\rush-client-${path.basename(folder)}`
          : path.join(folder, 'd.sock'),
      lockfilePath: path.join(folder, 'daemon.pid.json')
    };
    const environment = captureDaemonRequest({
      argv: [],
      commandName: 'test',
      commandOrigin: 'custom',
      cwd: folder,
      environment: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
      terminal: { isTTY: false, supportsColor: false }
    }).environment;
    options = {
      paths,
      expectedDaemonVersion: 'fixture',
      startupTimeoutMs: 7000,
      startCommand: {
        command: process.execPath,
        args: [path.join(__dirname, 'fixtures/daemon.js'), JSON.stringify(paths)],
        cwd: folder,
        environment
      }
    };
  });

  afterEach(async () => {
    for (const starter of starterProcesses) {
      if (starter.exitCode === null && starter.signalCode === null) {
        const closed: Promise<unknown[]> = once(starter, 'close');
        starter.kill('SIGKILL');
        await closed;
      }
    }
    if (fs.existsSync(path.join(folder, 'starts'))) {
      fs.writeFileSync(path.join(folder, 'stop'), '');
      const pids: string[] = fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n');
      await Promise.all(pids.map((pid) => waitForTestProcessExitAsync(Number(pid))));
      expect(pids.every((pid) => fs.existsSync(path.join(folder, `stopped-${pid}`)))).toBe(true);
    }
    // A test that expects a fixture daemon to fail checks and removes this record.
    expect(readIfPresent(path.join(folder, 'failures'))).toBe('');
    if (fs.existsSync(path.join(folder, 'parents'))) {
      const parents = new Set(fs.readFileSync(path.join(folder, 'parents'), 'utf8').trim().split('\n'));
      await Promise.all([...parents].map((pid) => waitForTestProcessExitAsync(Number(pid))));
    }
    await removeTestFolderAsync(folder);
  });

  function startClient(startOptions: IConnectOrStartDaemonOptions = options): {
    child: ChildProcess;
    result: Promise<{ code: number | null; stderr: string }>;
  } {
    const child: ChildProcess = spawn(
      process.execPath,
      [path.join(__dirname, 'fixtures/starter.js'), JSON.stringify(startOptions)],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    starterProcesses.push(child);
    let stderr: string = '';
    child.stderr!.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    return {
      child,
      result: once(child, 'close').then(([code]) => ({ code, stderr }))
    };
  }

  async function leaveStaleSocketAsync(): Promise<void> {
    // A listener killed without cleanup leaves a bound-nowhere socket file behind.
    const child: ChildProcess = spawn(
      process.execPath,
      [
        '-e',
        `require('net').createServer().listen(${JSON.stringify(paths.socketPath)}, () => process.kill(process.pid, 'SIGKILL'))`
      ],
      { stdio: 'ignore' }
    );
    await once(child, 'close');
  }

  async function killStarterBeforeBindAsync(): Promise<number> {
    fs.writeFileSync(path.join(folder, 'hold-prebind'), '');
    const starter = startClient();
    const barrier: string = path.join(folder, 'prebind');
    const deadline: number = Date.now() + 5000;
    while (!fs.existsSync(barrier) && Date.now() < deadline) await delayAsync(20);
    expect(fs.existsSync(barrier)).toBe(true);
    expect(fs.existsSync(paths.lockfilePath)).toBe(false);
    const daemonPid: number = Number(fs.readFileSync(barrier, 'utf8'));
    expect(Number.isSafeInteger(daemonPid)).toBe(true);
    expect(daemonPid).toBeGreaterThan(0);
    expect(starter.child.kill('SIGKILL')).toBe(true);
    expect((await starter.result).code).not.toBe(0);
    expect(starter.child.signalCode).toBe('SIGKILL');
    return daemonPid;
  }

  async function getExitedPidAsync(): Promise<number> {
    const exited: ChildProcess = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    await once(exited, 'close');
    return exited.pid!;
  }

  function writeReservation(helperPid: number, helperStartedAt: string = new Date().toISOString()): string {
    const contents: string = JSON.stringify({ token: randomUUID(), helperPid, helperStartedAt });
    fs.writeFileSync(getDaemonStartupFilePath(paths), contents);
    return contents;
  }

  /** Records the reservation's launch as one relaunch delay earlier, so that its relaunch time has passed. */
  function ageReservation(): string {
    const record: { helperStartedAt: string } = JSON.parse(
      fs.readFileSync(getDaemonStartupFilePath(paths), 'utf8')
    );
    const helperStartedAt: string = new Date(
      Date.parse(record.helperStartedAt) - RELAUNCH_DELAY_MS
    ).toISOString();
    const contents: string = JSON.stringify({ ...record, helperStartedAt });
    fs.writeFileSync(getDaemonStartupFilePath(paths), contents);
    return helperStartedAt;
  }

  function readTakeOverLines(): string[] {
    return readIfPresent(getDaemonLogFilePath(paths))
      .split('\n')
      .filter((line) => line.includes('took over the startup reservation'));
  }

  /** Unlike waitForTestProcessExitAsync, a zombie does not count: until it is reaped, its PID looks alive. */
  async function waitForProcessGoneAsync(pid: number): Promise<void> {
    const deadline: number = Date.now() + 5000;
    while (true) {
      try {
        process.kill(pid, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') return;
        throw error;
      }
      if (Date.now() >= deadline) throw new Error(`Process ${pid} was not reaped in time.`);
      await delayAsync(10);
    }
  }

  async function waitForFileAsync(filePath: string): Promise<string> {
    const deadline: number = Date.now() + 5000;
    while (!fs.existsSync(filePath) && Date.now() < deadline) await delayAsync(20);
    return fs.readFileSync(filePath, 'utf8');
  }

  /**
   * Leaves a daemon held before it listens, whose startup helper was killed after its client gave up, and a
   * reservation whose relaunch time has passed.
   */
  async function abandonStartupBeforeBindAsync(): Promise<{ daemonPid: number; helperPid: number }> {
    fs.writeFileSync(path.join(folder, 'hold-prebind'), '');
    await expect(connectOrStartDaemonAsync({ ...options, startupTimeoutMs: 1000 })).rejects.toThrow(
      'timed out awaiting hello/ping readiness'
    );
    const daemonPid: number = Number(await waitForFileAsync(path.join(folder, 'prebind')));
    const { helperPid } = JSON.parse(fs.readFileSync(getDaemonStartupFilePath(paths), 'utf8'));
    expect(fs.readFileSync(path.join(folder, 'parents'), 'utf8')).toBe(`${helperPid}\n`);
    // This test started the helper (through connectOrStartDaemonAsync), so it may signal that PID.
    process.kill(helperPid, 'SIGKILL');
    await waitForProcessGoneAsync(helperPid);
    expect(inspectDaemonStartupReservation(paths)).toMatchObject({ helperPid, helperState: 'exited' });
    ageReservation();
    return { daemonPid, helperPid };
  }

  /** The start command of a second fixture daemon, which waits before it listens while "hold-prebind-b" exists. */
  function getSecondDaemonOptions(): IConnectOrStartDaemonOptions {
    const startCommand: IDaemonStartCommand = options.startCommand!;
    return {
      ...options,
      startCommand: {
        ...startCommand,
        environment: { ...startCommand.environment, FIXTURE_HOLD_PREBIND: 'hold-prebind-b' }
      }
    };
  }

  /** Waits for the fixture daemon that lost the race for the endpoint to exit, and checks why it failed. */
  async function expectLostEndpointRaceAsync(loserPid: number, winnerPid: number): Promise<void> {
    await waitForTestProcessExitAsync(loserPid);
    const failuresPath: string = path.join(folder, 'failures');
    expect(readIfPresent(failuresPath)).toMatch(
      new RegExp(`^${loserPid} (Daemon process ${winnerPid} still owns |A live daemon already listens at )`)
    );
    expect(readIfPresent(failuresPath).trim().split('\n')).toHaveLength(1);
    fs.unlinkSync(failuresPath);
  }

  async function startFixtureDaemonAsync(): Promise<number> {
    const client: DaemonClient = await connectOrStartDaemonAsync(options);
    const { pid } = await client.status;
    await client.closeAsync();
    expect(fs.existsSync(getDaemonStartupFilePath(paths))).toBe(false);
    return pid!;
  }

  it('fails closed for successor starters while the original detached daemon remains pre-bind', async () => {
    const daemonPid: number = await killStarterBeforeBindAsync();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => startClient({ ...options, startupTimeoutMs: 700 }).result)
    );
    expect(results.every(({ code }) => code !== 0)).toBe(true);
    // The helper is alive, so the client that holds the start lock waits for it until its own deadline.
    expect(
      results.some(({ stderr }) => stderr.includes('is still waiting for the daemon to become ready'))
    ).toBe(true);
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8')).toBe(`${daemonPid}\n`);
    expect(fs.existsSync(paths.lockfilePath)).toBe(false);

    fs.unlinkSync(path.join(folder, 'hold-prebind'));
    const client = await connectOrStartDaemonAsync(options);
    expect((await client.status).pid).toBe(daemonPid);
    await client.closeAsync();
  }, 15000);

  it('hands startup to the detached owner after the first client dies and reuses exactly one daemon', async () => {
    const daemonPid: number = await killStarterBeforeBindAsync();
    const successors = Array.from({ length: 4 }, () => startClient());
    fs.unlinkSync(path.join(folder, 'hold-prebind'));
    expect(await Promise.all(successors.map(({ result }) => result))).toEqual(
      Array.from({ length: 4 }, () => ({ code: 0, stderr: '' }))
    );
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8')).toBe(`${daemonPid}\n`);
    const client = await DaemonClient.connectAsync({
      socketPath: paths.socketPath,
      expectedDaemonVersion: 'fixture'
    });
    expect((await client.status).pid).toBe(daemonPid);
    await client.closeAsync();
    expect(fs.existsSync(getDaemonStartupFilePath(paths))).toBe(false);
  }, 15000);

  it('lets the detached helper finish a startup that outlasts the requesting client', async () => {
    fs.writeFileSync(path.join(folder, 'hold-prebind'), '');
    const first = startClient({ ...options, startupTimeoutMs: 1000 });
    const barrier: string = path.join(folder, 'prebind');
    const deadline: number = Date.now() + 5000;
    while (!fs.existsSync(barrier) && Date.now() < deadline) await delayAsync(20);
    const daemonPid: number = Number(fs.readFileSync(barrier, 'utf8'));
    expect((await first.result).code).not.toBe(0);
    expect(fs.existsSync(getDaemonStartupFilePath(paths))).toBe(true);

    // The launcher becomes ready only after the first client has given up.
    fs.unlinkSync(path.join(folder, 'hold-prebind'));
    const client = await connectOrStartDaemonAsync(options);
    expect((await client.status).pid).toBe(daemonPid);
    await client.closeAsync();
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8')).toBe(`${daemonPid}\n`);
    expect(fs.existsSync(getDaemonStartupFilePath(paths))).toBe(false);
  }, 15000);

  it('preserves an unresolved startup reservation rather than trusting or reclaiming its contents', async () => {
    const startupPath: string = getDaemonStartupFilePath(paths);
    const contents: string = JSON.stringify({ pid: process.pid, startedAt: 'not an ownership contract' });
    fs.writeFileSync(startupPath, contents);
    const { result } = startClient({ ...options, startupTimeoutMs: 200 });
    expect(await result).toMatchObject({
      code: 1,
      stderr: expect.stringContaining('unresolved startup handoff')
    });
    expect((await result).stderr).toContain('daemon stop --force');
    expect(fs.readFileSync(startupPath, 'utf8')).toBe(contents);
    expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
  });

  it('does not infer safe retry from a launcher exiting before ownership publication', async () => {
    const startupPath: string = getDaemonStartupFilePath(paths);
    const failing: IConnectOrStartDaemonOptions = {
      ...options,
      startCommand: { ...options.startCommand!, args: [path.join(folder, 'missing-entry.js')] }
    };
    await expect(connectOrStartDaemonAsync(failing)).rejects.toThrow('Unable to start');
    const contents: string = fs.readFileSync(startupPath, 'utf8');
    await expect(connectOrStartDaemonAsync({ ...options, startupTimeoutMs: 100 })).rejects.toThrow(
      'unresolved startup handoff'
    );
    expect(fs.readFileSync(startupPath, 'utf8')).toBe(contents);
    expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
  });

  it('refuses another launch at once after the startup helper exited, until the relaunch time', async () => {
    const startupPath: string = getDaemonStartupFilePath(paths);
    const failing: IConnectOrStartDaemonOptions = {
      ...options,
      startCommand: { ...options.startCommand!, args: [path.join(folder, 'missing-entry.js')] }
    };
    await expect(connectOrStartDaemonAsync(failing)).rejects.toThrow('Unable to start');
    const contents: string = fs.readFileSync(startupPath, 'utf8');
    const { helperPid, helperStartedAt } = JSON.parse(contents);
    const relaunchAfter: string = new Date(Date.parse(helperStartedAt) + RELAUNCH_DELAY_MS).toISOString();
    expect(inspectDaemonStartupReservation(paths)).toEqual({
      path: startupPath,
      helperPid,
      helperState: 'exited',
      relaunchAfter
    });
    const started: number = Date.now();
    const error: Error = await connectOrStartDaemonAsync({ ...options, startupTimeoutMs: 20000 }).then(
      () => new Error('Expected startup to be refused.'),
      (refusal: Error) => refusal
    );
    expect(Date.now() - started).toBeLessThan(3000);
    expect(error.message).toContain(
      `unresolved startup handoff at ${startupPath}: its startup helper (PID ${helperPid}) exited before the daemon became ready; refusing another launch until ${relaunchAfter}, so that a daemon that cannot start is not launched by every command.`
    );
    expect(error.message).not.toContain('..');
    expect(fs.readFileSync(startupPath, 'utf8')).toBe(contents);
    expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
    expect(readTakeOverLines()).toEqual([]);

    // Once the relaunch time has passed, the next client takes the reservation over and starts the daemon.
    const agedStartedAt: string = ageReservation();
    const daemonPid: number = await startFixtureDaemonAsync();
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8')).toBe(`${daemonPid}\n`);
    const takeOvers: string[] = readTakeOverLines();
    expect(takeOvers).toHaveLength(1);
    expect(takeOvers[0]).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z rush-client /);
    expect(takeOvers[0]).toContain(
      `rush-client (PID ${process.pid}): took over the startup reservation of startup helper PID ${helperPid} (started ${agedStartedAt}), which exited before the daemon became ready; starting the daemon again.`
    );
  });

  it('reports at once a daemon that became ready but was stopped before this client connected', async () => {
    // The daemon reports another version, so every connect by this client misses its ready window; the helper,
    // which does not check the version, sees it ready. The daemon then stops like one reached by "daemon stop".
    const started: number = Date.now();
    const error: Error = await connectOrStartDaemonAsync({
      ...options,
      startupTimeoutMs: 6000,
      startCommand: {
        ...options.startCommand!,
        args: [...options.startCommand!.args, 'other', 'stop-when-ready']
      }
    }).then(
      () => new Error('Expected startup to fail.'),
      (failure: Error) => failure
    );
    expect(error.message).toContain(
      'Daemon startup failed: the daemon became ready but exited before this client connected'
    );
    expect(Date.now() - started).toBeLessThan(3500);
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
    expect(fs.existsSync(paths.lockfilePath)).toBe(false);
    expect(fs.existsSync(getDaemonStartupFilePath(paths))).toBe(false);
  }, 15000);

  it('refuses a relaunch while a process accepts connections at the endpoint', async () => {
    const sockets: Set<net.Socket> = new Set();
    // Accepts connections but never completes hello, like a daemon that listens but is not ready.
    const server: net.Server = net.createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    await new Promise<void>((resolve) => server.listen(paths.socketPath, resolve));
    try {
      const helperPid: number = await getExitedPidAsync();
      const contents: string = writeReservation(
        helperPid,
        new Date(Date.now() - 2 * RELAUNCH_DELAY_MS).toISOString()
      );
      const started: number = Date.now();
      const error: Error = await connectOrStartDaemonAsync({
        ...options,
        startupTimeoutMs: 1500,
        timeoutMs: 200
      }).then(
        () => new Error('Expected startup to be refused.'),
        (refusal: Error) => refusal
      );
      // It keeps checking until the deadline, since that process may still become ready.
      expect(Date.now() - started).toBeGreaterThanOrEqual(1400);
      expect(error.message).toContain(
        `its startup helper (PID ${helperPid}) exited before the daemon became ready, but a process still accepts connections at ${paths.socketPath}; refusing another launch.`
      );
      expect(error.message).toContain('daemon stop --force');
      expect(fs.readFileSync(getDaemonStartupFilePath(paths), 'utf8')).toBe(contents);
      expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
      expect(readTakeOverLines()).toEqual([]);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('never takes over a reservation whose startup helper still runs, however old', async () => {
    // Recorded when this process started, so the reservation names this process, which still runs.
    const helperStartedAt: number = performance.timeOrigin;
    const age: number = Date.now() - helperStartedAt;
    if (age <= RELAUNCH_DELAY_MS + 1000) await delayAsync(RELAUNCH_DELAY_MS + 1000 - age);
    const contents: string = writeReservation(process.pid, new Date(helperStartedAt).toISOString());
    expect(inspectDaemonStartupReservation(paths)).toMatchObject({ helperState: 'running' });
    await expect(connectOrStartDaemonAsync({ ...options, startupTimeoutMs: 500 })).rejects.toThrow(
      `its startup helper (PID ${process.pid}) is still waiting for the daemon to become ready; refusing another launch`
    );
    expect(fs.readFileSync(getDaemonStartupFilePath(paths), 'utf8')).toBe(contents);
    expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
    expect(readTakeOverLines()).toEqual([]);
  }, 30000);

  it('takes over only the reservation that it found abandoned, not one that replaced it since', async () => {
    const startupPath: string = getDaemonStartupFilePath(paths);
    writeReservation(await getExitedPidAsync(), new Date(Date.now() - 2 * RELAUNCH_DELAY_MS).toISOString());
    const abandoned: IDaemonStartupReservation = readDaemonStartupReservation(paths)!;
    // After the caller read it, the reservation was replaced by one whose helper still runs.
    const replacement: string = writeReservation(process.pid);
    expect(await tryTakeOverAbandonedStartupReservationAsync(paths, abandoned)).toBe(false);
    expect(fs.readFileSync(startupPath, 'utf8')).toBe(replacement);

    // Unchanged, the same reservation is taken over.
    fs.writeFileSync(startupPath, abandoned.contents!);
    expect(await tryTakeOverAbandonedStartupReservationAsync(paths, abandoned)).toBe(true);
    expect(fs.existsSync(startupPath)).toBe(false);
    expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
  });

  it('lets exactly one of several clients take over a reservation whose helper exited', async () => {
    const helperPid: number = await getExitedPidAsync();
    writeReservation(helperPid, new Date(Date.now() - 2 * RELAUNCH_DELAY_MS).toISOString());
    const results = await Promise.all(Array.from({ length: 4 }, () => startClient().result));
    expect(results).toEqual(Array.from({ length: 4 }, () => ({ code: 0, stderr: '' })));
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
    expect(fs.existsSync(getDaemonStartupFilePath(paths))).toBe(false);
    const takeOvers: string[] = readTakeOverLines();
    expect(takeOvers).toHaveLength(1);
    expect(takeOvers[0]).toContain(`took over the startup reservation of startup helper PID ${helperPid} `);
  }, 15000);

  it('keeps one daemon when a relaunch outpaces the daemon of a killed startup helper', async () => {
    const { daemonPid, helperPid } = await abandonStartupBeforeBindAsync();
    const client: DaemonClient = await connectOrStartDaemonAsync(getSecondDaemonOptions());
    let successorPid: number;
    try {
      successorPid = (await client.status).pid!;
    } finally {
      await client.closeAsync();
    }
    expect(successorPid).not.toBe(daemonPid);
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8')).toBe(`${daemonPid}\n${successorPid}\n`);
    expect(fs.existsSync(getDaemonStartupFilePath(paths))).toBe(false);
    expect(readTakeOverLines()).toHaveLength(1);
    expect(readTakeOverLines()[0]).toContain(`startup helper PID ${helperPid} `);

    // The first daemon finds the successor at the endpoint and exits.
    fs.unlinkSync(path.join(folder, 'hold-prebind'));
    await expectLostEndpointRaceAsync(daemonPid, successorPid);
    const next: DaemonClient = await connectOrStartDaemonAsync(options);
    try {
      expect((await next.status).pid).toBe(successorPid);
    } finally {
      await next.closeAsync();
    }
  }, 20000);

  it('keeps one daemon when the daemon of a killed startup helper outpaces the relaunch', async () => {
    const { daemonPid } = await abandonStartupBeforeBindAsync();
    fs.writeFileSync(path.join(folder, 'hold-prebind-b'), '');
    const relaunch: Promise<DaemonClient> = connectOrStartDaemonAsync(getSecondDaemonOptions());
    const successorPid: number = Number(await waitForFileAsync(path.join(folder, 'prebind-b')));
    expect(successorPid).not.toBe(daemonPid);

    // The first daemon publishes the endpoint first, so the relaunch's helper finds it ready.
    fs.unlinkSync(path.join(folder, 'hold-prebind'));
    const client: DaemonClient = await relaunch;
    try {
      expect((await client.status).pid).toBe(daemonPid);
    } finally {
      await client.closeAsync();
    }
    expect(fs.existsSync(getDaemonStartupFilePath(paths))).toBe(false);

    fs.unlinkSync(path.join(folder, 'hold-prebind-b'));
    await expectLostEndpointRaceAsync(successorPid, daemonPid);
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8')).toBe(`${daemonPid}\n${successorPid}\n`);
    const next: DaemonClient = await connectOrStartDaemonAsync(options);
    try {
      expect((await next.status).pid).toBe(daemonPid);
    } finally {
      await next.closeAsync();
    }
  }, 20000);

  it.each(['legacy', 'exited helper', 'no auto-start'])(
    'uses and resolves a ready daemon next to a retained startup reservation (%s)',
    async (kind) => {
      const daemonPid: number = await startFixtureDaemonAsync();
      if (kind === 'legacy') {
        fs.writeFileSync(getDaemonStartupFilePath(paths), randomUUID());
      } else {
        writeReservation(await getExitedPidAsync());
      }
      const started: number = Date.now();
      const client: DaemonClient = await connectOrStartDaemonAsync(
        kind === 'no auto-start' ? { paths, expectedDaemonVersion: 'fixture' } : options
      );
      try {
        expect((await client.status).pid).toBe(daemonPid);
      } finally {
        await client.closeAsync();
      }
      expect(Date.now() - started).toBeLessThan(3000);
      expect(fs.existsSync(getDaemonStartupFilePath(paths))).toBe(false);
      expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8')).toBe(`${daemonPid}\n`);
    }
  );

  it('resolves a retained startup reservation before replacing a mismatched ready daemon', async () => {
    const daemonPid: number = await startFixtureDaemonAsync();
    fs.writeFileSync(getDaemonStartupFilePath(paths), randomUUID());
    const replacement: DaemonClient = await connectOrStartDaemonAsync({
      ...options,
      expectedDaemonVersion: 'replacement',
      startCommand: { ...options.startCommand!, args: [...options.startCommand!.args, 'replacement'] }
    });
    try {
      const status = await replacement.status;
      expect(status.daemonVersion).toBe('replacement');
      expect(status.pid).not.toBe(daemonPid);
    } finally {
      await replacement.closeAsync();
    }
    expect(fs.existsSync(getDaemonStartupFilePath(paths))).toBe(false);
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(2);
  });

  it('keeps a startup reservation next to a ready daemon that is not the attested owner', async () => {
    await startFixtureDaemonAsync();
    const owner: string = fs.readFileSync(paths.lockfilePath, 'utf8');
    fs.writeFileSync(paths.lockfilePath, JSON.stringify({ ...JSON.parse(owner), pid: process.pid }));
    const contents: string = writeReservation(await getExitedPidAsync());
    try {
      await expect(connectOrStartDaemonAsync({ ...options, startupTimeoutMs: 2000 })).rejects.toThrow(
        'unresolved startup handoff'
      );
      await expect(connectOrStartDaemonAsync({ paths, expectedDaemonVersion: 'fixture' })).rejects.toThrow(
        'auto-start is disabled'
      );
      expect(fs.readFileSync(getDaemonStartupFilePath(paths), 'utf8')).toBe(contents);
    } finally {
      fs.writeFileSync(paths.lockfilePath, owner);
    }
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
  });

  it('resolves a retained startup reservation before shutdown so that a successor can start', async () => {
    const daemonPid: number = await startFixtureDaemonAsync();
    writeReservation(await getExitedPidAsync());
    const running: DaemonClient = await DaemonClient.connectAsync({ socketPath: paths.socketPath });
    const previousDaemon = await requestDaemonShutdownAsync(running, paths).finally(() =>
      running.closeAsync()
    );
    expect(previousDaemon.pid).toBe(daemonPid);
    expect(fs.existsSync(getDaemonStartupFilePath(paths))).toBe(false);
    const successor: DaemonClient = await connectOrStartDaemonAsync({ ...options, previousDaemon });
    try {
      expect((await successor.status).pid).not.toBe(daemonPid);
    } finally {
      await successor.closeAsync();
    }
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(2);
  });

  it('does not request shutdown while the start lock keeps a startup reservation unresolved', async () => {
    const daemonPid: number = await startFixtureDaemonAsync();
    const contents: string = writeReservation(await getExitedPidAsync());
    const lock: IStartupLock | undefined = await tryAcquireStartupLockAsync(paths);
    expect(lock).toBeDefined();
    const running: DaemonClient = await DaemonClient.connectAsync({ socketPath: paths.socketPath });
    try {
      await expect(requestDaemonShutdownAsync(running, paths, 300)).rejects.toThrow('shutdown was not sent');
    } finally {
      await running.closeAsync();
      await lock!.releaseAsync();
    }
    expect(fs.readFileSync(getDaemonStartupFilePath(paths), 'utf8')).toBe(contents);
    const client: DaemonClient = await connectOrStartDaemonAsync(options);
    try {
      expect((await client.status).pid).toBe(daemonPid);
    } finally {
      await client.closeAsync();
    }
    expect(fs.existsSync(getDaemonStartupFilePath(paths))).toBe(false);
  });

  it('resolves a startup reservation before a plain stop only for the attested ready daemon', async () => {
    const daemonPid: number = await startFixtureDaemonAsync();
    const running: DaemonClient = await DaemonClient.connectAsync({ socketPath: paths.socketPath });
    try {
      await expect(resolveDaemonStartupReservationAsync(running, paths)).resolves.toBe(true);
      const contents: string = writeReservation(await getExitedPidAsync());
      const lock: IStartupLock | undefined = await tryAcquireStartupLockAsync(paths);
      expect(lock).toBeDefined();
      try {
        await expect(resolveDaemonStartupReservationAsync(running, paths, 300)).resolves.toBe(false);
      } finally {
        await lock!.releaseAsync();
      }
      const owner: string = fs.readFileSync(paths.lockfilePath, 'utf8');
      fs.writeFileSync(paths.lockfilePath, JSON.stringify({ ...JSON.parse(owner), pid: process.pid }));
      try {
        await expect(resolveDaemonStartupReservationAsync(running, paths)).resolves.toBe(false);
      } finally {
        fs.writeFileSync(paths.lockfilePath, owner);
      }
      expect(fs.readFileSync(getDaemonStartupFilePath(paths), 'utf8')).toBe(contents);
      await expect(resolveDaemonStartupReservationAsync(running, paths)).resolves.toBe(true);
      expect(fs.existsSync(getDaemonStartupFilePath(paths))).toBe(false);
      await running.shutdownAsync();
    } finally {
      await running.closeAsync();
    }
    // With the reservation resolved, a later start launches a new daemon instead of being refused.
    await waitForTestProcessExitAsync(daemonPid);
    const successor: DaemonClient = await connectOrStartDaemonAsync(options);
    try {
      expect((await successor.status).pid).not.toBe(daemonPid);
    } finally {
      await successor.closeAsync();
    }
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(2);
  });

  it('reports a startup reservation and whether its helper can still release it', async () => {
    const startupPath: string = getDaemonStartupFilePath(paths);
    expect(inspectDaemonStartupReservation(paths)).toBeUndefined();
    fs.writeFileSync(startupPath, randomUUID());
    expect(inspectDaemonStartupReservation(paths)).toEqual({ path: startupPath, helperState: 'unknown' });
    writeReservation(process.pid);
    expect(inspectDaemonStartupReservation(paths)).toEqual({
      path: startupPath,
      helperPid: process.pid,
      helperState: 'running'
    });
    const exitedPid: number = await getExitedPidAsync();
    const helperStartedAt: Date = new Date();
    writeReservation(exitedPid, helperStartedAt.toISOString());
    expect(inspectDaemonStartupReservation(paths)).toEqual({
      path: startupPath,
      helperPid: exitedPid,
      helperState: 'exited',
      relaunchAfter: new Date(helperStartedAt.getTime() + RELAUNCH_DELAY_MS).toISOString()
    });
    if (process.platform === 'linux') {
      // This process started after the recorded helper, so it merely reuses the PID.
      writeReservation(process.pid, new Date(Date.now() - 3600000).toISOString());
      expect(inspectDaemonStartupReservation(paths)).toMatchObject({ helperState: 'exited' });
    }
    fs.unlinkSync(startupPath);
    fs.mkdirSync(startupPath);
    expect(inspectDaemonStartupReservation(paths)).toEqual({ path: startupPath, helperState: 'unknown' });
    fs.rmdirSync(startupPath);
    expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
  });

  it('lets a startup helper release only its own reservation, tolerating one already resolved', () => {
    const startupPath: string = getDaemonStartupFilePath(paths);
    const helper = { pid: process.pid, startedAt: new Date().toISOString() };
    const token: string = reserveDaemonStartup(paths, helper);
    expect(() => reserveDaemonStartup(paths, helper)).toThrow('EEXIST');
    expect(() => releaseDaemonStartup(paths, randomUUID())).toThrow('changed ownership');
    expect(fs.existsSync(startupPath)).toBe(true);
    releaseDaemonStartup(paths, token);
    expect(fs.existsSync(startupPath)).toBe(false);
    releaseDaemonStartup(paths, token);
    expect(fs.existsSync(startupPath)).toBe(false);
  });

  it.each([false, true])(
    'preserves an explicit launcher and environment (relative cwd: %s)',
    async (relative) => {
      const client = await connectOrStartDaemonAsync({
        ...options,
        startCommand: {
          ...options.startCommand!,
          cwd: relative ? path.relative(process.cwd(), folder) : folder,
          args: [
            path.join(__dirname, 'fixtures/launcher.js'),
            'an argument with spaces',
            JSON.stringify(paths)
          ],
          environment: { ...options.startCommand!.environment, FIXTURE_VALUE: 'explicit environment' }
        }
      });
      expect(JSON.parse(fs.readFileSync(path.join(folder, 'launcher-options'), 'utf8'))).toEqual({
        cwd: folder,
        argument: 'an argument with spaces',
        environment: 'explicit environment'
      });
      expect((await client.status).daemonVersion).toBe('fixture');
      await client.closeAsync();
    }
  );

  it('finishes startup helper resources before returning a ready client', async () => {
    const childProcess = jest.requireActual<typeof import('node:child_process')>('node:child_process');
    const originalSpawn: typeof spawn = childProcess.spawn;
    const helpers: Set<ChildProcess> = new Set();
    const closed: Set<ChildProcess> = new Set();
    const observer = jest.spyOn(childProcess, 'spawn').mockImplementation((command, args, spawnOptions) => {
      const child = originalSpawn(command, args, spawnOptions);
      if (args?.includes(require.resolve('../runDaemonStartup'))) {
        helpers.add(child);
        child.once('close', () => closed.add(child));
      }
      return child;
    });
    try {
      const client = await connectOrStartDaemonAsync(options);
      await client.closeAsync();
      expect(helpers.size).toBe(1);
      expect(closed).toEqual(helpers);
      for (const helper of helpers) expect(helper.exitCode).toBe(0);
    } finally {
      observer.mockRestore();
    }
  });

  it('waits for fixture process exit rather than its work-finished marker', async () => {
    const child = spawn(
      process.execPath,
      ['-e', "process.stdout.write('finished'); process.stdin.resume();"],
      {
        cwd: folder,
        stdio: 'pipe'
      }
    );
    starterProcesses.push(child);
    const closed: Promise<unknown[]> = once(child, 'close');
    await once(child.stdout, 'data');
    let exited: boolean = false;
    const waiting: Promise<void> = waitForTestProcessExitAsync(child.pid!).then(() => {
      exited = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(exited).toBe(false);
    child.stdin.end();
    await Promise.all([closed, waiting]);
    expect(exited).toBe(true);
  });

  it('releases a helper whose IPC handoff failed without reclaiming its reservation', async () => {
    const childProcess = jest.requireActual<typeof import('node:child_process')>('node:child_process');
    const originalSpawn: typeof spawn = childProcess.spawn;
    const failure: Error = new Error('fixture IPC handoff failure');
    let helper: ChildProcess | undefined;
    let exited: boolean = false;
    const observer = jest.spyOn(childProcess, 'spawn').mockImplementation((command, args, spawnOptions) => {
      const child = originalSpawn(command, args, spawnOptions);
      helper = child;
      jest.spyOn(child, 'send').mockImplementation(() => {
        throw failure;
      });
      return child;
    });
    try {
      await expect(connectOrStartDaemonAsync(options)).rejects.toBe(failure);
      expect(helper?.pid).toBeDefined();
      await waitForTestProcessExitAsync(helper!.pid!);
      exited = true;
      expect(fs.existsSync(getDaemonStartupFilePath(paths))).toBe(true);
      expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
    } finally {
      observer.mockRestore();
      if (!exited && helper?.pid !== undefined) {
        if (helper.exitCode === null && helper.signalCode === null) helper.kill('SIGKILL');
        await waitForTestProcessExitAsync(helper.pid);
      }
    }
  });

  it('starts exactly once across four processes and survives all starting clients', async () => {
    const starters: ChildProcess[] = Array.from({ length: 4 }, () =>
      spawn(process.execPath, [path.join(__dirname, 'fixtures/starter.js'), JSON.stringify(options)], {
        stdio: ['ignore', 'ignore', 'pipe']
      })
    );
    const results = await Promise.all(
      starters.map(async (starter) => {
        let stderr: string = '';
        starter.stderr!.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        const [code] = await once(starter, 'close');
        return { code, stderr };
      })
    );
    expect(results).toEqual(Array.from({ length: 4 }, () => ({ code: 0, stderr: '' })));
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
    const client = await DaemonClient.connectAsync({
      socketPath: paths.socketPath,
      expectedDaemonVersion: 'fixture'
    });
    expect(await client.status).toMatchObject({ daemonVersion: 'fixture' });
    await client.closeAsync();
  }, 15000);

  // On Linux, LockFile checks the owners of other lockfiles. It used to run "ps" for each of them on every attempt,
  // and "ps" reads every process on the system, so clients that started at once timed out on a busy machine.
  (process.platform === 'linux' ? it : it.skip)(
    'connects 32 concurrent clients to a daemon that takes 8 seconds to start, running "ps" once per client',
    async () => {
      const clientCount: number = 32;
      fs.writeFileSync(path.join(folder, 'startup-delay-ms'), '8000');
      // A "ps" script ahead of the real one on the PATH records the client that runs each "ps" command.
      const binFolder: string = path.join(folder, 'bin');
      const psCallsPath: string = path.join(folder, 'ps-calls');
      fs.mkdirSync(binFolder);
      fs.writeFileSync(
        path.join(binFolder, 'ps'),
        `#!/bin/sh\necho "$PPID" >> '${psCallsPath}'\nPATH='${process.env.PATH}' exec ps "$@"\n`,
        { mode: 0o755 }
      );
      // The default deadline, instead of the 7 seconds that this suite uses.
      const startOptions: IConnectOrStartDaemonOptions = { ...options, startupTimeoutMs: 15000 };
      const starters: ChildProcess[] = Array.from({ length: clientCount }, () =>
        spawn(process.execPath, [path.join(__dirname, 'fixtures/starter.js'), JSON.stringify(startOptions)], {
          // With another locale, "ps" can print localized names, and LockFile then runs "ps" to check them.
          env: { ...process.env, PATH: `${binFolder}${path.delimiter}${process.env.PATH}`, LC_ALL: 'C' },
          stdio: ['ignore', 'ignore', 'pipe']
        })
      );
      starterProcesses.push(...starters);
      const results = await Promise.all(
        starters.map(async (starter) => {
          let stderr: string = '';
          starter.stderr!.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
          });
          const [code] = await once(starter, 'close');
          return { code, stderr };
        })
      );

      expect(results).toEqual(Array.from({ length: clientCount }, () => ({ code: 0, stderr: '' })));
      expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
      // Each client runs "ps" once, for its own start time. Lockfiles of other clients are checked with /proc.
      const psCalls: number = fs.readFileSync(psCallsPath, 'utf8').trim().split('\n').length;
      expect(psCalls).toBeGreaterThan(0);
      expect(psCalls).toBeLessThan(2 * clientCount);
    },
    30000
  );

  it('replaces a mismatched daemon exactly once for concurrent clients before requests start', async () => {
    const old = await connectOrStartDaemonAsync(options);
    const previous = await old.status;
    await old.closeAsync();
    const replacement: IConnectOrStartDaemonOptions = {
      ...options,
      expectedDaemonVersion: 'replacement',
      startCommand: { ...options.startCommand!, args: [...options.startCommand!.args, 'replacement'] }
    };
    const clients: DaemonClient[] = await Promise.all(
      Array.from({ length: 4 }, () => connectOrStartDaemonAsync(replacement))
    );
    try {
      const statuses = await Promise.all(clients.map((client) => client.status));
      expect(statuses.every((status) => status.daemonVersion === 'replacement')).toBe(true);
      expect(new Set(statuses.map((status) => status.pid)).size).toBe(1);
      expect(statuses[0].pid).not.toBe(previous.pid);
      expect(fs.existsSync(path.join(folder, `stopped-${previous.pid}`))).toBe(true);
      expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(2);
      const request = captureDaemonRequest({
        argv: ['test'],
        commandName: 'test',
        commandOrigin: 'custom',
        cwd: folder,
        environment: {},
        terminal: { isTTY: false, supportsColor: false }
      });
      await expect(clients[0].executeAsync({ request })).resolves.toMatchObject({
        kind: 'result',
        result: { exitCode: 0 }
      });
      expect(fs.readFileSync(path.join(folder, 'requests'), 'utf8')).toBe('replacement\n');
    } finally {
      await Promise.all(clients.map((client) => client.closeAsync()));
    }
  }, 15000);

  it('does not replace a mismatched daemon without an explicit launcher', async () => {
    const running = await connectOrStartDaemonAsync(options);
    await running.closeAsync();
    await expect(
      connectOrStartDaemonAsync({
        paths,
        expectedDaemonVersion: 'replacement'
      })
    ).rejects.toMatchObject({ code: 'versionMismatch' });
    const original = await DaemonClient.connectAsync({
      socketPath: paths.socketPath,
      expectedDaemonVersion: 'fixture'
    });
    await original.closeAsync();
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
  });

  it('resolves a lazy start command only when no compatible daemon is ready', async () => {
    const { startCommand, ...connectOnly } = options;
    const resolveStartCommandAsync = jest.fn(async () => startCommand!);
    const started = await connectOrStartDaemonAsync({ ...connectOnly, resolveStartCommandAsync });
    await started.closeAsync();
    expect(resolveStartCommandAsync).toHaveBeenCalledTimes(1);
    const warm = await connectOrStartDaemonAsync({ ...connectOnly, resolveStartCommandAsync });
    await warm.closeAsync();
    expect(resolveStartCommandAsync).toHaveBeenCalledTimes(1);
    const replaced = await connectOrStartDaemonAsync({
      ...connectOnly,
      expectedDaemonVersion: 'replacement',
      resolveStartCommandAsync: async () => ({
        ...startCommand!,
        args: [...startCommand!.args, 'replacement']
      })
    });
    expect((await replaced.status).daemonVersion).toBe('replacement');
    await replaced.closeAsync();
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(2);
  });

  it.each(['restart-once', 'restart-twice', 'restart-always', 'restart-held'])(
    'retries only the typed pre-execution result for %s after ownership release',
    async (mode) => {
      // restart-always exhausts the deadline; the others need room for loaded CI machines.
      const waitTimeoutMs: number = mode === 'restart-always' ? 1000 : 10000;
      const connection: IConnectOrStartDaemonOptions = {
        ...options,
        startCommand: { ...options.startCommand!, args: [...options.startCommand!.args, 'fixture', mode] }
      };
      const client = await connectOrStartDaemonAsync(connection);
      const request = captureDaemonRequest({
        argv: ['test'],
        commandName: 'test',
        commandOrigin: 'custom',
        cwd: folder,
        environment: {},
        terminal: { isTTY: false, supportsColor: false },
        admission: { waitTimeoutMs }
      });
      const pending = executeWithDaemonRestartAsync(
        client,
        {
          ...connection,
          startupTimeoutMs: mode === 'restart-held' ? 100 : 7000
        },
        { request }
      );
      if (mode === 'restart-once' || mode === 'restart-twice') {
        const restarts: number = mode === 'restart-once' ? 1 : 2;
        expect(await pending).toMatchObject({ kind: 'result', result: { exitCode: 0 } });
        const waits = fs.readFileSync(path.join(folder, 'waits'), 'utf8').trim().split('\n').map(Number);
        expect(waits).toHaveLength(restarts + 1);
        expect(waits[0]).toBe(waitTimeoutMs);
        for (let index: number = 1; index <= restarts; index++) {
          expect(waits[index]).toBeLessThanOrEqual(waits[index - 1]);
          expect(waits[index]).toBeLessThan(waitTimeoutMs);
          expect(waits[index]).toBeGreaterThanOrEqual(0);
        }
        expect(request.admission?.waitTimeoutMs).toBe(waitTimeoutMs);
        expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(
          restarts + 1
        );
      } else if (mode === 'restart-always') {
        // Every successor asks again: bounded retries inside the admission deadline, then a fallback.
        expect(await pending).toMatchObject({ kind: 'fallback', reason: 'restartRetriesExhausted' });
        const starts: number = fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n').length;
        expect(starts).toBeGreaterThanOrEqual(2);
        expect(starts).toBeLessThanOrEqual(7);
        // The deadline may expire after the last successor started but before the request was resubmitted.
        const requests: number = fs
          .readFileSync(path.join(folder, 'requests'), 'utf8')
          .trim()
          .split('\n').length;
        expect(requests).toBeGreaterThanOrEqual(starts - 1);
        expect(requests).toBeLessThanOrEqual(starts);
      } else {
        await expect(pending).rejects.toThrow('previous daemon still owns');
        expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
        expect(fs.readFileSync(path.join(folder, 'requests'), 'utf8').trim().split('\n')).toHaveLength(1);
      }
    },
    15000
  );

  it.each([
    ['restart-once', false],
    ['restart-installation', true]
  ])('tells the caller about the restart that it followed for %s', async (mode, reported) => {
    const connection: IConnectOrStartDaemonOptions = {
      ...options,
      startCommand: { ...options.startCommand!, args: [...options.startCommand!.args, 'fixture', mode] }
    };
    const client = await connectOrStartDaemonAsync(connection);
    const request = captureDaemonRequest({
      argv: ['test'],
      commandName: 'test',
      commandOrigin: 'custom',
      cwd: folder,
      environment: {},
      terminal: { isTTY: false, supportsColor: false }
    });
    const notices: IDaemonRestartNotice[] = [];
    const outcome = await executeWithDaemonRestartAsync(client, connection, {
      request,
      onRestartAsync: async (notice) => {
        // The successor has not received the request yet.
        expect(fs.readFileSync(path.join(folder, 'requests'), 'utf8').trim().split('\n')).toHaveLength(1);
        notices.push(notice);
      }
    });
    expect(outcome).toMatchObject({ kind: 'result', result: { exitCode: 0 } });
    const starts: number[] = fs
      .readFileSync(path.join(folder, 'starts'), 'utf8')
      .trim()
      .split('\n')
      .map(Number);
    expect(starts).toHaveLength(2);
    expect(notices).toEqual([
      {
        restart: 1,
        reason: reported
          ? { kind: 'installationChanged', change: 'removed', folder: path.join(folder, 'gone') }
          : undefined,
        successorPid: starts[1]
      }
    ]);
  });

  it.each([
    ['restart-installation', true],
    ['restart-once', false]
  ])(
    'says why the daemon restarted when the daemon that replaces it does not start, for %s',
    async (mode, reported) => {
      const connection: IConnectOrStartDaemonOptions = {
        ...options,
        startCommand: { ...options.startCommand!, args: [...options.startCommand!.args, 'fixture', mode] }
      };
      const client = await connectOrStartDaemonAsync(connection);
      const request = captureDaemonRequest({
        argv: ['test'],
        commandName: 'test',
        commandOrigin: 'custom',
        cwd: folder,
        environment: {},
        terminal: { isTTY: false, supportsColor: false }
      });
      // The successor's entry point is missing, so it exits before it becomes ready.
      const failing: IConnectOrStartDaemonOptions = {
        ...connection,
        startCommand: { ...connection.startCommand!, args: [path.join(folder, 'missing-entry.js')] }
      };
      const notices: IDaemonRestartNotice[] = [];
      const error: unknown = await executeWithDaemonRestartAsync(client, failing, {
        request,
        onRestartAsync: async (notice) => {
          notices.push(notice);
        }
      }).catch((caught: unknown) => caught);
      expect(notices).toEqual([]);
      expect(error).toBeInstanceOf(DaemonClientError);
      expect((error as DaemonClientError).code).toBe('startupFailed');
      expect((error as DaemonClientError).message).toContain(getDaemonLogFilePath(paths));
      if (reported) {
        expect(error).toBeInstanceOf(DaemonRestartFailedError);
        const { cause, message, restartReason } = error as DaemonRestartFailedError;
        expect(restartReason).toEqual({
          kind: 'installationChanged',
          change: 'removed',
          folder: path.join(folder, 'gone')
        });
        // The startup error is the cause, and its message is kept as it is.
        expect(cause).toBeInstanceOf(DaemonClientError);
        expect(cause).not.toBeInstanceOf(DaemonRestartFailedError);
        expect(message).toBe((cause as DaemonClientError).message);
      } else {
        expect(error).not.toBeInstanceOf(DaemonRestartFailedError);
      }
      expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
      expect(fs.readFileSync(path.join(folder, 'requests'), 'utf8').trim().split('\n')).toHaveLength(1);
    }
  );

  it.each(['execution', 'connection'])(
    'cancels successor waiting using the %s signal without replay',
    async (source) => {
      const connection: IConnectOrStartDaemonOptions = {
        ...options,
        startCommand: {
          ...options.startCommand!,
          args: [...options.startCommand!.args, 'fixture', 'restart-held']
        }
      };
      const client = await connectOrStartDaemonAsync(connection);
      const abort = new AbortController();
      const request = captureDaemonRequest({
        argv: ['test'],
        commandName: 'test',
        commandOrigin: 'custom',
        cwd: folder,
        environment: {},
        terminal: { isTTY: false, supportsColor: false }
      });
      const timer = setTimeout(() => abort.abort(), 200);
      try {
        expect(
          await executeWithDaemonRestartAsync(
            client,
            { ...connection, abortSignal: source === 'connection' ? abort.signal : undefined },
            { request, abortSignal: source === 'execution' ? abort.signal : undefined }
          )
        ).toMatchObject({ kind: 'result', result: { exitCode: 130, aborted: true } });
        expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
      } finally {
        clearTimeout(timer);
      }
    }
  );

  it('bounds the successor hand-off by the admission deadline instead of a fresh startup timeout', async () => {
    const connection: IConnectOrStartDaemonOptions = {
      ...options,
      startupTimeoutMs: 7000,
      startCommand: {
        ...options.startCommand!,
        args: [...options.startCommand!.args, 'fixture', 'restart-held']
      }
    };
    const client = await connectOrStartDaemonAsync(connection);
    const request = captureDaemonRequest({
      argv: ['test'],
      commandName: 'test',
      commandOrigin: 'custom',
      cwd: folder,
      environment: {},
      terminal: { isTTY: false, supportsColor: false },
      admission: { waitTimeoutMs: 500 }
    });
    const startedAt: number = Date.now();
    expect(await executeWithDaemonRestartAsync(client, connection, { request })).toMatchObject({
      kind: 'fallback',
      reason: 'restartRetriesExhausted'
    });
    expect(Date.now() - startedAt).toBeLessThan(5000);
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
    expect(fs.readFileSync(path.join(folder, 'requests'), 'utf8').trim().split('\n')).toHaveLength(1);
  });

  it.each([
    ['a client-default timeout, which each successor applies afresh', true],
    ['not an explicit timeout', false]
  ])('follows a restart that takes longer than %s', async (name, isDefault) => {
    // The first daemon answers only after the timeout, like one that restarts after a long build.
    fs.writeFileSync(path.join(folder, 'drain-ms'), '800');
    const connection: IConnectOrStartDaemonOptions = {
      ...options,
      startCommand: {
        ...options.startCommand!,
        args: [...options.startCommand!.args, 'fixture', 'restart-once']
      }
    };
    const client = await connectOrStartDaemonAsync(connection);
    const request = captureDaemonRequest({
      argv: ['build'],
      commandName: 'build',
      commandOrigin: 'built-in',
      cwd: folder,
      environment: {},
      terminal: { isTTY: false, supportsColor: false },
      admission: isDefault ? { waitTimeoutMs: 300, waitTimeoutIsDefault: true } : { waitTimeoutMs: 300 }
    });
    const outcome = await executeWithDaemonRestartAsync(client, connection, { request });
    const starts: string[] = fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n');
    const waits: string[] = fs.readFileSync(path.join(folder, 'waits'), 'utf8').trim().split('\n');
    if (isDefault) {
      expect(outcome).toMatchObject({ kind: 'result', result: { exitCode: 0 } });
      expect(starts).toHaveLength(2);
      expect(waits).toEqual(['300', '300']);
      expect(fs.readFileSync(path.join(folder, 'default-waits'), 'utf8').trim().split('\n')).toHaveLength(2);
    } else {
      expect(outcome).toMatchObject({ kind: 'fallback', reason: 'restartRetriesExhausted' });
      expect(starts).toHaveLength(1);
      expect(waits).toEqual(['300']);
    }
  });

  it('refuses restart retry if ownership was not attested before submitting', async () => {
    const connection: IConnectOrStartDaemonOptions = {
      ...options,
      startCommand: {
        ...options.startCommand!,
        args: [...options.startCommand!.args, 'fixture', 'restart-held']
      }
    };
    const client = await connectOrStartDaemonAsync(connection);
    const owner = JSON.parse(fs.readFileSync(paths.lockfilePath, 'utf8'));
    fs.writeFileSync(paths.lockfilePath, JSON.stringify({ ...owner, pid: process.pid }));
    const request = captureDaemonRequest({
      argv: ['test'],
      commandName: 'test',
      commandOrigin: 'custom',
      cwd: folder,
      environment: {},
      terminal: { isTTY: false, supportsColor: false }
    });
    try {
      await expect(executeWithDaemonRestartAsync(client, connection, { request })).rejects.toThrow(
        'Cannot attest'
      );
    } finally {
      fs.writeFileSync(paths.lockfilePath, JSON.stringify(owner));
    }
  });

  describe('when the connection is lost before the result', () => {
    const exitedMessage = (pid: number, logged: boolean, client: string = 'rush-client'): string =>
      `${DAEMON_DISCONNECTED_MESSAGE} rushd (PID ${pid}) exited while it ran the command; ` +
      `"rush-client daemon logs" ${logged ? 'shows' : 'may show'} why. Run the command again; ` +
      `if the daemon exits again, run the command with "${client} --no-daemon".`;

    function withMode(mode: string): IConnectOrStartDaemonOptions {
      return {
        ...options,
        startCommand: { ...options.startCommand!, args: [...options.startCommand!.args, 'fixture', mode] }
      };
    }

    function captureRequest(invocationKind?: 'rushx'): IDaemonRequestEnvelope {
      return captureDaemonRequest({
        argv: ['test'],
        commandName: 'test',
        commandOrigin: 'custom',
        cwd: folder,
        environment: {},
        terminal: { isTTY: false, supportsColor: false },
        invocationKind
      });
    }

    async function waitForRequestAsync(): Promise<void> {
      const deadline: number = Date.now() + 5000;
      while (!fs.existsSync(path.join(folder, 'requests')) && Date.now() < deadline) await delayAsync(20);
      expect(fs.existsSync(path.join(folder, 'requests'))).toBe(true);
    }

    it('says that rushd exited and quotes the error it logged, without retrying', async () => {
      const connection: IConnectOrStartDaemonOptions = withMode('crash-on-request');
      const client: DaemonClient = await connectOrStartDaemonAsync(connection);
      const { pid } = await client.status;
      const error: unknown = await executeWithDaemonRestartAsync(client, connection, {
        request: captureRequest()
      }).catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(DaemonClientError);
      expect(error).toMatchObject({
        code: 'disconnected',
        message:
          `${exitedMessage(pid!, true)}\n` +
          'The daemon log reports: Error: fixture daemon crash while running the request'
      });
      expect(fs.readFileSync(path.join(folder, 'requests'), 'utf8')).toBe('fixture\n');
      expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8')).toBe(`${pid}\n`);
    });

    it('ignores log output from before the request and names the rushx client', async () => {
      const earlierCrash: string = [
        '/earlier/daemon.js:1',
        "throw new Error('an earlier crash');",
        '^',
        '',
        'Error: an earlier crash',
        '    at /earlier/daemon.js:1:7',
        '',
        'Node.js v22.0.0',
        ''
      ].join('\n');
      fs.writeFileSync(getDaemonLogFilePath(paths), earlierCrash);
      const connection: IConnectOrStartDaemonOptions = withMode('kill-on-request');
      const client: DaemonClient = await connectOrStartDaemonAsync(connection);
      const { pid } = await client.status;
      await expect(
        executeWithDaemonRestartAsync(client, connection, { request: captureRequest('rushx') })
      ).rejects.toMatchObject({ code: 'disconnected', message: exitedMessage(pid!, false, 'rushx-client') });
      expect(fs.readFileSync(getDaemonLogFilePath(paths), 'utf8')).toContain(earlierCrash);
    });

    it('says the connection closed while rushd still runs', async () => {
      const connection: IConnectOrStartDaemonOptions = withMode('close-on-request');
      const client: DaemonClient = await connectOrStartDaemonAsync(connection);
      const { pid } = await client.status;
      await expect(
        executeWithDaemonRestartAsync(client, connection, { request: captureRequest() })
      ).rejects.toMatchObject({
        code: 'disconnected',
        message: `${DAEMON_DISCONNECTED_MESSAGE} The connection to rushd (PID ${pid}) closed, but the daemon is still running; run the command again.`
      });
      expect(fs.existsSync(path.join(folder, `stopped-${pid}`))).toBe(false);
    });

    it('keeps the plain text after the request was cancelled', async () => {
      const connection: IConnectOrStartDaemonOptions = withMode('crash-on-cancel');
      const client: DaemonClient = await connectOrStartDaemonAsync(connection);
      const abort: AbortController = new AbortController();
      const pending: Promise<DaemonClientOutcome> = executeWithDaemonRestartAsync(client, connection, {
        request: captureRequest(),
        abortSignal: abort.signal
      });
      await waitForRequestAsync();
      abort.abort();
      await expect(pending).rejects.toMatchObject({
        code: 'disconnected',
        message: DAEMON_DISCONNECTED_MESSAGE
      });
    });

    it('keeps the aborted result that an orderly shutdown sends', async () => {
      const connection: IConnectOrStartDaemonOptions = withMode('hold-until-shutdown');
      const client: DaemonClient = await connectOrStartDaemonAsync(connection);
      const pending: Promise<DaemonClientOutcome> = executeWithDaemonRestartAsync(client, connection, {
        request: captureRequest()
      });
      await waitForRequestAsync();
      const stopping: DaemonClient = await connectOrStartDaemonAsync(connection);
      await stopping.shutdownAsync();
      expect(await pending).toMatchObject({
        kind: 'result',
        result: { exitCode: 130, outcome: 'aborted', aborted: true }
      });
    });
  });

  it('waits through published ownership handoff even without a captured predecessor', async () => {
    const running = await connectOrStartDaemonAsync({
      ...options,
      startCommand: {
        ...options.startCommand!,
        args: [...options.startCommand!.args, 'fixture', 'restart-once']
      }
    });
    const previous = await running.status;
    await running.shutdownAsync();
    const replacement = await connectOrStartDaemonAsync(options);
    try {
      expect((await replacement.status).pid).not.toBe(previous.pid);
      expect(fs.existsSync(path.join(folder, `stopped-${previous.pid}`))).toBe(true);
      expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(2);
    } finally {
      await replacement.closeAsync();
    }
  });

  it('waits for an externally started successor without enabling auto-start', async () => {
    const running = await connectOrStartDaemonAsync(options);
    const previous = JSON.parse(fs.readFileSync(paths.lockfilePath, 'utf8')) as IDaemonLockfile;
    await running.shutdownAsync();
    const waiting = connectOrStartDaemonAsync({
      paths,
      previousDaemon: previous,
      expectedDaemonVersion: 'fixture',
      startupTimeoutMs: 7000
    });
    const starter = await connectOrStartDaemonAsync(options);
    try {
      const passive = await waiting;
      expect((await passive.status).pid).toBe((await starter.status).pid);
      await passive.closeAsync();
      expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(2);
    } finally {
      await starter.closeAsync();
    }
  });

  it('lets a restarting daemon start its planned successor while the clients that follow it only connect', async () => {
    // The old daemon launches only after both clients could have started one, so a race would always be lost.
    fs.writeFileSync(path.join(folder, 'planned-requests'), '2');
    fs.writeFileSync(path.join(folder, 'planned-launch-delay-ms'), '1500');
    const planned: IConnectOrStartDaemonOptions = {
      ...options,
      startCommand: {
        ...options.startCommand!,
        args: [...options.startCommand!.args, 'fixture', 'restart-planned']
      }
    };
    const clients: DaemonClient[] = [
      await connectOrStartDaemonAsync(planned),
      await connectOrStartDaemonAsync(planned)
    ];
    const { pid: restartingPid } = await clients[0].status;
    const outcomes = await Promise.all(
      clients.map((client, index) =>
        executeWithDaemonRestartAsync(client, options, {
          request: captureDaemonRequest({
            requestId: `follower-${index}`,
            argv: ['test'],
            commandName: 'test',
            commandOrigin: 'custom',
            cwd: folder,
            environment: {},
            terminal: { isTTY: false, supportsColor: false }
          })
        })
      )
    );
    await Promise.all(clients.map((client) => client.closeAsync()));
    expect(outcomes).toMatchObject([
      { kind: 'result', result: { exitCode: 0 } },
      { kind: 'result', result: { exitCode: 0 } }
    ]);
    // The restarting daemon exits only after it attests the successor it launched.
    await waitForTestProcessExitAsync(restartingPid!);
    const identities: string[] = fs.readFileSync(path.join(folder, 'identities'), 'utf8').trim().split('\n');
    expect(identities.map((line) => line.split(' ')[1])).toEqual(['client', 'planned']);
    expect(fs.readFileSync(path.join(folder, 'planned-successor'), 'utf8')).toBe(identities[1].split(' ')[0]);
    expect(fs.readFileSync(path.join(folder, 'requests'), 'utf8').trim().split('\n')).toHaveLength(4);
  }, 15000);

  it('connects to the successor that another process starts while the restarting predecessor lives', async () => {
    const waiting = connectToPlannedSuccessorAsync({
      ...options,
      previousDaemon: { pid: process.pid, startedAt: new Date().toISOString() }
    });
    await delayAsync(300);
    expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
    const starter = await connectOrStartDaemonAsync(options);
    try {
      const follower = await waiting;
      expect((await follower.status).pid).toBe((await starter.status).pid);
      await follower.closeAsync();
      expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
    } finally {
      await starter.closeAsync();
    }
  });

  it('never starts a daemon while the restarting predecessor lives, even when its deadline expires', async () => {
    await expect(
      connectToPlannedSuccessorAsync({
        ...options,
        previousDaemon: { pid: process.pid, startedAt: new Date().toISOString() },
        startupTimeoutMs: 300
      })
    ).rejects.toThrow(`timed out waiting for the successor that the previous daemon (PID ${process.pid}) is starting`);
    expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
  });

  it('starts a daemon once the restarting predecessor exits without a successor', async () => {
    // The predecessor exits only when its stdin ends, so it provably lives during the first check.
    const predecessor: ChildProcess = spawn(process.execPath, ['-e', 'process.stdin.resume()'], {
      stdio: ['pipe', 'ignore', 'ignore']
    });
    await once(predecessor, 'spawn');
    const exited: Promise<unknown[]> = once(predecessor, 'exit');
    const pending = connectToPlannedSuccessorAsync({
      ...options,
      previousDaemon: { pid: predecessor.pid!, startedAt: new Date().toISOString() }
    });
    try {
      await delayAsync(300);
      expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
    } finally {
      predecessor.stdin!.end();
    }
    await exited;
    const client = await pending;
    await client.closeAsync();
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
  });

  it('does not stop a mismatched daemon with unverifiable ownership', async () => {
    const running = await connectOrStartDaemonAsync(options);
    await running.closeAsync();
    fs.writeFileSync(paths.lockfilePath, 'corrupt');
    await expect(
      connectOrStartDaemonAsync({
        ...options,
        expectedDaemonVersion: 'replacement'
      })
    ).rejects.toThrow('shutdown was not sent');
    const original = await DaemonClient.connectAsync({
      socketPath: paths.socketPath,
      expectedDaemonVersion: 'fixture'
    });
    await original.closeAsync();
    expect(fs.readFileSync(paths.lockfilePath, 'utf8')).toBe('corrupt');
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
  });

  it('does not start when auto-start is absent', async () => {
    await expect(connectOrStartDaemonAsync({ paths })).rejects.toThrow('auto-start is disabled');
    expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
  });

  it('appends both child streams to the private workspace launcher log', async () => {
    const logFilePath: string = getDaemonLogFilePath(paths);
    fs.writeFileSync(logFilePath, 'previous startup\n', { mode: 0o644 });
    if (process.platform !== 'win32') fs.chmodSync(logFilePath, 0o644);
    const client = await connectOrStartDaemonAsync(options);
    await client.closeAsync();
    const log: string = fs.readFileSync(logFilePath, 'utf8');
    expect(log).toContain('previous startup\n');
    expect(log).toContain('launcher stdout\n');
    expect(log).toContain('launcher stderr\n');
    if (process.platform !== 'win32') {
      expect(FileSystem.formatPosixModeBits(FileSystem.getPosixModeBits(logFilePath))).toBe('-rw-------');
    }
  });

  it('retains actionable child startup errors in the same log', async () => {
    const logFilePath: string = getDaemonLogFilePath(paths);
    await expect(
      connectOrStartDaemonAsync({
        ...options,
        startCommand: {
          ...options.startCommand!,
          args: [path.join(folder, 'missing-entry.js')]
        }
      })
    ).rejects.toThrow(logFilePath);
    expect(fs.readFileSync(logFilePath, 'utf8')).toContain('Cannot find module');
  });

  it('tells the daemon it starts which runtime folder its clients look in', async () => {
    const client = await connectOrStartDaemonAsync(options);
    await client.closeAsync();
    expect(fs.readFileSync(path.join(folder, 'runtime-base'), 'utf8')).toBe(path.dirname(folder));
  });

  (process.platform === 'win32' ? it.skip : it)(
    'reports a linked runtime folder as a startup failure without starting a daemon',
    async () => {
      const link: string = `${folder}-link`;
      fs.symlinkSync(folder, link);
      try {
        const failure: Promise<DaemonClient> = connectOrStartDaemonAsync({
          ...options,
          paths: {
            runtimeDir: link,
            socketPath: path.join(link, 'd.sock'),
            lockfilePath: path.join(link, 'daemon.pid.json')
          }
        });
        await expect(failure).rejects.toBeInstanceOf(DaemonClientError);
        await expect(failure).rejects.toMatchObject({ code: 'startupFailed' });
        await expect(failure).rejects.toThrow(
          `The daemon runtime folder ${link} is unsafe: it is a symbolic link`
        );
        expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
      } finally {
        fs.unlinkSync(link);
      }
    }
  );

  (process.platform === 'win32' ? it.skip : it)(
    'reports a socket path too long to connect to as a startup failure without starting a daemon',
    async () => {
      // Node cuts a socket path longer than sun_path (108 bytes on Linux, 104 on macOS) short, so no client
      // could reach a daemon published there.
      const base: string = path.join(folder, 'r'.repeat(100));
      const runtimeDir: string = path.join(base, `rushd-${process.getuid?.()}`);
      const failure: Promise<DaemonClient> = connectOrStartDaemonAsync({
        ...options,
        paths: {
          runtimeDir,
          socketPath: path.join(runtimeDir, 'd.sock'),
          lockfilePath: path.join(runtimeDir, 'daemon.pid.json')
        }
      });
      await expect(failure).rejects.toBeInstanceOf(DaemonClientError);
      await expect(failure).rejects.toMatchObject({ code: 'startupFailed' });
      await expect(failure).rejects.toThrow(
        /^The daemon socket path .*\/d\.sock is \d+ bytes long, but this platform allows at most 10[48]\. Set RUSHD_RUNTIME_DIR to an absolute path of at most \d+ bytes, or unset it\.$/
      );
      expect(fs.existsSync(base)).toBe(false);
      expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
    }
  );

  (process.platform === 'win32' ? it.skip : it)(
    'refuses linked log destinations without changing their target',
    async () => {
      const logFilePath: string = getDaemonLogFilePath(paths);
      const target: string = path.join(folder, 'not-a-log.txt');
      fs.writeFileSync(target, 'unchanged', { mode: 0o644 });
      fs.chmodSync(target, 0o644);
      fs.symlinkSync(target, logFilePath);
      await expect(connectOrStartDaemonAsync(options)).rejects.toMatchObject({ code: 'ELOOP' });
      fs.unlinkSync(logFilePath);
      fs.linkSync(target, logFilePath);
      await expect(connectOrStartDaemonAsync(options)).rejects.toThrow('regular, unshared file');
      expect(fs.readFileSync(target, 'utf8')).toBe('unchanged');
      expect(FileSystem.formatPosixModeBits(FileSystem.getPosixModeBits(target))).toBe('-rw-r--r--');
      expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
    }
  );

  it('reclaims a parseable record with an invalid timestamp without waiting out the deadline', async () => {
    const record: string = JSON.stringify({
      pid: process.pid,
      protocolVersion: { major: 0, minor: 6 },
      startedAt: 'invalid',
      socketPath: paths.socketPath
    });
    fs.writeFileSync(paths.lockfilePath, record);
    const started: number = Date.now();
    const client = await connectOrStartDaemonAsync(options);
    await client.closeAsync();
    expect(Date.now() - started).toBeLessThan(options.startupTimeoutMs! - 2000);
    expect(readDaemonLockfile(paths.lockfilePath)?.pid).not.toBe(process.pid);
  });

  (process.platform === 'win32' ? it.skip : it)(
    'force reset waits for a listener to release the endpoint',
    async () => {
      fs.writeFileSync(getDaemonStartupFilePath(paths), 'abandoned');
      const listener: net.Server = net.createServer((socket) => socket.destroy());
      await new Promise<void>((resolve) => listener.listen(paths.socketPath, resolve));
      await expect(resetDaemonArtifactsAsync(paths)).rejects.toThrow('still listening');
      const closing: NodeJS.Timeout = setTimeout(() => listener.close(), 300);
      try {
        expect(await resetDaemonArtifactsAsync(paths, { waitTimeoutMs: 5000 })).toEqual({
          removedPaths: [getDaemonStartupFilePath(paths)]
        });
      } finally {
        clearTimeout(closing);
        listener.close();
      }
    }
  );

  it('never reclaims a live PID that may still own the record', async () => {
    const record: string = JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() });
    fs.writeFileSync(paths.lockfilePath, record);
    await expect(connectOrStartDaemonAsync(options)).rejects.toThrow('or a reused PID');
    await expect(connectOrStartDaemonAsync(options)).rejects.toThrow('daemon stop --force');
    expect(fs.readFileSync(paths.lockfilePath, 'utf8')).toBe(record);
    await expect(resetDaemonArtifactsAsync(paths)).rejects.toThrow(`PID ${process.pid} still owns`);
    expect(fs.readFileSync(paths.lockfilePath, 'utf8')).toBe(record);
  });

  it('reclaims a corrupt ownership record once the endpoint refuses connections', async () => {
    fs.writeFileSync(paths.lockfilePath, 'not json');
    const client = await connectOrStartDaemonAsync(options);
    await client.closeAsync();
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
    expect(readDaemonLockfile(paths.lockfilePath)?.pid).toBe(
      Number(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim())
    );
  });

  it('fails closed on a corrupt ownership record while something still listens', async () => {
    fs.writeFileSync(paths.lockfilePath, 'not json');
    const listener: net.Server = net.createServer((socket) => socket.destroy());
    await new Promise<void>((resolve) => listener.listen(paths.socketPath, resolve));
    try {
      await expect(connectOrStartDaemonAsync({ ...options, startupTimeoutMs: 2000 })).rejects.toThrow(
        'did not refuse a connection'
      );
      await expect(resetDaemonArtifactsAsync(paths)).rejects.toThrow('still listening');
      expect(fs.readFileSync(paths.lockfilePath, 'utf8')).toBe('not json');
      expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
    } finally {
      await new Promise<void>((resolve) => listener.close(() => resolve()));
    }
  });

  (process.platform === 'win32' ? it.skip : it)(
    'reclaims a socket without an ownership record once it refuses connections',
    async () => {
      await leaveStaleSocketAsync();
      expect(fs.existsSync(paths.socketPath)).toBe(true);
      const client = await connectOrStartDaemonAsync(options);
      await client.closeAsync();
      expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
    }
  );

  (process.platform === 'linux' ? it : it.skip)(
    'reclaims a record whose live PID started after the record was written',
    async () => {
      const unrelated: ChildProcess = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        stdio: 'ignore'
      });
      await once(unrelated, 'spawn');
      try {
        await leaveStaleSocketAsync();
        fs.writeFileSync(
          paths.lockfilePath,
          JSON.stringify({
            pid: unrelated.pid,
            protocolVersion: { major: 0, minor: 6 },
            startedAt: new Date(Date.now() - 3600000).toISOString(),
            socketPath: paths.socketPath
          })
        );
        const started: number = Date.now();
        const client = await connectOrStartDaemonAsync(options);
        await client.closeAsync();
        // Not the full startup deadline spent polling the unrelated process.
        expect(Date.now() - started).toBeLessThan(options.startupTimeoutMs! - 2000);
        expect(unrelated.exitCode).toBeNull();
        expect(readDaemonLockfile(paths.lockfilePath)?.pid).not.toBe(unrelated.pid);
      } finally {
        const closed: Promise<unknown[]> = once(unrelated, 'close');
        unrelated.kill('SIGKILL');
        await closed;
      }
    }
  );

  (process.platform === 'win32' ? it.skip : it)(
    'force reset removes stale artifacts without starting a daemon',
    async () => {
      await leaveStaleSocketAsync();
      fs.writeFileSync(paths.lockfilePath, 'garbage{');
      fs.writeFileSync(getDaemonStartupFilePath(paths), 'abandoned');
      expect(await resetDaemonArtifactsAsync(paths)).toEqual({
        removedPaths: [paths.lockfilePath, getDaemonStartupFilePath(paths), paths.socketPath]
      });
      expect(await resetDaemonArtifactsAsync(paths)).toEqual({ removedPaths: [] });
      expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
    }
  );

  it('starts after ownership release even while the original process remains alive', async () => {
    const client = await connectOrStartDaemonAsync({
      ...options,
      previousDaemon: { pid: process.pid, startedAt: new Date().toISOString() }
    });
    await client.closeAsync();
    expect(fs.existsSync(path.join(folder, 'starts'))).toBe(true);
  });

  it('preserves a live predecessor lock when restart times out', async () => {
    const previousDaemon = { pid: process.pid, startedAt: new Date().toISOString() };
    const record: string = JSON.stringify(previousDaemon);
    fs.writeFileSync(paths.lockfilePath, record);
    await expect(
      connectOrStartDaemonAsync({
        ...options,
        previousDaemon,
        startupTimeoutMs: 40
      })
    ).rejects.toThrow('previous daemon still owns');
    expect(fs.readFileSync(paths.lockfilePath, 'utf8')).toBe(record);
  });

  it('waits for disposal to release the original lock before starting', async () => {
    const previousDaemon = { pid: process.pid, startedAt: new Date().toISOString() };
    fs.writeFileSync(paths.lockfilePath, JSON.stringify(previousDaemon));
    const pending = connectOrStartDaemonAsync({ ...options, previousDaemon });
    await delayAsync(100);
    expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
    fs.unlinkSync(paths.lockfilePath);
    const client = await pending;
    await client.closeAsync();
  });

  it('reconnects to a new owner even if it uses the same PID as the predecessor', async () => {
    const first = await connectOrStartDaemonAsync(options);
    await first.closeAsync();
    const owner: IDaemonLockfile = JSON.parse(fs.readFileSync(paths.lockfilePath, 'utf8'));
    const client = await connectOrStartDaemonAsync({
      ...options,
      previousDaemon: {
        pid: owner.pid,
        startedAt: new Date(Date.parse(owner.startedAt) - 1000).toISOString()
      }
    });
    await client.closeAsync();
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
  });

  it('safely reclaims a dead predecessor without requiring lockfile removal', async () => {
    const exited: ChildProcess = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    const previousDaemon = { pid: exited.pid!, startedAt: new Date().toISOString() };
    await once(exited, 'exit');
    fs.writeFileSync(paths.lockfilePath, JSON.stringify(previousDaemon));
    const client = await connectOrStartDaemonAsync({ ...options, previousDaemon });
    await client.closeAsync();
  });

  it('does not treat an unreadable ownership record as released', async () => {
    fs.writeFileSync(paths.lockfilePath, 'corrupt');
    await expect(
      connectOrStartDaemonAsync({
        ...options,
        previousDaemon: { pid: process.pid, startedAt: new Date().toISOString() }
      })
    ).rejects.toThrow('Cannot safely read');
    expect(fs.readFileSync(paths.lockfilePath, 'utf8')).toBe('corrupt');
  });

  it('reports spawn failures and releases the start lock for another invocation', async () => {
    const invalid = {
      ...options,
      startCommand: { ...options.startCommand!, command: path.join(folder, 'missing-executable') }
    };
    await expect(connectOrStartDaemonAsync(invalid)).rejects.toThrow('Unable to start');
    const client = await connectOrStartDaemonAsync(options);
    await client.closeAsync();
  }, 15000);
});
