// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import {
  DAEMON_PROTOCOL_VERSION,
  DaemonFrameType,
  encodeDaemonControlMessage,
  encodeDaemonFrame,
  type DaemonControlMessage,
  type IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';
import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { captureDaemonRequest } from '../captureDaemonRequest';
import { DaemonClient, type DaemonClientOutcome } from '../DaemonClient';
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
    // The new daemon still starts. Once it records itself, the cleanup stops it before it removes the folder, which
    // Windows keeps busy while the daemon runs there.
    const deadline: number = Date.now() + 10000;
    while (readLines('starts').length < 2 && Date.now() < deadline) await delayAsync(20);
    expect(readLines('starts')).toHaveLength(2);
  }, 15000);

  // A write-only daemon never reads, so the client's bytes wait unread and its close resets the connection. The
  // client then loses what it had not read yet. A Unix socket stands in for the daemon's.
  describe('whose connection reset', () => {
    const posixIt: jest.It = process.platform === 'win32' ? it.skip : it;

    interface IResetRow {
      /** Whether the client's queue position handler holds, so that the connection pauses, until the reset. */
      readonly holdQueuePosition: boolean;
      /** Whether the daemon sends requestStarted after the queue position. */
      readonly sendRequestStarted: boolean;
    }

    interface IResetOutcome {
      readonly error: unknown;
      readonly exitedPid: number;
      readonly queuedWithoutStarting: boolean;
      readonly restarts: number;
    }

    function writeControlAsync(socket: net.Socket, message: DaemonControlMessage): Promise<void> {
      const bytes: Uint8Array = encodeDaemonFrame({
        kind: DaemonFrameType.controlJson,
        payload: encodeDaemonControlMessage(message)
      });
      return new Promise<void>((resolve, reject) => {
        socket.write(bytes, (error: Error | null | undefined) => (error ? reject(error) : resolve()));
      });
    }

    function exitedText(pid: number, whileQueued: boolean): string {
      return (
        `${DAEMON_DISCONNECTED_MESSAGE} rushd (PID ${pid}) exited while ` +
        `${whileQueued ? 'the command was queued' : 'it ran the command'}; "rush-client daemon logs" may show ` +
        'why. Run the command again; if the daemon exits again, run the command with "rush-client --no-daemon".'
      );
    }

    /** Sends a request without a way to start a new daemon, and resets the connection once the frames are sent. */
    async function runResetRowAsync({
      holdQueuePosition,
      sendRequestStarted
    }: IResetRow): Promise<IResetOutcome> {
      // The daemon reports the PID of a process that has exited, so the client finds it gone after the reset.
      const exitedPid: number = spawnSync(process.execPath, ['-e', '']).pid;
      let accept!: (socket: net.Socket) => void;
      const accepted: Promise<net.Socket> = new Promise<net.Socket>((resolve) => (accept = resolve));
      const server: net.Server = net.createServer({ pauseOnConnect: true }, (socket: net.Socket) => {
        socket.on('error', () => undefined);
        accept(socket);
      });
      await new Promise<void>((resolve) => server.listen(options.paths.socketPath, resolve));
      const clientPromise: Promise<DaemonClient> = DaemonClient.connectAsync({
        socketPath: options.paths.socketPath
      });
      const peer: net.Socket = await accepted;
      try {
        await writeControlAsync(peer, {
          kind: 'helloAck',
          payload: { protocolVersion: DAEMON_PROTOCOL_VERSION, sessionId: 'write-only' }
        });
        await writeControlAsync(peer, {
          kind: 'pong',
          payload: { uptimeMs: 1, daemonVersion: 'fixture', pid: exitedPid }
        });
        const client: DaemonClient = await clientPromise;
        const request: IDaemonRequestEnvelope = captureRequest();
        let queuePositionSeen!: () => void;
        const seen: Promise<void> = new Promise<void>((resolve) => (queuePositionSeen = resolve));
        let release!: () => void;
        const released: Promise<void> = new Promise<void>((resolve) => (release = resolve));
        let restarts: number = 0;
        const settled: Promise<unknown> = executeWithDaemonRestartAsync(
          client,
          { ...options, startCommand: undefined },
          {
            request,
            onQueuePositionAsync: async () => {
              queuePositionSeen();
              if (holdQueuePosition) await released;
            },
            onRestartAsync: async () => {
              restarts++;
            }
          }
        ).then(
          (outcome: DaemonClientOutcome) => outcome,
          (error: unknown) => error
        );
        try {
          // The client has sent the request once its callbacks ran.
          await new Promise<void>((resolve) => setImmediate(resolve));
          const { requestId } = request;
          await writeControlAsync(peer, { kind: 'queuePosition', payload: { position: 1, requestId } });
          await seen;
          if (sendRequestStarted) {
            await writeControlAsync(peer, { kind: 'requestStarted', payload: { requestId } });
          }
          await delayAsync(50);
          peer.destroy();
          // The client reads the reset while the queue position handler still holds.
          await delayAsync(50);
        } finally {
          release();
        }
        const error: unknown = await settled;
        return { error, exitedPid, queuedWithoutStarting: client.queuedWithoutStarting, restarts };
      } finally {
        peer.destroy();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }

    posixIt(
      'does not say that the request was queued when the reset discarded a requestStarted',
      async () => {
        const outcome: IResetOutcome = await runResetRowAsync({
          holdQueuePosition: true,
          sendRequestStarted: true
        });
        expect(outcome.error).toBeInstanceOf(DaemonClientError);
        expect(outcome.error).not.toBeInstanceOf(DaemonExitedWhileQueuedError);
        expect(outcome.error).toMatchObject({
          code: 'disconnected',
          message: exitedText(outcome.exitedPid, false)
        });
        expect(outcome.queuedWithoutStarting).toBe(false);
        expect(outcome.restarts).toBe(0);
      }
    );

    posixIt(
      'says that the request ran when the client read the requestStarted before the reset',
      async () => {
        const outcome: IResetOutcome = await runResetRowAsync({
          holdQueuePosition: false,
          sendRequestStarted: true
        });
        expect(outcome.error).not.toBeInstanceOf(DaemonExitedWhileQueuedError);
        expect(outcome.error).toMatchObject({
          code: 'disconnected',
          message: exitedText(outcome.exitedPid, false)
        });
        expect(outcome.queuedWithoutStarting).toBe(false);
      }
    );

    posixIt('says that the request was queued when the client read everything before the reset', async () => {
      const outcome: IResetOutcome = await runResetRowAsync({
        holdQueuePosition: false,
        sendRequestStarted: false
      });
      expect(outcome.error).toBeInstanceOf(DaemonExitedWhileQueuedError);
      expect(outcome.error).toMatchObject({
        code: 'disconnected',
        message: exitedText(outcome.exitedPid, true)
      });
      expect(outcome.queuedWithoutStarting).toBe(true);
      expect(outcome.restarts).toBe(0);
    });
  });
});
