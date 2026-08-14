// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonFrameType } from '@rushstack/rush-daemon-protocol';
import type { IDaemonFrame } from '@rushstack/rush-daemon-protocol';

import type { DaemonFrameConnection } from '../DaemonFrameConnection';
import type { IDaemonPaths } from '../DaemonPaths';

import { createDeferred, createTestDaemonPaths, startTestDaemonPair } from './TestDaemonFixture';
import type { ITestDaemonPair } from './TestDaemonFixture';
import type { IDeferred } from './TestDaemonFixture';

const KIBIBYTE: number = 1024;
const MEBIBYTE: number = KIBIBYTE * KIBIBYTE;
const FRAME_COUNT: number = 16;
const FILL_BYTE: number = 0x61;
const EMPTY_TOTAL: number = 0;
const FIRST_INDEX: number = 0;

async function sendLargeFramesAsync(serverSide: Promise<DaemonFrameConnection>): Promise<void> {
  const server: DaemonFrameConnection = await serverSide;
  for (let index: number = FIRST_INDEX; index < FRAME_COUNT; index++) {
    await server.sendFrameAsync({
      type: DaemonFrameType.logStdout,
      payload: Buffer.alloc(MEBIBYTE, FILL_BYTE)
    });
  }
}

it('delivers every frame intact when the writer outpaces the reader', async () => {
  const paths: IDaemonPaths = createTestDaemonPaths();
  const received: Buffer[] = [];
  const allReceived: IDeferred<void> = createDeferred<void>();
  const pair: ITestDaemonPair = await startTestDaemonPair(paths);
  try {
    pair.client.onFrame((frame: IDaemonFrame) => {
      received.push(frame.payload);
      if (received.length === FRAME_COUNT) {
        allReceived.resolve();
      }
    });
    await sendLargeFramesAsync(pair.serverSide);
    await allReceived.promise;
    const totalBytes: number = received.reduce(
      (sum: number, chunk: Buffer) => sum + chunk.length,
      EMPTY_TOTAL
    );
    expect(received.length).toBe(FRAME_COUNT);
    expect(totalBytes).toBe(FRAME_COUNT * MEBIBYTE);
  } finally {
    await pair.client.closeAsync();
    await pair.listener.closeAsync();
  }
});
