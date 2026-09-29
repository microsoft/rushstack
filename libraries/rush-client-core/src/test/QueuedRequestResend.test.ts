// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import type { IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';
import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { captureDaemonRequest } from '../captureDaemonRequest';
import type { DaemonClient, DaemonClientOutcome } from '../DaemonClient';
import {
  DAEMON_DISCONNECTED_AFTER_RESEND_MESSAGE,
  DAEMON_DISCONNECTED_MESSAGE,
  DaemonClientError
} from '../DaemonClientError';
import { DaemonExitedWhileQueuedError } from '../DaemonDisconnect';
import { connectOrStartDaemonAsync, type IConnectOrStartDaemonOptions } from '../connectOrStartDaemon';
import { executeWithDaemonRestartAsync, type IDaemonRestartNotice } from '../executeWithDaemonRestart';
import { removeTestFolderAsync, waitForTestProcessExitAsync } from './TestProcessExit';

function readIfPresent(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

// A file of its own, since connectOrStartDaemon.test.ts is close to the 2,000-line max-lines limit.
describe('a request that waited in the queue of a daemon that exited', () => {
  let folder: string;
  let options: IConnectOrStartDaemonOptions;

  /** The lines of the file that fixture daemons write in the test folder. */
  function readLines(name: string): string[] {
    return fs.readFileSync(path.join(folder, name), 'utf8').trim().split('\n');
  }

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-resend-'));
    const paths: IDaemonPaths = {
      runtimeDir: folder,
      socketPath:
        process.platform === 'win32'
          ? `\\\\.\\pipe\\rush-client-resend-${path.basename(folder)}`
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
      const pids: string[] = readLines('starts');
      await Promise.all(pids.map((pid) => waitForTestProcessExitAsync(Number(pid))));
      expect(pids.every((pid) => fs.existsSync(path.join(folder, `stopped-${pid}`)))).toBe(true);
    }
    // A fixture daemon that fails a check records it here.
    expect(readIfPresent(path.join(folder, 'failures'))).toBe('');
    if (fs.existsSync(path.join(folder, 'parents'))) {
      const parents = new Set(readLines('parents'));
      await Promise.all([...parents].map((pid) => waitForTestProcessExitAsync(Number(pid))));
    }
    await removeTestFolderAsync(folder);
  });

  /** The connection options of a fixture daemon that behaves as `mode` says. */
  function withMode(mode: string): IConnectOrStartDaemonOptions {
    return {
      ...options,
      startCommand: { ...options.startCommand!, args: [...options.startCommand!.args, 'fixture', mode] }
    };
  }

  function captureRequest(): IDaemonRequestEnvelope {
    return captureDaemonRequest({
      argv: ['test'],
      commandName: 'test',
      commandOrigin: 'custom',
      cwd: folder,
      environment: {},
      terminal: { isTTY: false, supportsColor: false }
    });
  }

  function exitedMessage(pid: number): string {
    return (
      `${DAEMON_DISCONNECTED_MESSAGE} rushd (PID ${pid}) exited while it ran the command; ` +
      '"rush-client daemon logs" shows why. Run the command again; ' +
      'if the daemon exits again, run the command with "rush-client --no-daemon".'
    );
  }

  const queuedMessage = (prefix: string, pid: number): string =>
    `${prefix} rushd (PID ${pid}) exited while the command was queued; "rush-client daemon logs" shows why. ` +
    'Run the command again; if the daemon exits again, run the command with "rush-client --no-daemon".\n' +
    'The daemon log reports: Error: fixture daemon crash while running the request';

  function withWaitTimeout(waitTimeoutMs: number): IDaemonRequestEnvelope {
    return captureDaemonRequest({ ...captureRequest(), admission: { waitTimeoutMs } });
  }

  it('tells the caller which daemon exited before it starts a new daemon, and sends the request there once', async () => {
    const connection: IConnectOrStartDaemonOptions = withMode('crash-while-queued-once');
    const client: DaemonClient = await connectOrStartDaemonAsync(connection);
    const { pid } = await client.status;
    const notices: IDaemonRestartNotice[] = [];
    const outcome: DaemonClientOutcome = await executeWithDaemonRestartAsync(client, connection, {
      request: captureRequest(),
      onRestartAsync: async (notice) => {
        // No new daemon has started yet.
        expect(readLines('starts')).toHaveLength(1);
        expect(readLines('requests')).toHaveLength(1);
        notices.push(notice);
      }
    });
    expect(outcome).toMatchObject({ kind: 'result', result: { exitCode: 0 } });
    expect(readLines('starts').map(Number)).toEqual([pid, expect.any(Number)]);
    expect(notices).toEqual([{ restart: 1, reason: undefined, successorPid: undefined, exitedPid: pid }]);
    expect(readLines('requests')).toHaveLength(2);
  });

  it('passes on what remains of an explicit wait deadline', async () => {
    const waitTimeoutMs: number = 10000;
    const connection: IConnectOrStartDaemonOptions = withMode('crash-while-queued-once');
    const client: DaemonClient = await connectOrStartDaemonAsync(connection);
    expect(
      await executeWithDaemonRestartAsync(client, connection, { request: withWaitTimeout(waitTimeoutMs) })
    ).toMatchObject({ kind: 'result', result: { exitCode: 0 } });
    const waits: number[] = readLines('waits').map(Number);
    expect(waits).toHaveLength(2);
    expect(waits[0]).toBe(waitTimeoutMs);
    expect(waits[1]).toBeLessThan(waitTimeoutMs);
    expect(waits[1]).toBeGreaterThan(0);
  });

  it('sends the request only once when the new daemon also exits while the request waits', async () => {
    const connection: IConnectOrStartDaemonOptions = withMode('crash-while-queued');
    const client: DaemonClient = await connectOrStartDaemonAsync(connection);
    const notices: IDaemonRestartNotice[] = [];
    const error: unknown = await executeWithDaemonRestartAsync(client, connection, {
      request: captureRequest(),
      onRestartAsync: async (notice) => {
        notices.push(notice);
      }
    }).catch((failure: unknown) => failure);
    const starts: number[] = readLines('starts').map(Number);
    expect(starts).toHaveLength(2);
    expect(error).toBeInstanceOf(DaemonClientError);
    expect(error).not.toBeInstanceOf(DaemonExitedWhileQueuedError);
    expect(error).toMatchObject({
      code: 'disconnected',
      message: queuedMessage(DAEMON_DISCONNECTED_AFTER_RESEND_MESSAGE, starts[1])
    });
    expect(notices).toHaveLength(1);
    expect(readLines('requests')).toHaveLength(2);
  });

  it('does not send the request again once the daemon said that it started the request', async () => {
    const connection: IConnectOrStartDaemonOptions = withMode('crash-after-start-notice');
    const client: DaemonClient = await connectOrStartDaemonAsync(connection);
    const { pid } = await client.status;
    await expect(
      executeWithDaemonRestartAsync(client, connection, { request: captureRequest() })
    ).rejects.toMatchObject({
      code: 'disconnected',
      message:
        `${exitedMessage(pid!)}\n` +
        'The daemon log reports: Error: fixture daemon crash while running the request'
    });
    expect(readLines('starts')).toHaveLength(1);
  });

  it('does not send the request again while the daemon that closed the connection still runs', async () => {
    const connection: IConnectOrStartDaemonOptions = withMode('close-while-queued');
    const client: DaemonClient = await connectOrStartDaemonAsync(connection);
    const { pid } = await client.status;
    await expect(
      executeWithDaemonRestartAsync(client, connection, { request: captureRequest() })
    ).rejects.toMatchObject({
      code: 'disconnected',
      message: `${DAEMON_DISCONNECTED_MESSAGE} The connection to rushd (PID ${pid}) closed, but the daemon is still running; run the command again.`
    });
    expect(readLines('starts')).toHaveLength(1);
    expect(readLines('requests')).toHaveLength(1);
  });

  it('does not send the request again without a way to start a daemon', async () => {
    const connection: IConnectOrStartDaemonOptions = withMode('crash-while-queued-once');
    const client: DaemonClient = await connectOrStartDaemonAsync(connection);
    const { pid } = await client.status;
    await expect(
      executeWithDaemonRestartAsync(
        client,
        { ...connection, startCommand: undefined },
        { request: captureRequest() }
      )
    ).rejects.toMatchObject({
      code: 'disconnected',
      message: queuedMessage(DAEMON_DISCONNECTED_MESSAGE, pid!)
    });
    expect(readLines('starts')).toHaveLength(1);
  });

  it('does not send the request again once its explicit wait deadline expired', async () => {
    const connection: IConnectOrStartDaemonOptions = withMode('crash-while-queued-once');
    const client: DaemonClient = await connectOrStartDaemonAsync(connection);
    const { pid } = await client.status;
    await expect(
      executeWithDaemonRestartAsync(client, connection, { request: withWaitTimeout(1) })
    ).rejects.toMatchObject({
      code: 'disconnected',
      message: queuedMessage(DAEMON_DISCONNECTED_MESSAGE, pid!)
    });
    expect(readLines('starts')).toHaveLength(1);
  });

  it('returns the aborted result when the request is cancelled while a new daemon starts', async () => {
    const connection: IConnectOrStartDaemonOptions = withMode('crash-while-queued-once');
    const client: DaemonClient = await connectOrStartDaemonAsync(connection);
    // The new daemon waits before it listens.
    fs.writeFileSync(path.join(folder, 'startup-delay-ms'), '1500');
    const abort: AbortController = new AbortController();
    const notices: IDaemonRestartNotice[] = [];
    const pending: Promise<DaemonClientOutcome> = executeWithDaemonRestartAsync(client, connection, {
      request: captureRequest(),
      abortSignal: abort.signal,
      onRestartAsync: async (notice) => {
        notices.push(notice);
      }
    });
    const deadline: number = Date.now() + 5000;
    while (readLines('starts').length < 2 && Date.now() < deadline) await delayAsync(20);
    expect(readLines('starts')).toHaveLength(2);
    expect(notices).toHaveLength(1);
    abort.abort();
    expect(await pending).toMatchObject({
      kind: 'result',
      result: { exitCode: 130, outcome: 'aborted', aborted: true }
    });
    expect(readLines('requests')).toHaveLength(1);
  });

  it('says that a new daemon did not start', async () => {
    const connection: IConnectOrStartDaemonOptions = withMode('crash-while-queued-once');
    const client: DaemonClient = await connectOrStartDaemonAsync(connection);
    const { pid } = await client.status;
    // The new daemon waits longer before it listens than the client waits for it.
    fs.writeFileSync(path.join(folder, 'startup-delay-ms'), '2000');
    const notices: IDaemonRestartNotice[] = [];
    const error: unknown = await executeWithDaemonRestartAsync(
      client,
      { ...connection, startupTimeoutMs: 300 },
      {
        request: captureRequest(),
        onRestartAsync: async (notice) => {
          notices.push(notice);
        }
      }
    ).catch((failure: unknown) => failure);
    // The failure follows the notice that the command is sent to a new daemon.
    expect(notices).toEqual([{ restart: 1, reason: undefined, successorPid: undefined, exitedPid: pid }]);
    expect(error).toBeInstanceOf(DaemonClientError);
    expect((error as DaemonClientError).message).toMatch(
      new RegExp(
        `^rushd \\(PID ${pid}\\) exited while the command was queued, and a new daemon did not start: .`
      )
    );
    expect((error as DaemonClientError).cause).toBeInstanceOf(DaemonClientError);
    expect(readLines('requests')).toHaveLength(1);
  });
});
