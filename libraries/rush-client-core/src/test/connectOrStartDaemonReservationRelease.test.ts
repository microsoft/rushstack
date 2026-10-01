// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delayAsync } from 'node:timers/promises';

import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { captureDaemonRequest } from '../captureDaemonRequest';
import { DaemonClient } from '../DaemonClient';
import { getDaemonStartupFilePath, reserveDaemonStartup } from '../DaemonStartup';
import * as StartupLock from '../StartupLock';
import { connectOrStartDaemonAsync, type IConnectOrStartDaemonOptions } from '../connectOrStartDaemon';
import { trackPendingDelays, type IPendingDelays } from './PendingDelays';
import { removeTestFolderAsync, waitForTestProcessExitAsync } from './TestProcessExit';

interface IFixture {
  readonly child: ChildProcess;
  /** The exit code is undefined when the process was killed by a signal. */
  readonly result: Promise<{ code: number | undefined; stdout: string; stderr: string }>;
}

describe('detached daemon startup while another client starts the daemon', () => {
  let folder: string;
  let paths: IDaemonPaths;
  let options: IConnectOrStartDaemonOptions;
  let children: ChildProcess[];
  let holder: IFixture;
  /** Stops this client waiting when a test ends early. */
  let abort: AbortController;
  /** When each connection attempt by this process began, from `performance.now()`. */
  let attempts: number[];
  let connectSpy: jest.SpyInstance;

  function run(fixture: string, args: string[]): IFixture {
    const child: ChildProcess = spawn(
      process.execPath,
      [path.join(__dirname, 'fixtures', fixture), ...args],
      {
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
    children.push(child);
    let stdout: string = '';
    let stderr: string = '';
    child.stdout!.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr!.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    return {
      child,
      result: once(child, 'close').then(([code]) => ({ code: code ?? undefined, stdout, stderr }))
    };
  }

  async function waitUntilAsync(condition: () => boolean): Promise<void> {
    const deadline: number = Date.now() + 10000;
    while (!condition() && Date.now() < deadline) await delayAsync(5);
    expect(condition()).toBe(true);
  }

  /** Reserves startup like the helper of the client that holds the start mutex. */
  function reserveStartup(): void {
    reserveDaemonStartup(paths, { pid: holder.child.pid!, startedAt: new Date().toISOString() });
  }

  function releaseStartup(): number {
    fs.unlinkSync(getDaemonStartupFilePath(paths));
    return performance.now();
  }

  /**
   * Starts a fixture daemon, which listens after 250 milliseconds (or the number in the "startup-delay-ms" file),
   * and not before the "hold-prebind" file is removed if it exists. No startup helper waits for it.
   */
  function startDaemon(): void {
    run('daemon.js', [JSON.stringify(paths)]);
  }

  /**
   * Waits until this client has begun its fifth connection attempt and 100 milliseconds more. Its backoff steps
   * last 50, 100, 200 and 400 milliseconds, so it is then 100 milliseconds into a step of 500.
   */
  async function waitIntoLongStepAsync(): Promise<void> {
    await waitUntilAsync(() => attempts.length >= 5);
    await delayAsync(100);
  }

  beforeEach(async () => {
    children = [];
    attempts = [];
    abort = new AbortController();
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-waiter-'));
    paths = {
      runtimeDir: folder,
      socketPath:
        process.platform === 'win32'
          ? `\\\\.\\pipe\\rush-client-waiter-${path.basename(folder)}`
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
      abortSignal: abort.signal,
      startCommand: {
        command: process.execPath,
        args: [path.join(__dirname, 'fixtures/daemon.js'), JSON.stringify(paths)],
        cwd: folder,
        environment
      }
    };
    const originalConnectAsync: typeof DaemonClient.connectAsync = DaemonClient.connectAsync;
    connectSpy = jest.spyOn(DaemonClient, 'connectAsync').mockImplementation(async (connectOptions) => {
      attempts.push(performance.now());
      return await originalConnectAsync.call(DaemonClient, connectOptions);
    });
    // Another client holds the start mutex, so this one never starts a daemon.
    holder = run('startLockHolder.js', [JSON.stringify(paths)]);
    await waitUntilAsync(() => fs.existsSync(path.join(folder, 'lock-held')));
  });

  afterEach(async () => {
    abort.abort();
    connectSpy.mockRestore();
    fs.writeFileSync(path.join(folder, 'release-lock'), '');
    expect(await holder.result).toEqual({ code: 0, stdout: '', stderr: '' });
    if (fs.existsSync(path.join(folder, 'starts'))) {
      fs.writeFileSync(path.join(folder, 'stop'), '');
      const pids: string[] = fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n');
      await Promise.all(pids.map((pid) => waitForTestProcessExitAsync(Number(pid))));
    }
    await Promise.all(
      children.map((child) =>
        child.exitCode === null && child.signalCode === null ? once(child, 'close') : undefined
      )
    );
    // A fixture daemon that fails a check records it here.
    const failuresPath: string = path.join(folder, 'failures');
    expect(fs.existsSync(failuresPath) ? fs.readFileSync(failuresPath, 'utf8') : '').toBe('');
    await removeTestFolderAsync(folder);
  });

  it('connects as soon as the startup reservation is released, not at the end of a backoff step', async () => {
    // The daemon is ready, but this client drops each connection while the reservation remains.
    reserveStartup();
    startDaemon();
    await waitUntilAsync(() => fs.existsSync(paths.lockfilePath));
    const delays: IPendingDelays = trackPendingDelays();
    try {
      const connecting: Promise<DaemonClient> = connectOrStartDaemonAsync(options);
      await waitIntoLongStepAsync();
      // Checking for the reservation does not connect: attempts still follow the backoff steps.
      expect(attempts.length).toBeLessThanOrEqual(6);
      const releasedAt: number = releaseStartup();
      const client: DaemonClient = await connecting;
      await new Promise<void>((resolve) => setImmediate(resolve));
      // A timer left running would keep a client process alive for the rest of its step.
      expect(delays.pending.size).toBe(0);
      await client.closeAsync();
      const afterRelease: number[] = attempts.filter((attempt) => attempt >= releasedAt);
      expect(afterRelease).toHaveLength(1);
      expect(afterRelease[0] - releasedAt).toBeLessThan(100);
    } finally {
      delays.restore();
    }
  });

  it('retries at once when the startup reservation is released between two waits', async () => {
    // The reservation is released while this client tries the start mutex for a connection that it then drops,
    // before its next wait begins.
    reserveStartup();
    startDaemon();
    await waitUntilAsync(() => fs.existsSync(paths.lockfilePath));
    const tryAcquireStartupLockAsync: typeof StartupLock.tryAcquireStartupLockAsync =
      StartupLock.tryAcquireStartupLockAsync;
    let releasedAt: number | undefined;
    const lockSpy: jest.SpyInstance = jest
      .spyOn(StartupLock, 'tryAcquireStartupLockAsync')
      .mockImplementation(async (lockPaths: IDaemonPaths) => {
        const lock: StartupLock.IStartupLock | undefined = await tryAcquireStartupLockAsync(lockPaths);
        if (releasedAt === undefined && attempts.length >= 5) releasedAt = releaseStartup();
        return lock;
      });
    try {
      const client: DaemonClient = await connectOrStartDaemonAsync(options);
      await client.closeAsync();
    } finally {
      lockSpy.mockRestore();
    }
    expect(releasedAt).toBeDefined();
    const afterRelease: number[] = attempts.filter((attempt) => attempt >= releasedAt!);
    expect(afterRelease).toHaveLength(1);
    expect(afterRelease[0] - releasedAt!).toBeLessThan(100);
  });

  it('connects as soon as a startup reservation that appeared during a backoff step is released', async () => {
    // Nothing listens and nothing is reserved when this client's step of 500 milliseconds begins.
    fs.writeFileSync(path.join(folder, 'hold-prebind'), '');
    fs.writeFileSync(path.join(folder, 'startup-delay-ms'), '0');
    startDaemon();
    await waitUntilAsync(() => fs.existsSync(path.join(folder, 'prebind')));
    const connecting: Promise<DaemonClient> = connectOrStartDaemonAsync(options);
    await waitUntilAsync(() => attempts.length >= 5);
    await delayAsync(50);
    reserveStartup();
    fs.unlinkSync(path.join(folder, 'hold-prebind'));
    await waitUntilAsync(() => fs.existsSync(paths.lockfilePath));
    // This client checks every 25 milliseconds, so it has seen the reservation.
    await delayAsync(60);
    const releasedAt: number = releaseStartup();
    const client: DaemonClient = await connecting;
    await client.closeAsync();
    const afterRelease: number[] = attempts.filter((attempt) => attempt >= releasedAt);
    expect(afterRelease).toHaveLength(1);
    expect(afterRelease[0] - releasedAt).toBeLessThan(100);
  });

  it('waits whole backoff steps after the startup reservation is released without a ready daemon', async () => {
    reserveStartup();
    const pending: Promise<unknown> = connectOrStartDaemonAsync(options).then(
      () => new Error('Expected startup to be aborted.'),
      (rejection: unknown) => rejection
    );
    await waitIntoLongStepAsync();
    const releasedAt: number = releaseStartup();
    await delayAsync(1000);
    abort.abort();
    expect(await pending).toMatchObject({ name: 'AbortError' });
    const afterRelease: number[] = attempts.filter((attempt) => attempt >= releasedAt);
    // One attempt at once, which nothing answers, and then one for each step of 500 milliseconds.
    expect(afterRelease.length).toBeGreaterThanOrEqual(1);
    expect(afterRelease[0] - releasedAt).toBeLessThan(100);
    expect(afterRelease.length).toBeLessThanOrEqual(3);
  });

  it('stops at once when aborted while the startup reservation remains', async () => {
    reserveStartup();
    const reason: Error = new Error('cancelled while another client starts the daemon');
    const pending: Promise<unknown> = connectOrStartDaemonAsync(options).then(
      () => new Error('Expected startup to be aborted.'),
      (rejection: unknown) => rejection
    );
    await waitIntoLongStepAsync();
    abort.abort(reason);
    const abortedAt: number = performance.now();
    expect(await pending).toMatchObject({ name: 'AbortError', cause: reason });
    expect(performance.now() - abortedAt).toBeLessThan(100);
  });
});
