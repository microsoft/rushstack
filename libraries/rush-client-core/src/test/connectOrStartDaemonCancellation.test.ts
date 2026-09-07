// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { once } from 'node:events';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  DAEMON_PROTOCOL_VERSION,
  DaemonFrameType,
  decodeDaemonControlMessage,
  encodeDaemonControlMessage,
  type DaemonControlMessage
} from '@rushstack/rush-daemon-protocol';
import { DaemonFrameConnection, type IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { connectOrStartDaemonAsync } from '../connectOrStartDaemon';
import type { DaemonClient } from '../DaemonClient';
import { DaemonClientError } from '../DaemonClientError';

describe('startup cancellation during readiness', () => {
  let folder: string;
  let paths: IDaemonPaths;
  let server: net.Server;
  let socket: net.Socket;
  let connection: DaemonFrameConnection | undefined;
  let client: DaemonClient | undefined;
  let pingReceived: Promise<void>;

  beforeEach(async () => {
    client = undefined;
    connection = undefined;
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-startup-cancel-'));
    paths = {
      runtimeDir: folder,
      lockfilePath: path.join(folder, 'daemon.pid.json'),
      socketPath:
        process.platform === 'win32'
          ? `\\\\.\\pipe\\${path.basename(folder)}`
          : path.join(folder, 'daemon.sock')
    };
    let receivedPing!: () => void;
    pingReceived = new Promise<void>((resolve) => {
      receivedPing = resolve;
    });
    server = net.createServer((accepted) => {
      socket = accepted;
      connection = new DaemonFrameConnection(accepted);
      connection.onFrame(async (frame) => {
        const message = decodeDaemonControlMessage(frame.payload);
        if (message.kind === 'hello') {
          await sendAsync({
            kind: 'helloAck',
            payload: { protocolVersion: DAEMON_PROTOCOL_VERSION, sessionId: 'cancel-test' }
          });
        } else if (message.kind === 'ping') {
          receivedPing();
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(paths.socketPath, resolve));
  });

  afterEach(async () => {
    await client?.closeAsync();
    await connection?.closeAsync();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    fs.rmSync(folder, { recursive: true });
  });

  async function sendAsync(message: DaemonControlMessage): Promise<void> {
    await connection!.sendFrameAsync({
      kind: DaemonFrameType.controlJson,
      payload: encodeDaemonControlMessage(message)
    });
  }

  function connectAsync(abortSignal: AbortSignal): Promise<DaemonClient> {
    return connectOrStartDaemonAsync({ paths, abortSignal }).then((ready) => {
      client = ready;
      return ready;
    });
  }

  it.each(['default', 'timeout-shaped'])(
    'rejects %s cancellation and closes the client when a delayed pong arrives',
    async (reasonKind) => {
      const abort: AbortController = new AbortController();
      const pending: Promise<DaemonClient> = connectAsync(abort.signal);
      await pingReceived;
      const closed: Promise<unknown[]> = once(socket, 'close');
      abort.abort(
        reasonKind === 'timeout-shaped' ? new DaemonClientError('timeout', 'cancelled by host') : undefined
      );

      await Promise.all([
        expect(pending).rejects.toBe(abort.signal.reason),
        sendAsync({ kind: 'pong', payload: { uptimeMs: 1, daemonVersion: 'test' } }),
        closed
      ]);
      expect(client).toBeUndefined();
    }
  );

  it('preserves cancellation when the pending handshake disconnects without a pong', async () => {
    const abort: AbortController = new AbortController();
    const pending: Promise<DaemonClient> = connectAsync(abort.signal);
    await pingReceived;
    abort.abort(new Error('cancelled before readiness'));

    await Promise.all([expect(pending).rejects.toBe(abort.signal.reason), connection!.closeAsync()]);
    expect(client).toBeUndefined();
  });
});
