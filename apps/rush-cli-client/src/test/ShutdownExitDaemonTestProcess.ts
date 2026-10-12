// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';

import {
  DAEMON_PROTOCOL_VERSION,
  DaemonFrameType,
  decodeDaemonControlMessage,
  encodeDaemonControlMessage
} from '@rushstack/rush-daemon-protocol';
import { DaemonFrameListener, type IDaemonPaths } from '@rushstack/rush-daemon-transport';

// A stand-in daemon that acknowledges a shutdown and then exits without releasing its files, as a daemon that
// crashes while it shuts down does. Once it listens, it starts an operation process, which shares its process group
// like a phased operation and keeps running after it exits, and prints that process's PID.
async function mainAsync(): Promise<void> {
  const paths: IDaemonPaths = JSON.parse(process.argv[2]);
  await DaemonFrameListener.listenAsync(paths, {
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    onConnection: (connection) => {
      connection.onFrame(async (frame) => {
        const message = decodeDaemonControlMessage(frame.payload);
        if (message.kind === 'hello') {
          await connection.sendFrameAsync({
            kind: DaemonFrameType.controlJson,
            payload: encodeDaemonControlMessage({
              kind: 'helloAck',
              payload: { protocolVersion: DAEMON_PROTOCOL_VERSION, sessionId: 'stand-in' }
            })
          });
        } else if (message.kind === 'ping') {
          await connection.sendFrameAsync({
            kind: DaemonFrameType.controlJson,
            payload: encodeDaemonControlMessage({
              kind: 'pong',
              payload: { daemonVersion: 'stand-in', uptimeMs: 1, pid: process.pid }
            })
          });
        } else if (message.kind === 'shutdown') {
          await connection.sendFrameAsync({
            kind: DaemonFrameType.controlJson,
            payload: encodeDaemonControlMessage({ kind: 'shutdownAck', payload: {} })
          });
          await connection.closeAsync();
          process.kill(process.pid, 'SIGKILL');
        }
      });
    }
  });
  const operation: ChildProcess = spawn(process.execPath, ['-e', process.argv[3]], { stdio: 'ignore' });
  process.stdout.write(`${operation.pid}\n`);
}

mainAsync().catch((error: Error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
