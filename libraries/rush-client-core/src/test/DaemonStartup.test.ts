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

import { getDaemonStartupFilePath, reserveDaemonStartup, runDaemonStartupAsync } from '../DaemonStartup';
import { removeTestFolderAsync } from './TestProcessExit';

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

describe(runDaemonStartupAsync.name, () => {
  let folder: string;
  let paths: IDaemonPaths;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-startup-'));
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
    await removeTestFolderAsync(folder);
  });

  it('releases its reservation for a ready daemon although its own launcher exited during the last attempt', async () => {
    // Like a daemon that another launch published while this helper's launcher found it and exited: the launcher
    // exits while a connection attempt is pending, that attempt fails, and the next one finds a ready daemon.
    const pending: DaemonFrameConnection[] = [];
    const closedConnections: Set<DaemonFrameConnection> = new Set();
    let answering: boolean = false;
    const sockets: Set<net.Socket> = new Set();
    const server: net.Server = net.createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      const connection: DaemonFrameConnection = new DaemonFrameConnection(socket);
      connection.onClosed(() => closedConnections.add(connection));
      connection.onFrame(async (frame) => {
        if (frame.kind !== DaemonFrameType.controlJson) return;
        const message: DaemonControlMessage = decodeDaemonControlMessage(frame.payload);
        let reply: DaemonControlMessage | undefined;
        if (message.kind === 'hello') {
          if (!answering) {
            pending.push(connection);
            return;
          }
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
    await new Promise<void>((resolve) => server.listen(paths.socketPath, resolve));
    try {
      const token: string = reserveDaemonStartup(paths, {
        pid: process.pid,
        startedAt: new Date().toISOString()
      });
      const launcherPidPath: string = path.join(folder, 'launcher-pid');
      const exitNowPath: string = path.join(folder, 'exit-now');
      const launcher: string = [
        "const fs = require('fs');",
        `fs.writeFileSync(${JSON.stringify(launcherPidPath)}, String(process.pid));`,
        `setInterval(() => { if (fs.existsSync(${JSON.stringify(exitNowPath)})) process.exit(1); }, 5);`
      ].join('\n');
      const outcome: Promise<string> = runDaemonStartupAsync({
        paths,
        token,
        timeoutMs: 10000,
        startCommand: {
          command: process.execPath,
          args: ['-e', launcher],
          cwd: folder,
          environment: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' }
        }
      }).then(
        () => 'resolved',
        (error: Error) => error.message
      );

      await waitUntilAsync(() => pending.length > 0 && fs.existsSync(launcherPidPath), 'the first attempt');
      const attempt: DaemonFrameConnection = pending[pending.length - 1];
      const launcherPid: number = Number(fs.readFileSync(launcherPidPath, 'utf8'));
      fs.writeFileSync(exitNowPath, '');
      // This process spawned the launcher, so once its PID is gone, the helper has observed its exit.
      await waitUntilAsync(() => isProcessGone(launcherPid), 'the launcher is reaped');
      expect(closedConnections.has(attempt)).toBe(false);
      answering = true;
      await attempt.closeAsync();

      expect(await outcome).toBe('resolved');
      expect(fs.existsSync(getDaemonStartupFilePath(paths))).toBe(false);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
