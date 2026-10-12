// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  readDaemonLockfile,
  type IDaemonOrphanReap,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';

import { captureDaemonRequest } from '../captureDaemonRequest';
import type { DaemonClient } from '../DaemonClient';
import { connectOrStartDaemonAsync, type IConnectOrStartDaemonOptions } from '../connectOrStartDaemon';
import {
  describeGroupLeftRunning,
  isRunning,
  readClientLogTexts,
  readProcessStartTime,
  recordDaemonOwner,
  recordOperationGroup,
  startDetachedOperationAsync,
  stopOperationIfRunning
} from './OrphanedOperation';
import { removeTestFolderAsync, waitForTestProcessExitAsync } from './TestProcessExit';

function readIfPresent(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

// A file of its own, since connectOrStartDaemon.test.ts is close to the 2,000-line max-lines limit.
describe('detached daemon startup after a daemon whose PID a later process has', () => {
  let folder: string;
  let paths: IDaemonPaths;
  let options: IConnectOrStartDaemonOptions;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-reused-owner-'));
    paths = {
      runtimeDir: folder,
      socketPath:
        process.platform === 'win32'
          ? `\\\\.\\pipe\\rush-client-reused-owner-${path.basename(folder)}`
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
      const pids: string[] = fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n');
      await Promise.all(pids.map((pid) => waitForTestProcessExitAsync(Number(pid))));
      expect(pids.every((pid) => fs.existsSync(path.join(folder, `stopped-${pid}`)))).toBe(true);
    }
    // A fixture daemon that fails a check records it here.
    expect(readIfPresent(path.join(folder, 'failures'))).toBe('');
    if (fs.existsSync(path.join(folder, 'parents'))) {
      const parents = new Set(fs.readFileSync(path.join(folder, 'parents'), 'utf8').trim().split('\n'));
      await Promise.all([...parents].map((pid) => waitForTestProcessExitAsync(Number(pid))));
    }
    await removeTestFolderAsync(folder);
  });

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

  (process.platform === 'linux' ? it : it.skip)(
    'stops the operations of a record whose live PID a later process has, but never that process, before a start',
    async () => {
      const operationPids: number[] = [];
      const warning: jest.SpyInstance = jest
        .spyOn(process, 'emitWarning')
        .mockImplementation(() => undefined);
      try {
        // Each leads a process group and session of its own, as an operation does.
        const unrelated: number = await startDetachedOperationAsync(operationPids);
        const recorded: number = await startDetachedOperationAsync(operationPids);
        await leaveStaleSocketAsync();
        recordDaemonOwner(paths, unrelated, new Date(Date.now() - 3600000).toISOString());
        recordOperationGroup(paths.lockfilePath, unrelated, unrelated, readProcessStartTime(unrelated));
        recordOperationGroup(paths.lockfilePath, unrelated, recorded, readProcessStartTime(recorded));
        const reaps: IDaemonOrphanReap[] = [];
        const client: DaemonClient = await connectOrStartDaemonAsync({
          ...options,
          onOrphansReaped: (reap: IDaemonOrphanReap) => reaps.push(reap)
        });
        await client.closeAsync();
        expect(isRunning(recorded)).toBe(false);
        expect(isRunning(unrelated)).toBe(true);
        expect(reaps).toEqual([{ daemonPid: unrelated, processGroupIds: [recorded], outcome: 'terminated' }]);
        expect(readClientLogTexts(paths)).toEqual([
          describeGroupLeftRunning(unrelated, unrelated, 'daemonPidInUse')
        ]);
        expect(warning).not.toHaveBeenCalled();
        expect(readDaemonLockfile(paths.lockfilePath)?.pid).not.toBe(unrelated);
        expect(fs.existsSync(`${paths.lockfilePath}.groups-${unrelated}`)).toBe(false);
      } finally {
        warning.mockRestore();
        operationPids.forEach(stopOperationIfRunning);
      }
    }
  );
});
