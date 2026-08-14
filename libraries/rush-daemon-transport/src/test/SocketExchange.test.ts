// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DAEMON_PROTOCOL_VERSION, DaemonFrameType } from '@rushstack/rush-daemon-protocol';
import type { IDaemonFrame } from '@rushstack/rush-daemon-protocol';

import { connectDaemonAsync } from '../DaemonConnector';
import type { DaemonFrameConnection } from '../DaemonFrameConnection';
import { DaemonFrameListener } from '../DaemonListener';
import { readDaemonLockfile } from '../DaemonLockfile';
import type { IDaemonPaths } from '../DaemonPaths';

import { createDeferred, createTestDaemonPaths } from './TestDaemonFixture';

const BYTE_FF: number = 0xff;
const BYTE_00: number = 0x00;
const BINARY_PAYLOAD: Buffer = Buffer.from([BYTE_FF, BYTE_00, BYTE_FF]);

it('exchanges a frame over the workspace socket with a written lockfile', async () => {
  const paths: IDaemonPaths = createTestDaemonPaths();
  const serverReady: ReturnType<typeof createDeferred<DaemonFrameConnection>> =
    createDeferred<DaemonFrameConnection>();
  const listener: DaemonFrameListener = await DaemonFrameListener.listenAsync(paths, {
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    onConnection: (connection: DaemonFrameConnection) => serverReady.resolve(connection)
  });
  const client: DaemonFrameConnection = await connectDaemonAsync(paths.socketPath);
  try {
    const serverSide: DaemonFrameConnection = await serverReady.promise;
    const echoed: ReturnType<typeof createDeferred<IDaemonFrame>> = createDeferred<IDaemonFrame>();
    client.onFrame((frame: IDaemonFrame) => echoed.resolve(frame));
    serverSide.onFrame((frame: IDaemonFrame) => {
      void serverSide.sendFrameAsync(frame);
    });
    await client.sendFrameAsync({ type: DaemonFrameType.logStdout, payload: BINARY_PAYLOAD });
    const reply: IDaemonFrame = await echoed.promise;
    expect(reply.type).toBe(DaemonFrameType.logStdout);
    expect(reply.payload.equals(BINARY_PAYLOAD)).toBe(true);
    expect(readDaemonLockfile(paths.lockfilePath)?.pid).toBe(process.pid);
  } finally {
    await client.closeAsync();
    await listener.closeAsync();
  }
});

it('cleans up the lockfile and socket on close', async () => {
  const paths: IDaemonPaths = createTestDaemonPaths();
  const listener: DaemonFrameListener = await DaemonFrameListener.listenAsync(paths, {
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    onConnection: () => undefined
  });
  expect(readDaemonLockfile(paths.lockfilePath)).toBeDefined();
  await listener.closeAsync();
  expect(readDaemonLockfile(paths.lockfilePath)).toBeUndefined();
});
