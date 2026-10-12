// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonFrame } from '@rushstack/rush-daemon-protocol';

import { createFrame, nextMacrotaskAsync, trackSend } from './BackpressureFixture';
import type { SendState } from './BackpressureFixture';
import { createDeferred } from './TestDaemonFixture';
import type { IDeferred } from './TestDaemonFixture';
import {
  FIRST_BYTES,
  SECOND_BYTES,
  holdFirstFrame,
  sendWhileHeldAsync,
  withUnreadingPeerAsync,
  writeFramesAsync
} from './UnreadingPeerFixture';
import type { IHeldHandler, IUnreadingPeerPair } from './UnreadingPeerFixture';

// These tests use Unix sockets, where a write to a socket whose peer has closed fails with EPIPE.
const posixIt: jest.It = process.platform === 'win32' ? it.skip : it;
// On Linux, a Unix socket that closes with bytes it never read resets its peer's connection.
const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;

posixIt(
  'closedAfterReadingAll is true when the peer ends while a handler runs, once every frame is read',
  async () => {
    await withUnreadingPeerAsync(async (pair: IUnreadingPeerPair) => {
      const handler: IHeldHandler = holdFirstFrame(pair.reader);
      await sendWhileHeldAsync(pair, handler);
      // The peer has nothing of the reader's unread, so this ends the connection rather than resetting it.
      pair.peer.destroy();
      await nextMacrotaskAsync();
      expect(pair.reader.closedAfterReadingAll).toBe(false);
      handler.release();
      expect(await pair.closed).toBeUndefined();
      await nextMacrotaskAsync();
      expect(handler.received).toEqual([FIRST_BYTES, SECOND_BYTES]);
      expect(pair.reader.closedAfterReadingAll).toBe(true);
    });
  }
);

posixIt(
  'closedAfterReadingAll is false when a write fails after the peer closed, while a frame waits',
  async () => {
    await withUnreadingPeerAsync(async (pair: IUnreadingPeerPair) => {
      const handler: IHeldHandler = holdFirstFrame(pair.reader);
      await sendWhileHeldAsync(pair, handler);
      pair.peer.destroy();
      const sendState: () => SendState = trackSend(pair.reader.sendFrameAsync(createFrame(FIRST_BYTES)));
      expect(await pair.closed).toMatchObject({ code: 'EPIPE', syscall: 'write' });
      handler.release();
      await nextMacrotaskAsync();
      expect(sendState()).toMatchObject({ code: 'EPIPE' });
      expect(handler.received).toEqual([FIRST_BYTES]);
      expect(pair.reader.closedAfterReadingAll).toBe(false);
    });
  }
);

linuxIt(
  'closedAfterReadingAll is false when the peer resets the connection while a frame waits',
  async () => {
    await withUnreadingPeerAsync(async (pair: IUnreadingPeerPair) => {
      // The peer never reads this, so its close resets the connection.
      await pair.reader.sendFrameAsync(createFrame(FIRST_BYTES));
      const handler: IHeldHandler = holdFirstFrame(pair.reader);
      await sendWhileHeldAsync(pair, handler);
      pair.peer.destroy();
      expect(await pair.closed).toMatchObject({ code: 'ECONNRESET', syscall: 'read' });
      handler.release();
      await nextMacrotaskAsync();
      expect(handler.received).toEqual([FIRST_BYTES]);
      expect(pair.reader.closedAfterReadingAll).toBe(false);
    });
  }
);

linuxIt(
  'closedAfterReadingAll is true when the peer resets the connection once every frame is read',
  async () => {
    await withUnreadingPeerAsync(async (pair: IUnreadingPeerPair) => {
      await pair.reader.sendFrameAsync(createFrame(FIRST_BYTES));
      const received: number[] = [];
      const lastReceived: IDeferred<void> = createDeferred<void>();
      pair.reader.onFrame((frame: IDaemonFrame) => {
        received.push(frame.payload.length);
        if (frame.payload.length === SECOND_BYTES) lastReceived.resolve();
      });
      await writeFramesAsync(pair.peer, FIRST_BYTES);
      await writeFramesAsync(pair.peer, SECOND_BYTES);
      await lastReceived.promise;
      pair.peer.destroy();
      expect(await pair.closed).toMatchObject({ code: 'ECONNRESET', syscall: 'read' });
      expect(received).toEqual([FIRST_BYTES, SECOND_BYTES]);
      expect(pair.reader.closedAfterReadingAll).toBe(true);
    });
  }
);
