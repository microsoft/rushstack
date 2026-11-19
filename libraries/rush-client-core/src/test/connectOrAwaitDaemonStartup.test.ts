// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { LockFile } from '@rushstack/node-core-library';
import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { captureDaemonRequest } from '../captureDaemonRequest';
import type { DaemonClient } from '../DaemonClient';
import { DaemonClientError } from '../DaemonClientError';
import * as DaemonOwnership from '../DaemonOwnership';
import { getDaemonStartupFilePath } from '../DaemonStartup';
import {
  DaemonStartupPendingError,
  connectOrAwaitDaemonStartupAsync,
  connectToStartingDaemonAsync
} from '../connectOrAwaitDaemonStartup';
import { connectOrStartDaemonAsync, type IConnectOrStartDaemonOptions } from '../connectOrStartDaemon';
import { removeTestFolderAsync, waitForTestProcessExitAsync } from './TestProcessExit';

interface IAwaitingResult {
  readonly kind: 'connected' | 'pending' | 'fallback' | 'error';
  readonly pid?: number;
  readonly message?: string;
  readonly elapsedMs: number;
  readonly notices: { owner: string; waitMs: number }[];
}

describe('connectOrAwaitDaemonStartupAsync', () => {
  let folder: string;
  let paths: IDaemonPaths;
  let options: IConnectOrStartDaemonOptions;
  let children: ChildProcess[];

  beforeEach(() => {
    children = [];
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-await-'));
    paths = {
      runtimeDir: folder,
      socketPath:
        process.platform === 'win32'
          ? `\\\\.\\pipe\\rush-client-await-${path.basename(folder)}`
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
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        const closed: Promise<unknown[]> = once(child, 'close');
        child.kill('SIGKILL');
        await closed;
      }
    }
    if (fs.existsSync(path.join(folder, 'starts'))) {
      fs.writeFileSync(path.join(folder, 'stop'), '');
      const pids: string[] = fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n');
      await Promise.all(pids.map((pid) => waitForTestProcessExitAsync(Number(pid))));
    }
    if (fs.existsSync(path.join(folder, 'parents'))) {
      const parents = new Set(fs.readFileSync(path.join(folder, 'parents'), 'utf8').trim().split('\n'));
      await Promise.all([...parents].map((pid) => waitForTestProcessExitAsync(Number(pid))));
    }
    await removeTestFolderAsync(folder);
  });

  function run(
    fixture: string,
    args: string[]
  ): { child: ChildProcess; result: Promise<{ code: number | null; stdout: string; stderr: string }> } {
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
    return { child, result: once(child, 'close').then(([code]) => ({ code, stdout, stderr })) };
  }

  async function runAwaitingAsync(
    startOptions: IConnectOrStartDaemonOptions,
    signalFolder?: string
  ): Promise<IAwaitingResult> {
    const { code, stdout, stderr } = await run(
      'awaitingStarter.js',
      signalFolder ? [JSON.stringify(startOptions), signalFolder] : [JSON.stringify(startOptions)]
    ).result;
    expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
    return JSON.parse(stdout);
  }

  async function waitForFileAsync(filePath: string): Promise<string> {
    const deadline: number = Date.now() + 10000;
    while (!fs.existsSync(filePath) && Date.now() < deadline) await delayAsync(20);
    return fs.readFileSync(filePath, 'utf8');
  }

  async function waitForLinesAsync(filePath: string, count: number): Promise<void> {
    const deadline: number = Date.now() + 30000;
    const countLines = (): number =>
      fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').trim().split('\n').length : 0;
    while (countLines() < count && Date.now() < deadline) await delayAsync(20);
  }

  it('keeps every client on the daemon when it becomes ready only after their first startup deadline', async () => {
    const clientCount: number = 8;
    // On a loaded host, the first attempts end up to about 2 seconds apart, and the daemon takes up to about
    // 3 seconds after its release to serve every client, so the earliest client's second deadline needs room.
    const startupTimeoutMs: number = 10000;
    fs.writeFileSync(path.join(folder, 'hold-prebind'), '');
    const burst: IConnectOrStartDaemonOptions = { ...options, startupTimeoutMs };
    // A client that does not wait shows that the first deadline expires before the daemon listens.
    const control = run('starter.js', [JSON.stringify(burst)]);
    const results: Promise<IAwaitingResult[]> = Promise.all(
      Array.from({ length: clientCount }, () => runAwaitingAsync(burst, folder))
    );
    // The clients start together, so that their first deadlines expire together even on a loaded host.
    await waitForLinesAsync(path.join(folder, 'clients'), clientCount);
    fs.writeFileSync(path.join(folder, 'go'), '');
    const daemonPid: number = Number(await waitForFileAsync(path.join(folder, 'prebind')));
    // A client's first deadline has expired once it says that it keeps waiting.
    await waitForLinesAsync(path.join(folder, 'notices'), clientCount);
    const controlResult = await control.result;
    fs.unlinkSync(path.join(folder, 'hold-prebind'));

    expect(controlResult.code).toBe(1);
    expect(controlResult.stderr).toContain('Daemon startup');
    for (const result of await results) {
      expect(result).toMatchObject({ kind: 'connected', pid: daemonPid });
      expect(result.elapsedMs).toBeGreaterThan(startupTimeoutMs);
      // Each client said once why it kept waiting: the daemon binds only after every client has done so.
      expect(result.notices).toHaveLength(1);
      expect(result.notices[0].owner).toMatch(
        /^(Its startup helper \(PID \d+\) is still waiting for the daemon|Another client is still starting the daemon)$/
      );
      expect(result.notices[0].waitMs).toBeGreaterThan(0);
      expect(result.notices[0].waitMs).toBeLessThanOrEqual(startupTimeoutMs);
    }
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8')).toBe(`${daemonPid}\n`);
    expect(fs.existsSync(getDaemonStartupFilePath(paths))).toBe(false);
  }, 60000);

  it('fails without permitting in-process Rush while the startup helper still waits after a second deadline', async () => {
    fs.writeFileSync(path.join(folder, 'hold-prebind'), '');
    const result: IAwaitingResult = await runAwaitingAsync({ ...options, startupTimeoutMs: 2000 });
    const daemonPid: number = Number(fs.readFileSync(path.join(folder, 'prebind'), 'utf8'));
    const helperPid: number = Number(fs.readFileSync(path.join(folder, 'parents'), 'utf8'));
    expect(result.kind).toBe('pending');
    expect(result.elapsedMs).toBeGreaterThanOrEqual(4000);
    expect(result.message).toContain(
      `Its startup helper (PID ${helperPid}) is still waiting for the daemon, so Rush was not run in-process`
    );
    expect(result.message).toContain('use --no-daemon');
    expect(result.message).toContain('"rush-client daemon status"');
    expect(result.notices).toEqual([
      {
        owner: `Its startup helper (PID ${helperPid}) is still waiting for the daemon`,
        waitMs: expect.any(Number)
      }
    ]);

    fs.unlinkSync(path.join(folder, 'hold-prebind'));
    const client = await connectOrStartDaemonAsync(options);
    expect((await client.status).pid).toBe(daemonPid);
    await client.closeAsync();
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8')).toBe(`${daemonPid}\n`);
  }, 30000);

  it('fails without permitting in-process Rush while a listener does not become ready', async () => {
    // Accepts connections but never answers, like a daemon whose event loop is blocked.
    const sockets: Set<net.Socket> = new Set();
    const listener: net.Server = net.createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    await new Promise<void>((resolve) => listener.listen(paths.socketPath, resolve));
    const onAwaitStartup: jest.Mock = jest.fn();
    try {
      const error: unknown = await connectOrAwaitDaemonStartupAsync({
        ...options,
        startupTimeoutMs: 2000,
        onAwaitStartup
      }).then(
        () => undefined,
        (rejection: unknown) => rejection
      );
      expect(error).toBeInstanceOf(DaemonStartupPendingError);
      expect(error).not.toBeInstanceOf(DaemonClientError);
      expect((error as Error).message).toContain(
        `A process listens at ${paths.socketPath} but was not ready in time, so Rush was not run in-process`
      );
      expect(onAwaitStartup.mock.calls).toEqual([
        [`A process listens at ${paths.socketPath} but was not ready in time`, expect.any(Number)]
      ]);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => listener.close(() => resolve()));
    }
    expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
  }, 30000);

  it('fails without permitting in-process Rush while another client holds the start mutex', async () => {
    const holder = run('startLockHolder.js', [JSON.stringify(paths)]);
    await waitForFileAsync(path.join(folder, 'lock-held'));
    const started: number = Date.now();
    const onAwaitStartup: jest.Mock = jest.fn();
    const error: unknown = await connectOrAwaitDaemonStartupAsync({
      ...options,
      startupTimeoutMs: 2000,
      onAwaitStartup
    }).then(
      () => undefined,
      (rejection: unknown) => rejection
    );
    expect(Date.now() - started).toBeGreaterThanOrEqual(4000);
    expect(error).toBeInstanceOf(DaemonStartupPendingError);
    expect((error as Error).message).toContain(
      'Another client is still starting the daemon, so Rush was not run in-process'
    );
    expect(error).toHaveProperty('cause.code', 'startupFailed');
    expect(onAwaitStartup).toHaveBeenCalledTimes(1);
    expect(onAwaitStartup.mock.calls[0][0]).toBe('Another client is still starting the daemon');
    expect(onAwaitStartup.mock.calls[0][1]).toBeGreaterThan(0);
    expect(onAwaitStartup.mock.calls[0][1]).toBeLessThanOrEqual(2000);

    fs.writeFileSync(path.join(folder, 'release-lock'), '');
    expect(await holder.result).toEqual({ code: 0, stdout: '', stderr: '' });
    // Once the starter is gone, the same failure permits in-process Rush again, without a notice.
    await expect(
      connectOrAwaitDaemonStartupAsync({
        paths,
        expectedDaemonVersion: 'fixture',
        startupTimeoutMs: 500,
        onAwaitStartup
      })
    ).rejects.toBeInstanceOf(DaemonClientError);
    expect(onAwaitStartup).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
  }, 30000);

  it('rejects at once with the startup error when nothing live owns the workspace', async () => {
    const started: number = Date.now();
    const onAwaitStartup: jest.Mock = jest.fn();
    await expect(
      connectOrAwaitDaemonStartupAsync({ paths, expectedDaemonVersion: 'fixture', onAwaitStartup })
    ).rejects.toThrow(
      new DaemonClientError(
        'startupFailed',
        `No ready daemon at ${paths.socketPath}; auto-start is disabled.`
      )
    );

    // A launcher that exits before readiness leaves a reservation whose helper has exited.
    const failing: IConnectOrStartDaemonOptions = {
      ...options,
      startCommand: { ...options.startCommand!, args: [path.join(folder, 'missing-entry.js')] }
    };
    const failure: unknown = await connectOrAwaitDaemonStartupAsync({ ...failing, onAwaitStartup }).catch(
      (error: unknown) => error
    );
    expect(failure).toBeInstanceOf(DaemonClientError);
    expect((failure as Error).message).toContain('Unable to start');
    const refusal: unknown = await connectOrAwaitDaemonStartupAsync({ ...options, onAwaitStartup }).catch(
      (error: unknown) => error
    );
    expect(refusal).toBeInstanceOf(DaemonClientError);
    // Until the relaunch time, the refusal is at once, so that the caller can run without the daemon.
    expect((refusal as Error).message).toContain(
      'exited before the daemon became ready; refusing another launch until '
    );
    expect(Date.now() - started).toBeLessThan(options.startupTimeoutMs!);
    expect(onAwaitStartup).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
  }, 30000);

  it('leaves a version mismatch to the caller as before', async () => {
    const running = await connectOrStartDaemonAsync(options);
    await running.closeAsync();
    await expect(
      connectOrAwaitDaemonStartupAsync({ paths, expectedDaemonVersion: 'replacement' })
    ).rejects.toMatchObject({ code: 'versionMismatch' });
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
  });

  describe('connectToStartingDaemonAsync', () => {
    it('returns at once without starting a daemon when nothing is starting', async () => {
      const started: number = Date.now();
      const onAwaitStartup: jest.Mock = jest.fn();
      // Without a start mutex lock file, nothing tries to acquire the mutex (LockFile runs `ps` to do that).
      const tryAcquire: jest.SpyInstance = jest.spyOn(LockFile, 'tryAcquire');
      await expect(connectToStartingDaemonAsync({ ...options, onAwaitStartup })).resolves.toBeUndefined();
      expect(tryAcquire).not.toHaveBeenCalled();
      // A reservation whose startup helper has exited names no live starter either, and neither does a start
      // mutex lock file that the helper left behind.
      const exited: ChildProcess = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
      await once(exited, 'close');
      fs.writeFileSync(
        getDaemonStartupFilePath(paths),
        JSON.stringify({ token: 'fixture', helperPid: exited.pid, helperStartedAt: new Date().toISOString() })
      );
      fs.writeFileSync(
        path.join(folder, `${path.basename(paths.lockfilePath)}-start#${exited.pid}.lock`),
        'Mon Jan  1 00:00:00 2024'
      );
      await expect(connectToStartingDaemonAsync({ ...options, onAwaitStartup })).resolves.toBeUndefined();
      expect(tryAcquire).toHaveBeenCalled();
      tryAcquire.mockRestore();
      expect(Date.now() - started).toBeLessThan(options.startupTimeoutMs!);
      expect(onAwaitStartup).not.toHaveBeenCalled();
      expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
    });

    it('waits for a daemon that another client is starting and connects to it, whatever its version', async () => {
      fs.writeFileSync(path.join(folder, 'startup-delay-ms'), '1500');
      const starter = run('starter.js', [JSON.stringify(options)]);
      await waitForFileAsync(getDaemonStartupFilePath(paths));
      const onAwaitStartup: jest.Mock = jest.fn();
      const client: DaemonClient | undefined = await connectToStartingDaemonAsync({
        ...options,
        expectedDaemonVersion: 'replacement',
        onAwaitStartup
      });
      expect(client).toBeDefined();
      const { pid } = await client!.status;
      await client!.closeAsync();
      expect(onAwaitStartup).toHaveBeenCalledTimes(1);
      expect(onAwaitStartup.mock.calls[0][0]).toMatch(
        /^(Its startup helper \(PID \d+\) is still waiting for the daemon|Another client is still starting the daemon)$/
      );
      expect(onAwaitStartup.mock.calls[0][1]).toBeGreaterThan(0);
      expect(onAwaitStartup.mock.calls[0][1]).toBeLessThanOrEqual(options.startupTimeoutMs!);
      expect(await starter.result).toEqual({ code: 0, stdout: '', stderr: '' });
      expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8')).toBe(`${pid}\n`);
    }, 30000);

    it('rejects with DaemonStartupPendingError while the daemon is still starting at the deadline', async () => {
      fs.writeFileSync(path.join(folder, 'hold-prebind'), '');
      const starter = run('starter.js', [JSON.stringify(options)]);
      const daemonPid: number = Number(await waitForFileAsync(path.join(folder, 'prebind')));
      const helperPid: number = Number(fs.readFileSync(path.join(folder, 'parents'), 'utf8'));
      const onAwaitStartup: jest.Mock = jest.fn();
      const started: number = Date.now();
      const error: unknown = await connectToStartingDaemonAsync({
        ...options,
        startupTimeoutMs: 1000,
        onAwaitStartup
      }).then(
        () => undefined,
        (rejection: unknown) => rejection
      );
      expect(Date.now() - started).toBeGreaterThanOrEqual(1000);
      expect(error).toBeInstanceOf(DaemonStartupPendingError);
      expect((error as Error).message).toBe(
        `The daemon at ${paths.socketPath} is still starting after 1 s. Its startup helper (PID ${helperPid}) is still waiting for the daemon.`
      );
      expect(onAwaitStartup.mock.calls).toEqual([
        [`Its startup helper (PID ${helperPid}) is still waiting for the daemon`, expect.any(Number)]
      ]);

      fs.unlinkSync(path.join(folder, 'hold-prebind'));
      expect(await starter.result).toEqual({ code: 0, stdout: '', stderr: '' });
      expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8')).toBe(`${daemonPid}\n`);
    }, 30000);

    it('connects to a daemon that became ready between its first connect and its check for a live owner', async () => {
      // The daemon waits to listen until this client has found nothing listening, and is ready before that check
      // returns. Then nothing owns a startup, so only the last connect can find the ready daemon.
      fs.writeFileSync(path.join(folder, 'hold-prebind'), '');
      const daemon = run('daemon.js', [JSON.stringify(paths)]);
      const daemonPid: number = Number(await waitForFileAsync(path.join(folder, 'prebind')));
      // This test, not a startup helper, is the daemon's parent, so afterEach must not wait for it to exit.
      expect(fs.readFileSync(path.join(folder, 'parents'), 'utf8')).toBe(`${process.pid}\n`);
      fs.unlinkSync(path.join(folder, 'parents'));
      const isEndpointUnboundAsync: (socketPath: string) => Promise<boolean> =
        DaemonOwnership.isEndpointUnboundAsync;
      const endpointCheck: jest.SpyInstance = jest
        .spyOn(DaemonOwnership, 'isEndpointUnboundAsync')
        .mockImplementation(async (socketPath: string) => {
          const unbound: boolean = await isEndpointUnboundAsync(socketPath);
          fs.unlinkSync(path.join(folder, 'hold-prebind'));
          const deadline: number = Date.now() + 10000;
          while ((await isEndpointUnboundAsync(socketPath)) && Date.now() < deadline) await delayAsync(20);
          return unbound;
        });
      const onAwaitStartup: jest.Mock = jest.fn();
      try {
        const client: DaemonClient | undefined = await connectToStartingDaemonAsync({
          ...options,
          onAwaitStartup
        });
        expect(endpointCheck).toHaveBeenCalledTimes(1);
        expect(client).toBeDefined();
        const { pid } = await client!.status;
        await client!.closeAsync();
        expect(pid).toBe(daemonPid);
      } finally {
        endpointCheck.mockRestore();
      }
      expect(onAwaitStartup).not.toHaveBeenCalled();
      fs.writeFileSync(path.join(folder, 'stop'), '');
      expect(await daemon.result).toEqual({
        code: 0,
        stdout: 'launcher stdout\n',
        stderr: 'launcher stderr\n'
      });
    }, 30000);

    it('waits while another client holds the start mutex, until it is released or the wait is aborted', async () => {
      const holder = run('startLockHolder.js', [JSON.stringify(paths)]);
      await waitForFileAsync(path.join(folder, 'lock-held'));
      const abort: AbortController = new AbortController();
      const aborted: Promise<unknown> = connectToStartingDaemonAsync({
        ...options,
        abortSignal: abort.signal
      }).then(
        () => undefined,
        (rejection: unknown) => rejection
      );
      await delayAsync(300);
      abort.abort();
      expect(await aborted).toMatchObject({ name: 'AbortError' });

      const onAwaitStartup: jest.Mock = jest.fn();
      const started: number = Date.now();
      const waiting: Promise<DaemonClient | undefined> = connectToStartingDaemonAsync({
        ...options,
        onAwaitStartup
      });
      await delayAsync(500);
      fs.writeFileSync(path.join(folder, 'release-lock'), '');
      await expect(waiting).resolves.toBeUndefined();
      expect(Date.now() - started).toBeGreaterThanOrEqual(500);
      expect(onAwaitStartup.mock.calls).toEqual([
        ['Another client is still starting the daemon', expect.any(Number)]
      ]);
      expect(await holder.result).toEqual({ code: 0, stdout: '', stderr: '' });
      expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
    }, 30000);
  });
});
