// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { createDaemonHello, DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';
import { readDaemonLockfile } from '@rushstack/rush-daemon-transport';

import { RushDaemonHost } from '../RushDaemonHost';
import { DaemonRequestWireClient } from './DaemonRequestWireTestUtilities';
import { TestWorkspaceSession } from './TestWorkspaceSession';

describe('daemon management shutdown', () => {
  let repoRoot: string;
  let host: RushDaemonHost;
  let client: DaemonRequestWireClient;

  beforeEach(async () => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-shutdown-'));
    host = await RushDaemonHost.startAsync({
      createWorkspaceSessionAsync: () => Promise.resolve(new TestWorkspaceSession(repoRoot)),
      daemonVersion: 'shutdown-test',
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
    expect(await client.readControlAsync()).toEqual({ kind: 'shutdownAck', payload: {} });
    await client.closed;
    await host.closed;
    expect(readDaemonLockfile(host.paths.lockfilePath)).toBeUndefined();
  });

  it('requires a handshake before a client can stop the daemon', async () => {
    await client.sendControlAsync({ kind: 'shutdown', payload: {} });
    expect((await client.readControlAsync()).kind).toBe('error');
    await client.closed;
    expect(readDaemonLockfile(host.paths.lockfilePath)).toBeDefined();
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
