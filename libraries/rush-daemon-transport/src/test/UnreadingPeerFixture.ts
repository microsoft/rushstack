// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as net from 'node:net';

import { encodeDaemonFrame } from '@rushstack/rush-daemon-protocol';
import type { IDaemonFrame } from '@rushstack/rush-daemon-protocol';

import { connectDaemonAsync } from '../DaemonConnector';
import type { DaemonFrameConnection } from '../DaemonFrameConnection';
import type { IDaemonPaths } from '../DaemonPaths';
import { ensureDaemonRuntimeDir } from '../DaemonRuntimeDir';

import { createFrame, nextMacrotaskAsync } from './BackpressureFixture';
import { createDeferred, createTestDaemonPaths } from './TestDaemonFixture';
import type { IDeferred } from './TestDaemonFixture';

/** The payload sizes of the two frames that the peer sends, which tell them apart. */
export const FIRST_BYTES: number = 1;
export const SECOND_BYTES: number = 2;

/** A connection under test, and a peer that never reads what the connection sends. */
export interface IUnreadingPeerPair {
  readonly reader: DaemonFrameConnection;
  readonly peer: net.Socket;
  /** The error that the reader closed with. */
  readonly closed: Promise<Error | undefined>;
}

/** A frame handler that records the payload sizes it gets, and holds the first frame until `release`. */
export interface IHeldHandler {
  readonly received: number[];
  /** Resolves once the handler holds the first frame, when the connection has paused its socket. */
  readonly holding: Promise<void>;
  readonly release: () => void;
}

async function listenAsync(paths: IDaemonPaths, accepted: IDeferred<net.Socket>): Promise<net.Server> {
  ensureDaemonRuntimeDir(paths);
  const server: net.Server = net.createServer({ pauseOnConnect: true }, (socket: net.Socket) => {
    socket.on('error', () => undefined);
    accepted.resolve(socket);
  });
  await new Promise<void>((resolve: () => void) => server.listen(paths.socketPath, resolve));
  return server;
}

/**
 * Runs a test on a connection whose peer never reads, as a daemon whose event loop is stuck doesn't, so that the
 * peer's close resets the connection once the connection has sent it anything.
 */
export async function withUnreadingPeerAsync(fn: (pair: IUnreadingPeerPair) => Promise<void>): Promise<void> {
  const paths: IDaemonPaths = createTestDaemonPaths();
  const accepted: IDeferred<net.Socket> = createDeferred<net.Socket>();
  const server: net.Server = await listenAsync(paths, accepted);
  try {
    const reader: DaemonFrameConnection = await connectDaemonAsync(paths.socketPath);
    const closed: IDeferred<Error | undefined> = createDeferred<Error | undefined>();
    reader.onClosed((error: Error | undefined) => closed.resolve(error));
    const peer: net.Socket = await accepted.promise;
    try {
      await fn({ reader, peer, closed: closed.promise });
    } finally {
      reader.abort(new Error('The test ended.'));
      peer.destroy();
    }
  } finally {
    await new Promise<void>((resolve: () => void) => server.close(() => resolve()));
  }
}

export function holdFirstFrame(reader: DaemonFrameConnection): IHeldHandler {
  const received: number[] = [];
  const holding: IDeferred<void> = createDeferred<void>();
  const release: IDeferred<void> = createDeferred<void>();
  reader.onFrame(async (frame: IDaemonFrame) => {
    received.push(frame.payload.length);
    if (frame.payload.length === FIRST_BYTES) {
      holding.resolve();
      await release.promise;
    }
  });
  return { received, holding: holding.promise, release: () => release.resolve() };
}

/** The peer writes frames of these payload sizes in one write; resolves once the reader's side holds them. */
export async function writeFramesAsync(peer: net.Socket, ...byteCounts: number[]): Promise<void> {
  const bytes: Buffer = Buffer.concat(byteCounts.map((n: number) => encodeDaemonFrame(createFrame(n))));
  await new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
    peer.write(bytes, (error: Error | null | undefined) => (error ? reject(error) : resolve()));
  });
}

/** Sends the first frame, and the second one once the reader holds the first, so the second waits unread. */
export async function sendWhileHeldAsync(pair: IUnreadingPeerPair, handler: IHeldHandler): Promise<void> {
  await writeFramesAsync(pair.peer, FIRST_BYTES);
  await handler.holding;
  await writeFramesAsync(pair.peer, SECOND_BYTES);
  while (!pair.reader.socket.readableLength) await nextMacrotaskAsync();
}
