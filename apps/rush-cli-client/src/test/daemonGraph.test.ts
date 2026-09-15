// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Rush } from '@microsoft/rush-lib';
import {
  createDaemonHelloAck, DAEMON_PROTOCOL_VERSION, DaemonFrameType,
  decodeDaemonControlMessage, encodeDaemonControlMessage, encodeDaemonEventFrame,
  RUSHD_GRAPH_SNAPSHOT, type DaemonControlMessage
} from '@rushstack/rush-daemon-protocol';
import { DaemonFrameListener, type DaemonFrameConnection } from '@rushstack/rush-daemon-transport';

import { getDaemonConnectionOptions } from '../daemonConnectionOptions';

describe('graph client fails closed over the public wire', () => {
  it.each(['unsupported', 'missing-snapshot', 'invalid-snapshot', 'old-protocol'])(
    'rejects %s without invoking native Rush',
    async (mode) => {
      const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-graph-peer-'));
      const peers: Set<DaemonFrameConnection> = new Set();
      let listener: DaemonFrameListener | undefined;
      let requests: number = 0;
      try {
        fs.writeFileSync(path.join(folder, 'rush.json'), JSON.stringify({
          rushVersion: Rush.version, npmVersion: '10.0.0', projects: []
        }));
        const { paths } = getDaemonConnectionOptions(folder, Rush.version, process.env, false);
        const protocolVersion = mode === 'old-protocol' ? { major: 0, minor: 1 } : DAEMON_PROTOCOL_VERSION;
        listener = await DaemonFrameListener.listenAsync(paths, {
          protocolVersion,
          onConnection: (connection) => {
            peers.add(connection);
            connection.onClosed(() => { peers.delete(connection); });
            const send = (message: DaemonControlMessage): Promise<void> => connection.sendFrameAsync({
              kind: DaemonFrameType.controlJson, payload: encodeDaemonControlMessage(message)
            });
            connection.onFrame(async (frame) => {
              const message = decodeDaemonControlMessage(frame.payload);
              if (message.kind === 'hello') {
                await send(createDaemonHelloAck(protocolVersion, 'old-graph-peer'));
              } else if (message.kind === 'ping') {
                await send({ kind: 'pong', payload: { uptimeMs: 1 } });
              } else if (message.kind === 'requestStart') {
                requests++;
                expect(message.payload).toMatchObject({
                  commandOrigin: 'built-in', commandName: 'daemon', argv: ['daemon', 'graph', 'show']
                });
                const requestId: string = message.payload.requestId;
                if (mode === 'unsupported') {
                  await send({
                    kind: 'requestRejected', payload: { requestId, code: 'unsupported', message: 'No graph route.' }
                  });
                  return;
                }
                if (mode === 'invalid-snapshot') {
                  await connection.sendFrameAsync({
                    kind: DaemonFrameType.event,
                    payload: encodeDaemonEventFrame({
                      protocolVersion, eventId: 'bad-event', sessionId: 'old-graph-peer', sequence: 1,
                      timestamp: new Date().toISOString(),
                      source: { packageName: '@rushstack/rush-daemon', packageVersion: '0.0.0' },
                      type: 'extension', privacy: 'local-sensitive', required: true,
                      payload: { name: RUSHD_GRAPH_SNAPSHOT, data: { requestId, snapshot: { initialized: 'invalid' } } }
                    })
                  });
                  return;
                }
                await send({
                  kind: 'requestResult', payload: { requestId, aborted: false, exitCode: 0, outcome: 'success' }
                });
              }
            });
          }
        });
        const child = spawn(
          process.execPath,
          [path.resolve(__dirname, '../../bin/rush-client'), 'daemon', 'graph', 'show'],
          { cwd: folder, env: { ...process.env, RUSH_DAEMON_EXPERIMENTAL: '1' }, stdio: ['ignore', 'pipe', 'pipe'] }
        );
        let stdout: string = '';
        let stderr: string = '';
        child.stdout.on('data', (bytes: Buffer) => { stdout += bytes.toString(); });
        child.stderr.on('data', (bytes: Buffer) => { stderr += bytes.toString(); });
        expect((await once(child, 'close'))[0]).toBe(1);
        expect(stderr).toBe('');
        expect(JSON.parse(stdout)).toMatchObject({ kind: 'graphError', message: expect.any(String) });
        expect(stdout).not.toMatch(/using in-process|Usage: rush /);
        expect(requests).toBe(mode === 'old-protocol' ? 0 : 1);
      } finally {
        await Promise.all(Array.from(peers, (peer) => peer.closeAsync()));
        await listener?.closeAsync();
        fs.rmSync(folder, { recursive: true, force: true });
      }
    },
    15000
  );
});
