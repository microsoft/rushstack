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
import { DaemonFrameListener, type IDaemonPaths } from '@rushstack/rush-daemon-transport';

async function mainAsync(): Promise<void> {
  const paths: IDaemonPaths = JSON.parse(process.argv[2]);
  const folder: string = path.dirname(paths.lockfilePath);
  fs.appendFileSync(path.join(folder, 'starts'), `${process.pid}\n`);
  process.stdout.write('launcher stdout\n');
  process.stderr.write('launcher stderr\n');
  await new Promise((resolve) => setTimeout(resolve, 250));
  const listener = await DaemonFrameListener.listenAsync(paths, {
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    onConnection: (connection) => {
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
              payload: { daemonVersion: 'fixture', uptimeMs: 1 }
            })
          });
        }
      });
    }
  });
  const expiry: number = Date.now() + 10000;
  const timer = setInterval(() => {
    if (!fs.existsSync(path.join(folder, 'stop')) && Date.now() < expiry) return;
    clearInterval(timer);
    listener
      .closeAsync()
      .then(() => fs.writeFileSync(path.join(folder, 'stopped'), ''))
      .catch((error: Error) => {
        process.stderr.write(`${error.stack}\n`);
        process.exitCode = 1;
      });
  }, 50);
}

mainAsync().catch((error: Error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
