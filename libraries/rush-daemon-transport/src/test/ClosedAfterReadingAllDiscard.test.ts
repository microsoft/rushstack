// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonFrame } from '@rushstack/rush-daemon-protocol';

import { createFrame, nextMacrotaskAsync } from './BackpressureFixture';
import { createDeferred } from './TestDaemonFixture';
import type { IDeferred } from './TestDaemonFixture';
import { FIRST_BYTES, SECOND_BYTES, withUnreadingPeerAsync, writeFramesAsync } from './UnreadingPeerFixture';
import type { IUnreadingPeerPair } from './UnreadingPeerFixture';

// These tests use Unix sockets.
const posixIt: jest.It = process.platform === 'win32' ? it.skip : it;
// On Linux, a Unix socket that closes with bytes it never read resets its peer's connection.
const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;

posixIt('closedAfterReadingAll is false while the connection is open, and after abort()', async () => {
  await withUnreadingPeerAsync(async (pair: IUnreadingPeerPair) => {
    expect(pair.reader.closedAfterReadingAll).toBe(false);
    const abortError: Error = new Error('The test aborted the connection.');
    pair.reader.abort(abortError);
    expect(await pair.closed).toBe(abortError);
    expect(pair.reader.closedAfterReadingAll).toBe(false);
  });
});

linuxIt(
  'closedAfterReadingAll is false once a handler throws, even after a reset once every byte was read',
  async () => {
    await withUnreadingPeerAsync(async (pair: IUnreadingPeerPair) => {
      // The peer never reads this, so its close resets the connection.
      await pair.reader.sendFrameAsync(createFrame(FIRST_BYTES));
      const received: number[] = [];
      const holding: IDeferred<void> = createDeferred<void>();
      const failure: IDeferred<void> = createDeferred<void>();
      pair.reader.onFrame(async (frame: IDaemonFrame) => {
        received.push(frame.payload.length);
        holding.resolve();
        await failure.promise;
        throw new Error('The handler failed.');
      });
      // Both frames arrive in one read, so the second waits for the handler rather than in the socket's buffer.
      await writeFramesAsync(pair.peer, FIRST_BYTES, SECOND_BYTES);
      await holding.promise;
      pair.peer.destroy();
      expect(await pair.closed).toMatchObject({ code: 'ECONNRESET', syscall: 'read' });
      expect(pair.reader.closedAfterReadingAll).toBe(true);
      failure.resolve();
      await nextMacrotaskAsync();
      // The frame after the one whose handler threw never reaches the handler.
      expect(received).toEqual([FIRST_BYTES]);
      expect(pair.reader.closedAfterReadingAll).toBe(false);
    });
  }
);
