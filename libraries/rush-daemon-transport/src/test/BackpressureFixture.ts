// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonFrameType } from '@rushstack/rush-daemon-protocol';
import type { IDaemonFrame } from '@rushstack/rush-daemon-protocol';

import type { DaemonFrameConnection } from '../DaemonFrameConnection';
import type { IDaemonPaths } from '../DaemonPaths';

import { createDeferred, createTestDaemonPaths, startTestDaemonPair } from './TestDaemonFixture';
import type { IDeferred, ITestDaemonPair } from './TestDaemonFixture';

const FILL_BYTE: number = 0x61;

/** A send so far: still pending, resolved, or the error it rejected with. */
export type SendState = 'pending' | 'resolved' | Error;

/** A test pair whose server side has accepted, and the error its server side closed with. */
export interface IBackpressurePair extends ITestDaemonPair {
  readonly server: DaemonFrameConnection;
  readonly serverClosed: Promise<Error | undefined>;
}

/** A log frame with a payload of the given size. */
export function createFrame(byteCount: number): IDaemonFrame {
  return { kind: DaemonFrameType.logStdout, payload: Buffer.alloc(byteCount, FILL_BYTE) };
}

/** Records how a send settles, without leaving its rejection unhandled. */
export function trackSend(send: Promise<void>): () => SendState {
  let state: SendState = 'pending';
  send.then(
    () => {
      state = 'resolved';
    },
    (error: Error) => {
      state = error;
    }
  );
  return () => state;
}

/** Lets every callback that the current event queued run first. */
export async function nextMacrotaskAsync(): Promise<void> {
  await new Promise<void>((resolve: () => void) => setImmediate(resolve));
}

/** Runs a test on a new pair whose client doesn't read until the test resumes it, then closes the pair. */
export async function withPausedPairAsync(test: (pair: IBackpressurePair) => Promise<void>): Promise<void> {
  const paths: IDaemonPaths = createTestDaemonPaths();
  const pair: ITestDaemonPair = await startTestDaemonPair(paths);
  try {
    const server: DaemonFrameConnection = await pair.serverSide;
    const serverClosed: IDeferred<Error | undefined> = createDeferred<Error | undefined>();
    server.onClosed((error: Error | undefined) => serverClosed.resolve(error));
    pair.client.socket.pause();
    await test({ ...pair, server, serverClosed: serverClosed.promise });
  } finally {
    await pair.client.closeAsync();
    await pair.listener.closeAsync();
  }
}
