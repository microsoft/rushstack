// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Rush } from '@microsoft/rush-lib';
import {
  createDaemonHelloAck, DAEMON_PROTOCOL_VERSION, DaemonFrameType, decodeDaemonControlMessage,
  encodeDaemonControlMessage, encodeDaemonEventFrame, RUSHD_GRAPH_SNAPSHOT,
  type DaemonControlMessage, type IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';
import { DaemonFrameListener, type DaemonFrameConnection } from '@rushstack/rush-daemon-transport';

import { getDaemonConnectionOptions } from '../daemonConnectionOptions';

describe('generation-aware graph reference client', () => {
  it.each([
    'current', 'explicit', 'stale-explicit', 'stale-preflight', 'mismatched-response',
    'missing-token', 'old-auto', 'old-explicit', 'downgraded-peer'
  ])('fences %s without native fallback or mutation replay', async (mode) => {
    const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-generation-'));
    const peers: Set<DaemonFrameConnection> = new Set();
    const requests: IDaemonRequestEnvelope[] = [];
    let listener: DaemonFrameListener | undefined;
    let connections: number = 0;
    try {
      fs.writeFileSync(path.join(folder, 'rush.json'), JSON.stringify({
        rushVersion: Rush.version, npmVersion: '10.0.0', projects: []
      }));
      const { paths } = getDaemonConnectionOptions(folder, Rush.version, process.env, false);
      listener = await DaemonFrameListener.listenAsync(paths, {
        protocolVersion: DAEMON_PROTOCOL_VERSION,
        onConnection: (connection) => {
          peers.add(connection);
          connection.onClosed(() => { peers.delete(connection); });
          const old: boolean = mode.startsWith('old-') || (mode === 'downgraded-peer' && ++connections === 2);
          const protocolVersion = old ? { major: 0, minor: 8 } : DAEMON_PROTOCOL_VERSION;
          const send = (message: DaemonControlMessage): Promise<void> => connection.sendFrameAsync({
            kind: DaemonFrameType.controlJson, payload: encodeDaemonControlMessage(message)
          });
          connection.onFrame(async (frame) => {
            const message = decodeDaemonControlMessage(frame.payload);
            if (message.kind === 'hello') {
              await send(createDaemonHelloAck(protocolVersion, 'generation-peer'));
            } else if (message.kind === 'ping') {
              await send({ kind: 'pong', payload: { uptimeMs: 1 } });
            } else if (message.kind === 'requestStart') {
              const request: IDaemonRequestEnvelope = message.payload;
              requests.push(request);
              const mutation: boolean = request.argv[2] === 'pause';
              if (mutation && mode.startsWith('stale-')) {
                await send({
                  kind: 'requestRejected',
                  payload: { requestId: request.requestId, code: 'invalidRequest', message: 'Stale graph generation.' }
                });
                return;
              }
              await connection.sendFrameAsync({
                kind: DaemonFrameType.event,
                payload: encodeDaemonEventFrame({
                  protocolVersion, eventId: request.requestId, sessionId: 'generation-peer', sequence: 1,
                  timestamp: new Date().toISOString(), type: 'extension', privacy: 'local-sensitive', required: true,
                  source: { packageName: '@rushstack/rush-daemon', packageVersion: '0.0.0' },
                  payload: { name: RUSHD_GRAPH_SNAPSHOT, data: {
                    requestId: request.requestId,
                    snapshot: {
                      initialized: true,
                      workspaceGeneration: mode === 'missing-token' ? undefined
                        : mutation && mode === 'mismatched-response' ? 'replacement-token' : 'current-token'
                    }
                  } }
                })
              });
              await send({
                kind: 'requestResult',
                payload: { requestId: request.requestId, exitCode: 0, outcome: 'success', aborted: false }
              });
            }
          });
        }
      });
      const explicit: boolean = ['explicit', 'stale-explicit', 'old-explicit'].includes(mode);
      const token: string = mode === 'stale-explicit' ? 'old-token' : 'current-token';
      const child = spawn(process.execPath, [
        path.resolve(__dirname, '../../bin/rush-client'), 'daemon', 'graph', 'pause',
        ...(explicit ? ['--generation', token] : [])
      ], {
        cwd: folder, env: { ...process.env, RUSH_DAEMON_EXPERIMENTAL: '1' }, stdio: ['ignore', 'pipe', 'pipe']
      });
      let stdout: string = '';
      let stderr: string = '';
      child.stdout.on('data', (bytes: Buffer) => { stdout += bytes.toString(); });
      child.stderr.on('data', (bytes: Buffer) => { stderr += bytes.toString(); });
      expect((await once(child, 'close'))[0]).toBe(['current', 'explicit'].includes(mode) ? 0 : 1);
      expect(stderr).toBe('');
      expect(stdout).not.toMatch(/using in-process|Usage: rush /);
      const records = stdout.trim().split('\n').map((line) => JSON.parse(line));
      const mutations = requests.filter((request) => request.argv[2] === 'pause');
      if (mode.startsWith('old-') || mode === 'missing-token' || mode === 'downgraded-peer') {
        expect(mutations).toHaveLength(0);
        expect(records).toEqual([{ kind: 'graphError', message: expect.any(String) }]);
      } else {
        expect(mutations).toHaveLength(1);
        expect(mutations[0]).toMatchObject({
          argv: ['daemon', 'graph', 'pause'], expectedWorkspaceGeneration: token
        });
        expect(requests).toHaveLength(explicit ? 1 : 2);
        if (mode.startsWith('stale-')) {
          expect(records).toEqual([{ kind: 'requestRejected', payload: expect.objectContaining({ code: 'invalidRequest' }) }]);
        } else if (mode === 'mismatched-response') {
          expect(records).toEqual([{ kind: 'graphError', message: expect.stringContaining('different workspace generation') }]);
        } else {
          expect(records).toHaveLength(2);
          expect(records[0].payload.data.requestId).toBe(mutations[0].requestId);
          expect(records[1]).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
        }
      }
    } finally {
      await Promise.all(Array.from(peers, (peer) => peer.closeAsync()));
      await listener?.closeAsync();
      fs.rmSync(folder, { recursive: true, force: true });
    }
  }, 15000);
});
