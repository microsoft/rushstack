// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  DAEMON_PROTOCOL_VERSION,
  DaemonFrameType,
  decodeDaemonControlMessage,
  encodeDaemonControlMessage
} from '@rushstack/rush-daemon-protocol';
import { DaemonFrameListener, type DaemonFrameConnection, type IDaemonPaths } from '@rushstack/rush-daemon-transport';

async function mainAsync(): Promise<void> {
  const paths: IDaemonPaths = JSON.parse(process.argv[2]);
  const folder: string = path.dirname(paths.lockfilePath);
  const daemonVersion: string = process.argv[3] ?? 'fixture';
  const restartMode: string | undefined = process.argv[4];
  const connections: Set<DaemonFrameConnection> = new Set();
  let closing: Promise<void> | undefined;
  fs.appendFileSync(path.join(folder, 'starts'), `${process.pid}\n`);
  fs.appendFileSync(path.join(folder, 'parents'), `${process.ppid}\n`);
  process.stdout.write('launcher stdout\n');
  process.stderr.write('launcher stderr\n');
  if (fs.existsSync(path.join(folder, 'hold-prebind'))) {
    fs.writeFileSync(path.join(folder, 'prebind'), String(process.pid));
    while (fs.existsSync(path.join(folder, 'hold-prebind'))) {
      if (fs.existsSync(path.join(folder, 'stop'))) {
        fs.writeFileSync(path.join(folder, `stopped-${process.pid}`), '');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  const listener = await DaemonFrameListener.listenAsync(paths, {
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    onConnection: (connection) => {
      connections.add(connection);
      connection.onClosed(() => connections.delete(connection));
      connection.onFrame(async (frame) => {
        const message = decodeDaemonControlMessage(frame.payload);
        if (message.kind === 'hello') {
          await connection.sendFrameAsync({
            kind: DaemonFrameType.controlJson,
            payload: encodeDaemonControlMessage({
              kind: 'helloAck',
              payload: { protocolVersion: DAEMON_PROTOCOL_VERSION, sessionId: 'fixture' }
            })
          });
        } else if (message.kind === 'ping') {
          await connection.sendFrameAsync({
            kind: DaemonFrameType.controlJson,
            payload: encodeDaemonControlMessage({
              kind: 'pong',
              payload: { daemonVersion, uptimeMs: 1, pid: process.pid }
            })
          });
        } else if (message.kind === 'requestStart') {
          fs.appendFileSync(path.join(folder, 'requests'), `${daemonVersion}\n`);
          if (message.payload.admission?.waitTimeoutMs !== undefined) {
            fs.appendFileSync(path.join(folder, 'waits'), `${message.payload.admission.waitTimeoutMs}\n`);
          }
          const restart: boolean = restartMode !== undefined &&
            (restartMode !== 'restart-once' || !fs.existsSync(path.join(folder, 'restarted')));
          await connection.sendFrameAsync({
            kind: DaemonFrameType.controlJson,
            payload: encodeDaemonControlMessage({
              kind: 'requestResult',
              payload: {
                requestId: message.payload.requestId,
                exitCode: restart ? 1 : 0,
                outcome: restart ? 'failure' : 'success',
                aborted: false,
                ...(restart ? { retryAfterRestart: true as const } : {})
              }
            })
          });
          if (restart && restartMode !== 'restart-held') {
            fs.writeFileSync(path.join(folder, 'restarted'), '');
            await stopAsync();
          }
        } else if (message.kind === 'shutdown') {
          await connection.sendFrameAsync({
            kind: DaemonFrameType.controlJson,
            payload: encodeDaemonControlMessage({ kind: 'shutdownAck', payload: {} })
          });
          await stopAsync();
        }
      });
    }
  });
  const expiry: number = Date.now() + 10000;
  const timer = setInterval(() => {
    if (!fs.existsSync(path.join(folder, 'stop')) && Date.now() < expiry) return;
    void stopAsync().catch((error: Error) => {
      process.stderr.write(`${error.stack}\n`);
      process.exitCode = 1;
    });
  }, 50);

  function stopAsync(): Promise<void> {
    closing ??= closeOnceAsync();
    return closing;
  }

  async function closeOnceAsync(): Promise<void> {
    clearInterval(timer);
    const stopped: Promise<void> = listener.stopAcceptingAsync();
    await Promise.all([...connections].map((connection) => connection.closeAsync()));
    await stopped;
    if (restartMode) await new Promise((resolve) => setTimeout(resolve, 150));
    await listener.closeAsync();
    fs.writeFileSync(path.join(folder, `stopped-${process.pid}`), '');
  }
}

mainAsync().catch((error: Error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
