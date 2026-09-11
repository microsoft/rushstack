// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { Rush } from '@microsoft/rush-lib';
import {
  RequestExclusivityClass,
  RequestScheduler,
  RequestSchedulerError,
  RequestSchedulerErrorCode,
  type IRequestLease
} from '@rushstack/rush-daemon';
import {
  createDaemonHelloAck,
  DAEMON_PROTOCOL_VERSION,
  DaemonFrameType,
  decodeDaemonControlMessage,
  encodeDaemonControlMessage,
  encodeDaemonEventFrame,
  RUSHD_GRAPH_SNAPSHOT,
  type DaemonControlMessage,
  type IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';
import { DaemonFrameListener, type DaemonFrameConnection } from '@rushstack/rush-daemon-transport';

import { getDaemonConnectionOptions } from '../daemonConnectionOptions';

describe('generation-aware graph reference client', () => {
  it.each([
    'current',
    'explicit',
    'stale-explicit',
    'stale-preflight',
    'mismatched-response',
    'missing-token',
    'old-auto',
    'old-explicit',
    'downgraded-peer'
  ])(
    'fences %s without native fallback or mutation replay',
    async (mode) => {
      const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-generation-'));
      const peers: Set<DaemonFrameConnection> = new Set();
      const requests: IDaemonRequestEnvelope[] = [];
      let listener: DaemonFrameListener | undefined;
      let connections: number = 0;
      try {
        fs.writeFileSync(
          path.join(folder, 'rush.json'),
          JSON.stringify({
            rushVersion: Rush.version,
            npmVersion: '10.0.0',
            projects: []
          })
        );
        const { paths } = getDaemonConnectionOptions(folder, Rush.version, process.env, false);
        listener = await DaemonFrameListener.listenAsync(paths, {
          protocolVersion: DAEMON_PROTOCOL_VERSION,
          onConnection: (connection) => {
            peers.add(connection);
            connection.onClosed(() => {
              peers.delete(connection);
            });
            const old: boolean =
              mode.startsWith('old-') || (mode === 'downgraded-peer' && ++connections === 2);
            const protocolVersion = old ? { major: 0, minor: 8 } : DAEMON_PROTOCOL_VERSION;
            const send = (message: DaemonControlMessage): Promise<void> =>
              connection.sendFrameAsync({
                kind: DaemonFrameType.controlJson,
                payload: encodeDaemonControlMessage(message)
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
                    payload: {
                      requestId: request.requestId,
                      code: 'invalidRequest',
                      message: 'Stale graph generation.'
                    }
                  });
                  return;
                }
                await connection.sendFrameAsync({
                  kind: DaemonFrameType.event,
                  payload: encodeDaemonEventFrame({
                    protocolVersion,
                    eventId: request.requestId,
                    sessionId: 'generation-peer',
                    sequence: 1,
                    timestamp: new Date().toISOString(),
                    type: 'extension',
                    privacy: 'local-sensitive',
                    required: true,
                    source: { packageName: '@rushstack/rush-daemon', packageVersion: '0.0.0' },
                    payload: {
                      name: RUSHD_GRAPH_SNAPSHOT,
                      data: {
                        requestId: request.requestId,
                        snapshot: {
                          initialized: true,
                          workspaceGeneration:
                            mode === 'missing-token'
                              ? undefined
                              : mutation && mode === 'mismatched-response'
                                ? 'replacement-token'
                                : 'current-token'
                        }
                      }
                    }
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
        const child = spawn(
          process.execPath,
          [
            path.resolve(__dirname, '../../bin/rush-client'),
            'daemon',
            'graph',
            'pause',
            ...(explicit ? ['--generation', token] : [])
          ],
          {
            cwd: folder,
            env: { ...process.env, RUSH_DAEMON_EXPERIMENTAL: '1' },
            stdio: ['ignore', 'pipe', 'pipe']
          }
        );
        let stdout: string = '';
        let stderr: string = '';
        child.stdout.on('data', (bytes: Buffer) => {
          stdout += bytes.toString();
        });
        child.stderr.on('data', (bytes: Buffer) => {
          stderr += bytes.toString();
        });
        expect((await once(child, 'close'))[0]).toBe(['current', 'explicit'].includes(mode) ? 0 : 1);
        expect(stderr).toBe('');
        expect(stdout).not.toMatch(/using in-process|Usage: rush /);
        const records = stdout
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line));
        const mutations = requests.filter((request) => request.argv[2] === 'pause');
        if (mode.startsWith('old-') || mode === 'missing-token' || mode === 'downgraded-peer') {
          expect(mutations).toHaveLength(0);
          expect(records).toEqual([{ kind: 'graphError', message: expect.any(String) }]);
        } else {
          expect(mutations).toHaveLength(1);
          expect(mutations[0]).toMatchObject({
            argv: ['daemon', 'graph', 'pause'],
            expectedWorkspaceGeneration: token
          });
          expect(requests).toHaveLength(explicit ? 1 : 2);
          if (mode.startsWith('stale-')) {
            expect(records).toEqual([
              { kind: 'requestRejected', payload: expect.objectContaining({ code: 'invalidRequest' }) }
            ]);
          } else if (mode === 'mismatched-response') {
            expect(records).toEqual([
              { kind: 'graphError', message: expect.stringContaining('different workspace generation') }
            ]);
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
    },
    15000
  );

  it.each([
    'no-wait',
    'timeout',
    'config-timeout',
    'environment-timeout',
    'default',
    'remaining-budget',
    'expired-preflight',
    'explicit',
    'cancel-preflight'
  ])(
    'preserves graph admission and cancellation across %s',
    async (mode) => {
      const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-graph-admission-'));
      const peers: Set<DaemonFrameConnection> = new Set();
      const requests: IDaemonRequestEnvelope[] = [];
      const cancellations: Map<string, AbortController> = new Map();
      const pending: Promise<void>[] = [];
      const scheduler: RequestScheduler = new RequestScheduler();
      const blocked: boolean = [
        'no-wait',
        'timeout',
        'config-timeout',
        'environment-timeout',
        'cancel-preflight'
      ].includes(mode);
      const blocker = blocked
        ? await scheduler.acquireAsync({ exclusivityClass: RequestExclusivityClass.Exclusive })
        : undefined;
      let listener: DaemonFrameListener | undefined;
      let child: ChildProcess | undefined;
      let closed: Promise<unknown[]> | undefined;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        fs.writeFileSync(
          path.join(folder, 'rush.json'),
          JSON.stringify({
            rushVersion: Rush.version,
            npmVersion: '10.0.0',
            projects: [],
            daemon:
              mode === 'config-timeout' || mode === 'environment-timeout'
                ? { queueTimeoutSeconds: 0.5 }
                : undefined
          })
        );
        const { paths } = getDaemonConnectionOptions(folder, Rush.version, process.env, false);
        listener = await DaemonFrameListener.listenAsync(paths, {
          protocolVersion: DAEMON_PROTOCOL_VERSION,
          onConnection: (connection) => {
            peers.add(connection);
            const owned: AbortController[] = [];
            connection.onClosed(() => {
              peers.delete(connection);
              for (const abort of owned) abort.abort();
            });
            const send = (message: DaemonControlMessage): Promise<void> =>
              connection.sendFrameAsync({
                kind: DaemonFrameType.controlJson,
                payload: encodeDaemonControlMessage(message)
              });
            connection.onFrame(async (frame) => {
              const message = decodeDaemonControlMessage(frame.payload);
              if (message.kind === 'hello') {
                await send(createDaemonHelloAck(DAEMON_PROTOCOL_VERSION, 'admission-peer'));
              } else if (message.kind === 'ping') {
                await send({ kind: 'pong', payload: { uptimeMs: 1 } });
              } else if (message.kind === 'requestCancel') {
                cancellations.get(message.payload.requestId)!.abort();
              } else if (message.kind === 'requestStart') {
                const request: IDaemonRequestEnvelope = message.payload;
                requests.push(request);
                const abort: AbortController = new AbortController();
                owned.push(abort);
                cancellations.set(request.requestId, abort);
                const respondAsync = async (): Promise<void> => {
                  let lease: IRequestLease;
                  try {
                    lease = await scheduler.acquireAsync({
                      ...request.admission,
                      exclusivityClass: RequestExclusivityClass.SharedRead,
                      abortSignal: abort.signal
                    });
                  } catch (error) {
                    if (!(error instanceof RequestSchedulerError)) throw error;
                    const aborted: boolean = error.code === RequestSchedulerErrorCode.Aborted;
                    await send({
                      kind: 'requestResult',
                      payload: {
                        requestId: request.requestId,
                        aborted,
                        exitCode: aborted ? 130 : 1,
                        outcome: aborted ? 'aborted' : 'failure',
                        admissionErrorCode: aborted
                          ? 'aborted'
                          : error.code === RequestSchedulerErrorCode.NoWait
                            ? 'no-wait'
                            : 'wait-timeout'
                      }
                    });
                    return;
                  }
                  try {
                    if (
                      request.argv[2] === 'status' &&
                      (mode === 'remaining-budget' || mode === 'expired-preflight')
                    ) {
                      await delayAsync(200);
                    }
                    await connection.sendFrameAsync({
                      kind: DaemonFrameType.event,
                      payload: encodeDaemonEventFrame({
                        protocolVersion: DAEMON_PROTOCOL_VERSION,
                        eventId: request.requestId,
                        sessionId: 'admission-peer',
                        sequence: 1,
                        timestamp: new Date().toISOString(),
                        type: 'extension',
                        privacy: 'local-sensitive',
                        required: true,
                        source: { packageName: '@rushstack/rush-daemon', packageVersion: '0.0.0' },
                        payload: {
                          name: RUSHD_GRAPH_SNAPSHOT,
                          data: {
                            requestId: request.requestId,
                            snapshot: {
                              initialized: false,
                              workspaceGeneration: 'generation',
                              invalidations: {
                                sequence: 0,
                                changedPathCount: 0,
                                hasUnknownChanges: false,
                                isWatcherHealthy: true
                              }
                            }
                          }
                        }
                      })
                    });
                    await send({
                      kind: 'requestResult',
                      payload: {
                        requestId: request.requestId,
                        exitCode: 0,
                        outcome: 'success',
                        aborted: false
                      }
                    });
                  } finally {
                    lease.release();
                  }
                };
                pending.push(respondAsync().catch((error: Error) => connection.abort(error)));
                if (mode === 'cancel-preflight') {
                  if (process.platform === 'win32') child!.send!('SIGINT');
                  else child!.kill('SIGINT');
                }
              }
            });
          }
        });
        const extra: string[] =
          mode === 'no-wait'
            ? ['--no-wait']
            : mode === 'expired-preflight'
              ? ['--wait-timeout', '0.1']
              : ['timeout', 'remaining-budget', 'explicit'].includes(mode)
                ? ['--wait-timeout', '0.5']
                : [];
        if (mode === 'explicit') extra.push('--generation', 'generation');
        const windowsSignal: boolean = mode === 'cancel-preflight' && process.platform === 'win32';
        child = spawn(
          process.execPath,
          [
            windowsSignal
              ? path.join(__dirname, 'CliSignalTestProcess.js')
              : path.resolve(__dirname, '../../bin/rush-client'),
            'daemon',
            'graph',
            'pause',
            ...extra
          ],
          {
            cwd: folder,
            env: {
              ...process.env,
              RUSH_DAEMON_EXPERIMENTAL: '1',
              RUSH_DAEMON_QUEUE_TIMEOUT_SECONDS: mode === 'environment-timeout' ? '0.25' : undefined
            },
            stdio: windowsSignal ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe']
          }
        );
        closed = once(child, 'close');
        deadline = setTimeout(() => child!.kill('SIGKILL'), 10000);
        let stdout: string = '';
        let stderr: string = '';
        child.stdout!.on('data', (bytes: Buffer) => {
          stdout += bytes.toString();
        });
        child.stderr!.on('data', (bytes: Buffer) => {
          stderr += bytes.toString();
        });
        const [code] = await closed;
        expect(stderr).toBe('');
        expect(requests[0].argv[2]).toBe(mode === 'explicit' ? 'pause' : 'status');
        if (mode === 'cancel-preflight') {
          expect(code).toBe(130);
          expect(cancellations.get(requests[0].requestId)!.signal.aborted).toBe(true);
        } else if (blocked || mode === 'expired-preflight') {
          expect(code).toBe(1);
          expect(stdout).toContain(mode === 'expired-preflight' ? 'deadline expired' : 'admission failed');
        } else {
          expect(code).toBe(0);
        }
        if (blocked || mode === 'expired-preflight' || mode === 'explicit') expect(requests).toHaveLength(1);
        if (mode === 'no-wait') {
          expect(requests[0].admission).toEqual({ noWait: true });
        } else {
          const maximum: number =
            mode === 'environment-timeout'
              ? 250
              : mode === 'default' || mode === 'cancel-preflight'
                ? 30000
                : mode === 'expired-preflight'
                  ? 100
                  : 500;
          expect(requests[0].admission!.waitTimeoutMs).toBeGreaterThan(0);
          expect(requests[0].admission!.waitTimeoutMs).toBeLessThanOrEqual(maximum);
        }
        if (mode === 'remaining-budget') {
          expect(requests).toHaveLength(2);
          expect(requests[1].admission!.waitTimeoutMs).toBeLessThanOrEqual(
            requests[0].admission!.waitTimeoutMs! - 150
          );
        }
      } finally {
        clearTimeout(deadline);
        if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        await closed;
        for (const abort of cancellations.values()) abort.abort();
        blocker?.release();
        await Promise.all(pending);
        await Promise.all(Array.from(peers, (peer) => peer.closeAsync()));
        await listener?.closeAsync();
        fs.rmSync(folder, { recursive: true, force: true });
      }
    },
    15000
  );
});
