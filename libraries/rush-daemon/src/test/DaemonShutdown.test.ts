// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { createDaemonHello, DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';
import { readDaemonLockfile } from '@rushstack/rush-daemon-transport';

import { DaemonShutdownError } from '../DaemonShutdownError';
import { RushDaemonHost } from '../RushDaemonHost';
import { serveRushDaemonAsync } from '../serveRushDaemon';
import { DaemonRequestWireClient } from './DaemonRequestWireTestUtilities';
import { TestWorkspaceSession } from './TestWorkspaceSession';

const SHUTTING_DOWN: string = `rushd (PID ${process.pid}) shutting down: `;

describe('daemon management shutdown', () => {
  let repoRoot: string;
  let host: RushDaemonHost;
  let client: DaemonRequestWireClient;
  let logs: string[];
  let writeLog: (message: string) => void;

  beforeEach(async () => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-shutdown-'));
    logs = [];
    writeLog = (message: string) => logs.push(message);
    host = await RushDaemonHost.startAsync({
      createWorkspaceSessionAsync: () => Promise.resolve(new TestWorkspaceSession(repoRoot)),
      daemonVersion: 'shutdown-test',
      onLog: (message: string) => writeLog(message),
      repoRoot,
      rushVersion: '5.178.1'
    });
    client = await DaemonRequestWireClient.connectAsync(host.paths.socketPath);
  });

  afterEach(async () => {
    await client.closeAsync();
    await host.closeAsync();
    fs.rmSync(repoRoot, { force: true, recursive: true });
  });

  it('acknowledges shutdown before closing and releasing the endpoint', async () => {
    await client.sendControlAsync(createDaemonHello(DAEMON_PROTOCOL_VERSION));
    expect((await client.readControlAsync()).kind).toBe('helloAck');
    await client.sendControlAsync({ kind: 'shutdown', payload: {} });
    expect(await client.readControlAsync()).toEqual({ kind: 'shutdownAck', payload: { activeRequests: 0 } });
    await client.closed;
    await host.closed;
    expect(readDaemonLockfile(host.paths.lockfilePath)).toBeUndefined();
    expect(logs).toEqual([
      `${SHUTTING_DOWN}requested by a client ("rush-client daemon stop" or "daemon restart")`
    ]);
  });

  it('requires a handshake before a client can stop the daemon', async () => {
    await client.sendControlAsync({ kind: 'shutdown', payload: {} });
    expect((await client.readControlAsync()).kind).toBe('error');
    await client.closed;
    expect(readDaemonLockfile(host.paths.lockfilePath)).toBeDefined();
    expect(logs).toEqual([]);
  });

  it('logs only the first reason when it is closed more than once', async () => {
    await Promise.all([
      host.closeAsync(new DaemonShutdownError({ initiator: 'signal', signal: 'SIGINT' })),
      host.closeAsync()
    ]);
    await host.closeAsync(new DaemonShutdownError({ initiator: 'idleTimeout' }));
    expect(logs).toEqual([`${SHUTTING_DOWN}received SIGINT`]);
  });

  it('logs a close without a reason', async () => {
    await host.closeAsync();
    expect(logs).toEqual([`${SHUTTING_DOWN}the daemon host was closed`]);
  });

  it('still shuts down when its onLog callback throws', async () => {
    writeLog = () => {
      throw new Error('The log callback failed.');
    };
    await host.closeAsync(new DaemonShutdownError({ initiator: 'signal', signal: 'SIGTERM' }));
    expect(readDaemonLockfile(host.paths.lockfilePath)).toBeUndefined();
  });

  it('logs the signal that stopped a served daemon', async () => {
    const servedRoot: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-shutdown-served-'));
    const served: string[] = [];
    const controller: AbortController = new AbortController();
    try {
      await serveRushDaemonAsync({
        createWorkspaceSessionAsync: () => Promise.resolve(new TestWorkspaceSession(servedRoot)),
        daemonVersion: 'shutdown-test',
        onLog: (message: string) => served.push(message),
        onReady: () => controller.abort(new DaemonShutdownError({ initiator: 'signal', signal: 'SIGTERM' })),
        repoRoot: servedRoot,
        rushVersion: '5.178.1',
        shutdownSignal: controller.signal
      });
    } finally {
      fs.rmSync(servedRoot, { force: true, recursive: true });
    }
    expect(served).toEqual([`${SHUTTING_DOWN}received SIGTERM`]);
  });

  it('does not accept lifecycle controls from an older negotiated minor', async () => {
    await client.sendControlAsync(createDaemonHello({ ...DAEMON_PROTOCOL_VERSION, minor: 5 }));
    expect((await client.readControlAsync()).kind).toBe('helloAck');
    await client.sendControlAsync({ kind: 'shutdown', payload: {} });
    expect((await client.readControlAsync()).kind).toBe('error');
    await client.closed;
    expect(readDaemonLockfile(host.paths.lockfilePath)).toBeDefined();
  });

  it('reports live process identity and memory in status probes', async () => {
    await client.handshakeAsync();
    await client.sendControlAsync({ kind: 'ping', payload: {} });
    const pong = await client.readControlAsync();
    expect(pong).toMatchObject({
      kind: 'pong',
      payload: { pid: process.pid, residentMemoryBytes: expect.any(Number) }
    });
  });
});
