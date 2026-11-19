// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonFrameConnection } from '../DaemonFrameConnection';
import type { IDaemonPaths } from '../DaemonPaths';
import { writeRawSocketBytes } from '../DaemonRawWrite';

import { createDeferred, createTestDaemonPaths, startTestDaemonPair } from './TestDaemonFixture';
import type { IDeferred, ITestDaemonPair } from './TestDaemonFixture';

const FRAME_BYTES: number = 5;
const UNKNOWN_KIND_BYTE: number = 0x7e;
const HEADER_TYPE_OFFSET: number = 4;
const EMPTY_LENGTH: number = 0;
const LENGTH_OFFSET: number = 0;

it('fails the connection closed (never crashing the process) on a malformed frame', async () => {
  const paths: IDaemonPaths = createTestDaemonPaths();
  const clientClosed: IDeferred<Error | undefined> = createDeferred<Error | undefined>();
  const pair: ITestDaemonPair = await startTestDaemonPair(paths);
  try {
    const server: DaemonFrameConnection = await pair.serverSide;
    pair.client.onFrame(() => {
      throw new Error('no frame should decode from malformed bytes');
    });
    pair.client.onClosed((error: Error | undefined) => clientClosed.resolve(error));
    // Inject a raw malformed frame (unknown kind byte, empty payload).
    const malformed: Buffer = Buffer.alloc(FRAME_BYTES);
    malformed.writeUInt32LE(EMPTY_LENGTH, LENGTH_OFFSET);
    malformed.writeUInt8(UNKNOWN_KIND_BYTE, HEADER_TYPE_OFFSET);
    writeRawSocketBytes(server.socket, malformed);
    const closeError: Error | undefined = await clientClosed.promise;
    expect(closeError).toBeDefined();
    expect(String(closeError)).toContain('unknown frame kind');
  } finally {
    await pair.client.closeAsync();
    await pair.listener.closeAsync();
  }
});
