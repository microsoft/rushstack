// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { FileSystem } from '@rushstack/node-core-library';
import type { IDaemonLockfile, IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { DaemonClient } from '../DaemonClient';
import { captureDaemonRequest } from '../captureDaemonRequest';
import { getDaemonLogFilePath } from '../DaemonLogFile';
import { connectOrStartDaemonAsync, type IConnectOrStartDaemonOptions } from '../connectOrStartDaemon';
import { executeWithDaemonRestartAsync } from '../executeWithDaemonRestart';
import { getDaemonStartupFilePath } from '../DaemonStartup';
import { removeTestFolderAsync, waitForTestProcessExitAsync } from './TestProcessExit';

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

  async function killStarterBeforeBindAsync(): Promise<number> {
    fs.writeFileSync(path.join(folder, 'hold-prebind'), '');
    const starter = startClient();
    const barrier: string = path.join(folder, 'prebind');
    const deadline: number = Date.now() + 5000;
    while (!fs.existsSync(barrier) && Date.now() < deadline) await delayAsync(20);
    expect(fs.existsSync(barrier)).toBe(true);
    expect(fs.existsSync(paths.lockfilePath)).toBe(false);
    const daemonPid: number = Number(fs.readFileSync(barrier, 'utf8'));
    expect(starter.child.kill('SIGKILL')).toBe(true);
    expect((await starter.result).code).not.toBe(0);
    expect(starter.child.signalCode).toBe('SIGKILL');
    return daemonPid;
  }

  it('fails closed for successor starters while the original detached daemon remains pre-bind', async () => {
    const daemonPid: number = await killStarterBeforeBindAsync();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => startClient({ ...options, startupTimeoutMs: 700 }).result)
    );
    expect(results.every(({ code }) => code !== 0)).toBe(true);
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

  it('preserves an unresolved startup reservation rather than trusting or reclaiming its contents', async () => {
    const startupPath: string = getDaemonStartupFilePath(paths);
    const contents: string = JSON.stringify({ pid: process.pid, startedAt: 'not an ownership contract' });
    fs.writeFileSync(startupPath, contents);
    const { result } = startClient({ ...options, startupTimeoutMs: 200 });
    expect(await result).toMatchObject({ code: 1, stderr: expect.stringContaining('unresolved startup handoff') });
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
    await expect(connectOrStartDaemonAsync({ ...options, startupTimeoutMs: 100 }))
      .rejects.toThrow('unresolved startup handoff');
    expect(fs.readFileSync(startupPath, 'utf8')).toBe(contents);
    expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
  });

  it.each([false, true])('preserves an explicit launcher and environment (relative cwd: %s)', async (relative) => {
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
  });

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
    const child = spawn(process.execPath, ['-e', "process.stdout.write('finished'); process.stdin.resume();"], {
      cwd: folder,
      stdio: 'pipe'
    });
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
        argv: ['test'], commandName: 'test', commandOrigin: 'custom', cwd: folder, environment: {},
        terminal: { isTTY: false, supportsColor: false }
      });
      await expect(clients[0].executeAsync({ request })).resolves.toMatchObject({
        kind: 'result', result: { exitCode: 0 }
      });
      expect(fs.readFileSync(path.join(folder, 'requests'), 'utf8')).toBe('replacement\n');
    } finally {
      await Promise.all(clients.map((client) => client.closeAsync()));
    }
  }, 15000);

  it('does not replace a mismatched daemon without an explicit launcher', async () => {
    const running = await connectOrStartDaemonAsync(options);
    await running.closeAsync();
    await expect(connectOrStartDaemonAsync({
      paths, expectedDaemonVersion: 'replacement'
    })).rejects.toMatchObject({ code: 'versionMismatch' });
    const original = await DaemonClient.connectAsync({
      socketPath: paths.socketPath, expectedDaemonVersion: 'fixture'
    });
    await original.closeAsync();
    expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
  });

  it.each(['restart-once', 'restart-always', 'restart-held'])(
    'retries only the typed pre-execution result for %s after ownership release',
    async (mode) => {
      const connection: IConnectOrStartDaemonOptions = {
        ...options,
        startCommand: { ...options.startCommand!, args: [...options.startCommand!.args, 'fixture', mode] }
      };
      const client = await connectOrStartDaemonAsync(connection);
      const request = captureDaemonRequest({
        argv: ['test'], commandName: 'test', commandOrigin: 'custom', cwd: folder, environment: {},
        terminal: { isTTY: false, supportsColor: false }, admission: { waitTimeoutMs: 1000 }
      });
      const pending = executeWithDaemonRestartAsync(client, {
        ...connection, startupTimeoutMs: mode === 'restart-held' ? 100 : 7000
      }, { request });
      if (mode === 'restart-once') {
        expect(await pending).toMatchObject({ kind: 'result', result: { exitCode: 0 } });
        const waits = fs.readFileSync(path.join(folder, 'waits'), 'utf8').trim().split('\n').map(Number);
        expect(waits[0]).toBe(1000);
        expect(waits[1]).toBeLessThan(1000);
        expect(waits[1]).toBeGreaterThanOrEqual(0);
        expect(request.admission?.waitTimeoutMs).toBe(1000);
      } else {
        await expect(pending).rejects.toThrow(
          mode === 'restart-held' ? 'previous daemon still owns' : 'single safe retry was exhausted'
        );
      }
      expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n'))
        .toHaveLength(mode === 'restart-held' ? 1 : 2);
      expect(fs.readFileSync(path.join(folder, 'requests'), 'utf8').trim().split('\n'))
        .toHaveLength(mode === 'restart-held' ? 1 : 2);
    },
    15000
  );

  it.each(['execution', 'connection'])('cancels successor waiting using the %s signal without replay', async (source) => {
    const connection: IConnectOrStartDaemonOptions = {
      ...options,
      startCommand: { ...options.startCommand!, args: [...options.startCommand!.args, 'fixture', 'restart-held'] }
    };
    const client = await connectOrStartDaemonAsync(connection);
    const abort = new AbortController();
    const request = captureDaemonRequest({
      argv: ['test'], commandName: 'test', commandOrigin: 'custom', cwd: folder, environment: {},
      terminal: { isTTY: false, supportsColor: false }
    });
    const timer = setTimeout(() => abort.abort(), 200);
    try {
      expect(await executeWithDaemonRestartAsync(
        client,
        { ...connection, abortSignal: source === 'connection' ? abort.signal : undefined },
        { request, abortSignal: source === 'execution' ? abort.signal : undefined }
      ))
        .toMatchObject({ kind: 'result', result: { exitCode: 130, aborted: true } });
      expect(fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n')).toHaveLength(1);
    } finally {
      clearTimeout(timer);
    }
  });

  it('refuses restart retry if ownership was not attested before submitting', async () => {
    const connection: IConnectOrStartDaemonOptions = {
      ...options,
      startCommand: { ...options.startCommand!, args: [...options.startCommand!.args, 'fixture', 'restart-held'] }
    };
    const client = await connectOrStartDaemonAsync(connection);
    const owner = JSON.parse(fs.readFileSync(paths.lockfilePath, 'utf8'));
    fs.writeFileSync(paths.lockfilePath, JSON.stringify({ ...owner, pid: process.pid }));
    const request = captureDaemonRequest({
      argv: ['test'], commandName: 'test', commandOrigin: 'custom', cwd: folder, environment: {},
      terminal: { isTTY: false, supportsColor: false }
    });
    try {
      await expect(executeWithDaemonRestartAsync(client, connection, { request })).rejects.toThrow('Cannot attest');
    } finally {
      fs.writeFileSync(paths.lockfilePath, JSON.stringify(owner));
    }
  });

  it('waits through published ownership handoff even without a captured predecessor', async () => {
    const running = await connectOrStartDaemonAsync({
      ...options,
      startCommand: { ...options.startCommand!, args: [...options.startCommand!.args, 'fixture', 'restart-once'] }
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
      paths, previousDaemon: previous, expectedDaemonVersion: 'fixture', startupTimeoutMs: 7000
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

  it('does not stop a mismatched daemon with unverifiable ownership', async () => {
    const running = await connectOrStartDaemonAsync(options);
    await running.closeAsync();
    fs.writeFileSync(paths.lockfilePath, 'corrupt');
    await expect(connectOrStartDaemonAsync({
      ...options, expectedDaemonVersion: 'replacement'
    })).rejects.toThrow('shutdown was not sent');
    const original = await DaemonClient.connectAsync({
      socketPath: paths.socketPath, expectedDaemonVersion: 'fixture'
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

  it('never reclaims a live or reused PID', async () => {
    const record: string = JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() });
    fs.writeFileSync(paths.lockfilePath, record);
    await expect(connectOrStartDaemonAsync(options)).rejects.toThrow('may be a reused PID');
    expect(fs.readFileSync(paths.lockfilePath, 'utf8')).toBe(record);
  });

  it('fails closed on corrupt ownership records', async () => {
    fs.writeFileSync(paths.lockfilePath, 'not json');
    await expect(connectOrStartDaemonAsync(options)).rejects.toThrow('refusing automatic reclaim');
    expect(fs.readFileSync(paths.lockfilePath, 'utf8')).toBe('not json');
  });

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
