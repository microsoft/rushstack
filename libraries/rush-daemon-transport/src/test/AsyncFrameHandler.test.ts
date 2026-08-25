// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonFrameType } from '@rushstack/rush-daemon-protocol';
import type { IDaemonFrame } from '@rushstack/rush-daemon-protocol';

import type { DaemonFrameConnection } from '../DaemonFrameConnection';
import type { IDaemonPaths } from '../DaemonPaths';

import { createDeferred, createTestDaemonPaths, startTestDaemonPair } from './TestDaemonFixture';
import type { IDeferred, ITestDaemonPair } from './TestDaemonFixture';

const EMPTY_TOTAL: number = 0;
const FIRST_COUNT: number = 1;
const FRAME_COUNT: number = 3;

interface IHandlerState {
  active: number;
  maximumActive: number;
  received: number;
}

function createHandler(
  state: IHandlerState,
  firstHandler: IDeferred<void>,
  firstReceived: IDeferred<void>,
  allReceived: IDeferred<void>
): () => Promise<void> {
  return async (): Promise<void> => {
    state.active++;
    state.maximumActive = Math.max(state.maximumActive, state.active);
    state.received++;
    if (state.received === FIRST_COUNT) {
      firstReceived.resolve();
      await firstHandler.promise;
    }
    state.active--;
    if (state.received === FRAME_COUNT) allReceived.resolve();
  };
}

async function sendFramesAsync(server: DaemonFrameConnection): Promise<void> {
  await Promise.all(
    Array.from({ length: FRAME_COUNT }, () =>
      server.sendFrameAsync({ kind: DaemonFrameType.stdin, payload: new Uint8Array() })
    )
  );
}

it('awaits each incoming frame handler before dispatching the next frame', async () => {
  const paths: IDaemonPaths = createTestDaemonPaths();
  const pair: ITestDaemonPair = await startTestDaemonPair(paths);
  const firstHandler: IDeferred<void> = createDeferred<void>();
  const firstReceived: IDeferred<void> = createDeferred<void>();
  const allReceived: IDeferred<void> = createDeferred<void>();
  const state: IHandlerState = { active: EMPTY_TOTAL, maximumActive: EMPTY_TOTAL, received: EMPTY_TOTAL };
  try {
    pair.client.onFrame(createHandler(state, firstHandler, firstReceived, allReceived));
    await sendFramesAsync(await pair.serverSide);
    await firstReceived.promise;
    expect(state.received).toBe(FIRST_COUNT);
    firstHandler.resolve();
    await allReceived.promise;
    expect(state.maximumActive).toBe(FIRST_COUNT);
  } finally {
    await pair.client.closeAsync();
    await pair.listener.closeAsync();
  }
});

it('accepts synchronous handlers that return a value', async () => {
  const paths: IDaemonPaths = createTestDaemonPaths();
  const pair: ITestDaemonPair = await startTestDaemonPair(paths);
  const received: IDaemonFrame[] = [];
  const receivedFrame: IDeferred<void> = createDeferred<void>();
  try {
    pair.client.onFrame((frame: IDaemonFrame) => {
      receivedFrame.resolve();
      return received.push(frame);
    });
    await (await pair.serverSide).sendFrameAsync({
      kind: DaemonFrameType.stdin,
      payload: new Uint8Array()
    });
    await receivedFrame.promise;
    expect(received).toHaveLength(FIRST_COUNT);
  } finally {
    await pair.client.closeAsync();
    await pair.listener.closeAsync();
  }
});
