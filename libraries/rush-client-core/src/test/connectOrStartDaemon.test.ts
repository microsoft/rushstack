// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import type { IDaemonLockfile, IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { DaemonClient } from '../DaemonClient';
import { captureDaemonRequest } from '../captureDaemonRequest';
import { connectOrStartDaemonAsync, type IConnectOrStartDaemonOptions } from '../connectOrStartDaemon';

describe('detached daemon startup', () => {
  let folder: string;
  let paths: IDaemonPaths;
  let options: IConnectOrStartDaemonOptions;

  beforeEach(() => {
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
    if (fs.existsSync(path.join(folder, 'starts'))) {
      fs.writeFileSync(path.join(folder, 'stop'), '');
      const deadline: number = Date.now() + 5000;
      while (!fs.existsSync(path.join(folder, 'stopped')) && Date.now() < deadline) await delayAsync(50);
      expect(fs.existsSync(path.join(folder, 'stopped'))).toBe(true);
    }
    fs.rmSync(folder, { recursive: true });
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
        const [code] = await once(starter, 'exit');
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

  it('does not start when auto-start is absent', async () => {
    await expect(connectOrStartDaemonAsync({ paths })).rejects.toThrow('auto-start is disabled');
    expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
  });

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
