// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import {
  DAEMON_PROTOCOL_VERSION,
  DaemonFrameType,
  decodeDaemonControlMessage,
  encodeDaemonControlMessage,
  type DaemonControlMessage
} from '@rushstack/rush-daemon-protocol';
import { DaemonFrameConnection, type IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { DaemonClient } from '../DaemonClient';
import { getDaemonStartupFilePath, reserveDaemonStartup, runDaemonStartupAsync } from '../DaemonStartup';
import { removeTestFolderAsync } from './TestProcessExit';

// Late enough that a readiness backoff doubling from 50 ms would already wait 500 ms between attempts.
const LISTEN_AFTER_MS: number = 1000;

interface ILateReadiness {
  readonly outcome: string;
  /** When each connection attempt before the daemon listened started, in ms since the helper started. */
  readonly failedAttemptStarts: number[];
  /** From the daemon starting to listen to its first connection, in ms. */
  readonly connectionDelayMs: number;
  readonly reservationRemains: boolean;
}

async function waitUntilAsync(condition: () => boolean, description: string): Promise<void> {
  const deadline: number = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting until ${description}.`);
    await delayAsync(5);
  }
}

function isProcessGone(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return true;
    throw error;
  }
}

function createReadyDaemon(onConnection: () => void, sockets: Set<net.Socket>): net.Server {
  return net.createServer((socket) => {
    onConnection();
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    const connection: DaemonFrameConnection = new DaemonFrameConnection(socket);
    connection.onFrame(async (frame) => {
      if (frame.kind !== DaemonFrameType.controlJson) return;
      const message: DaemonControlMessage = decodeDaemonControlMessage(frame.payload);
      let reply: DaemonControlMessage | undefined;
      if (message.kind === 'hello') {
        reply = {
          kind: 'helloAck',
          payload: { protocolVersion: DAEMON_PROTOCOL_VERSION, sessionId: 'test' }
        };
      } else if (message.kind === 'ping') {
        reply = { kind: 'pong', payload: { uptimeMs: 1, daemonVersion: 'test' } };
      }
      if (reply) {
        await connection.sendFrameAsync({
          kind: DaemonFrameType.controlJson,
          payload: encodeDaemonControlMessage(reply)
        });
      }
    });
  });
}

describe(`${runDaemonStartupAsync.name} readiness polling`, () => {
  let folder: string;
  let paths: IDaemonPaths;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-startup-poll-'));
    paths = {
      runtimeDir: folder,
      socketPath:
        process.platform === 'win32'
          ? `\\\\.\\pipe\\rush-client-${path.basename(folder)}`
          : path.join(folder, 'd.sock'),
      lockfilePath: path.join(folder, 'daemon.pid.json')
    };
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await removeTestFolderAsync(folder);
  });

  /**
   * Runs the helper against a launcher that stays alive while nothing listens, like a daemon that is still
   * starting. The daemon starts listening right after the first failed attempt that began `LISTEN_AFTER_MS`
   * after the helper, and answers hello and ping from then on.
   */
  async function runWithLateReadinessAsync(): Promise<ILateReadiness> {
    const sockets: Set<net.Socket> = new Set();
    let firstConnectionAt: number | undefined;
    const server: net.Server = createReadyDaemon(() => {
      firstConnectionAt ??= performance.now();
    }, sockets);
    let listenedAt: number | undefined;
    const failedAttemptStarts: number[] = [];
    const startedAt: number = performance.now();
    const connectAsync: typeof DaemonClient.connectAsync = DaemonClient.connectAsync.bind(DaemonClient);
    jest.spyOn(DaemonClient, 'connectAsync').mockImplementation(async (options) => {
      const attemptStart: number = performance.now() - startedAt;
      try {
        return await connectAsync(options);
      } catch (error) {
        if (listenedAt === undefined) {
          failedAttemptStarts.push(attemptStart);
          if (attemptStart >= LISTEN_AFTER_MS) {
            // listen() binds before it returns, so the endpoint accepts connections from here on.
            server.listen(paths.socketPath);
            listenedAt = performance.now();
          }
        }
        throw error;
      }
    });

    const launcherPidPath: string = path.join(folder, 'launcher-pid');
    const exitNowPath: string = path.join(folder, 'exit-now');
    const launcher: string = [
      "const fs = require('fs');",
      'fs.writeFileSync(process.argv[1], String(process.pid));',
      'setInterval(() => { if (fs.existsSync(process.argv[2])) process.exit(0); }, 5);'
    ].join('\n');
    try {
      const token: string = reserveDaemonStartup(paths, {
        pid: process.pid,
        startedAt: new Date().toISOString()
      });
      const outcome: string = await runDaemonStartupAsync({
        paths,
        token,
        timeoutMs: 10000,
        startCommand: {
          command: process.execPath,
          args: ['-e', launcher, launcherPidPath, exitNowPath],
          cwd: folder,
          environment: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' }
        }
      }).then(
        () => 'resolved',
        (error: Error) => error.message
      );
      if (listenedAt === undefined || firstConnectionAt === undefined) {
        throw new Error(`The daemon never listened or was never reached (${outcome}).`);
      }
      return {
        outcome,
        failedAttemptStarts,
        connectionDelayMs: firstConnectionAt - listenedAt,
        reservationRemains: fs.existsSync(getDaemonStartupFilePath(paths))
      };
    } finally {
      fs.writeFileSync(exitNowPath, '');
      if (fs.existsSync(launcherPidPath)) {
        const launcherPid: number = Number(fs.readFileSync(launcherPidPath, 'utf8'));
        await waitUntilAsync(() => isProcessGone(launcherPid), 'the launcher exits');
      }
      for (const socket of sockets) socket.destroy();
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it('connects within one short poll after the daemon starts listening late in its start', async () => {
    const result: ILateReadiness = await runWithLateReadinessAsync();

    expect(result.outcome).toBe('resolved');
    expect(result.reservationRemains).toBe(false);
    expect(result.connectionDelayMs).toBeLessThan(150);
  });

  it('waits between readiness attempts instead of spinning', async () => {
    const { outcome, failedAttemptStarts }: ILateReadiness = await runWithLateReadinessAsync();

    expect(outcome).toBe('resolved');
    const shortGaps: number[] = [];
    for (let i: number = 1; i < failedAttemptStarts.length; i++) {
      const gap: number = failedAttemptStarts[i] - failedAttemptStarts[i - 1];
      if (gap < 25) shortGaps.push(Math.round(gap));
    }
    expect(failedAttemptStarts.length).toBeGreaterThan(1);
    expect(shortGaps).toEqual([]);
  });
});
