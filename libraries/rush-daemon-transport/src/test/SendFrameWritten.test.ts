// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as net from 'node:net';
import { Duplex } from 'node:stream';

import { DaemonFrameConnection } from '../DaemonFrameConnection';

import { createFrame, nextMacrotaskAsync, trackSend } from './BackpressureFixture';
import type { SendState } from './BackpressureFixture';

const FIRST_BYTES: number = 1;
const SECOND_BYTES: number = 2;

/** A connection over a socket that finishes each write only when the test calls that write's callback. */
interface IHeldWriteConnection {
  readonly connection: DaemonFrameConnection;
  readonly writeCallbacks: Array<(error?: Error | null) => void>;
}

function createHeldWriteConnection(): IHeldWriteConnection {
  const writeCallbacks: Array<(error?: Error | null) => void> = [];
  const socket: Duplex = new Duplex({
    read(): void {
      // Nothing arrives.
    },
    write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
      writeCallbacks.push(callback);
    }
  });
  return { connection: new DaemonFrameConnection(socket as net.Socket), writeCallbacks };
}

function finishNextWrite(writeCallbacks: Array<(error?: Error | null) => void>, error?: Error): void {
  const callback: ((error?: Error | null) => void) | undefined = writeCallbacks.shift();
  if (!callback) {
    throw new Error('No write is waiting.');
  }
  callback(error);
}

it('sendFrameWrittenAsync resolves only once the socket has written the frame and the frames before it', async () => {
  const { connection, writeCallbacks } = createHeldWriteConnection();
  const acceptedState: () => SendState = trackSend(connection.sendFrameAsync(createFrame(FIRST_BYTES)));
  const writtenState: () => SendState = trackSend(
    connection.sendFrameWrittenAsync(createFrame(SECOND_BYTES))
  );
  await nextMacrotaskAsync();
  // The socket accepted both frames, but has written neither.
  expect(acceptedState()).toBe('resolved');
  expect(writtenState()).toBe('pending');
  finishNextWrite(writeCallbacks);
  await nextMacrotaskAsync();
  expect(writtenState()).toBe('pending');
  finishNextWrite(writeCallbacks);
  await nextMacrotaskAsync();
  expect(writtenState()).toBe('resolved');
});

it("sendFrameWrittenAsync rejects with the socket's error when the write fails", async () => {
  const { connection, writeCallbacks } = createHeldWriteConnection();
  const writtenState: () => SendState = trackSend(connection.sendFrameWrittenAsync(createFrame(FIRST_BYTES)));
  const writeError: Error = new Error('The write failed.');
  await nextMacrotaskAsync();
  finishNextWrite(writeCallbacks, writeError);
  await nextMacrotaskAsync();
  expect(writtenState()).toBe(writeError);
});
