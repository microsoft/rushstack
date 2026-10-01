// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { captureDaemonRequest } from '../captureDaemonRequest';
import type { DaemonClient } from '../DaemonClient';
import { DaemonClientError } from '../DaemonClientError';
import { connectOrStartDaemonAsync, type IConnectOrStartDaemonOptions } from '../connectOrStartDaemon';
import { DaemonRestartFailedError, executeWithDaemonRestartAsync } from '../executeWithDaemonRestart';
import { removeTestFolderAsync, waitForTestProcessExitAsync } from './TestProcessExit';

function readIfPresent(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function readLines(filePath: string): string[] {
  return fs.readFileSync(filePath, 'utf8').trim().split('\n');
}

// A file of its own, since connectOrStartDaemon.test.ts is close to the 2,000-line max-lines limit.
describe(DaemonRestartFailedError.name, () => {
  let folder: string;
  let options: IConnectOrStartDaemonOptions;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-restart-failed-'));
    const paths: IDaemonPaths = {
      runtimeDir: folder,
      socketPath:
        process.platform === 'win32'
          ? `\\\\.\\pipe\\rush-client-restart-failed-${path.basename(folder)}`
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
      const pids: string[] = readLines(path.join(folder, 'starts'));
      await Promise.all(pids.map((pid) => waitForTestProcessExitAsync(Number(pid))));
      expect(pids.every((pid) => fs.existsSync(path.join(folder, `stopped-${pid}`)))).toBe(true);
    }
    // A fixture daemon that fails a check records it here.
    expect(readIfPresent(path.join(folder, 'failures'))).toBe('');
    if (fs.existsSync(path.join(folder, 'parents'))) {
      const parents = new Set(readLines(path.join(folder, 'parents')));
      await Promise.all([...parents].map((pid) => waitForTestProcessExitAsync(Number(pid))));
    }
    await removeTestFolderAsync(folder);
  });

  it('keeps the code and message of a startup error whose code is timeout', async () => {
    // The daemon asks for a restart because its installation was removed, and then keeps its ownership.
    const connection: IConnectOrStartDaemonOptions = {
      ...options,
      startCommand: {
        ...options.startCommand!,
        args: [...options.startCommand!.args, 'fixture', 'restart-installation-held']
      }
    };
    const client: DaemonClient = await connectOrStartDaemonAsync(connection);
    const request = captureDaemonRequest({
      argv: ['test'],
      commandName: 'test',
      commandOrigin: 'custom',
      cwd: folder,
      environment: {},
      terminal: { isTTY: false, supportsColor: false }
    });
    let error: unknown;
    try {
      // The handoff times out while the previous daemon still owns the lockfile, which is a `timeout` error.
      error = await executeWithDaemonRestartAsync(
        client,
        { ...connection, startupTimeoutMs: 100 },
        { request }
      ).catch((caught: unknown) => caught);
    } finally {
      await client.closeAsync();
    }
    expect(error).toBeInstanceOf(DaemonRestartFailedError);
    const { cause, code, message, restartReason } = error as DaemonRestartFailedError;
    expect(cause).toBeInstanceOf(DaemonClientError);
    expect(cause).not.toBeInstanceOf(DaemonRestartFailedError);
    expect((cause as DaemonClientError).code).toBe('timeout');
    expect(code).toBe('timeout');
    expect(message).toBe((cause as DaemonClientError).message);
    expect(message).toContain('The previous daemon still owns');
    expect(restartReason).toEqual({
      kind: 'installationChanged',
      change: 'removed',
      folder: path.join(folder, 'gone')
    });
    expect(readLines(path.join(folder, 'starts'))).toHaveLength(1);
    expect(readLines(path.join(folder, 'requests'))).toHaveLength(1);
    // The daemon kept its ownership: it did not stop as if for an ordinary restart.
    expect(readIfPresent(path.join(folder, 'restarted'))).toBe('');
  });
});
