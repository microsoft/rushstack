// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonFrame } from '@rushstack/rush-daemon-protocol';

import { DaemonTransportError, DaemonTransportErrorCode } from '../DaemonTransportError';

import { createFrame, nextMacrotaskAsync, trackSend, withPausedPairAsync } from './BackpressureFixture';
import type { IBackpressurePair, SendState } from './BackpressureFixture';
import { createDeferred } from './TestDaemonFixture';
import type { IDeferred } from './TestDaemonFixture';

// A peer can half-close a Unix socket, but not a Windows named pipe.
const posixIt: jest.It = process.platform === 'win32' ? it.skip : it;
const LARGE_FRAME_BYTES: number = 4194304;
const SMALL_FRAME_BYTES: number = 1;
const MEBIBYTE: number = 1048576;
const FRAME_COUNT: number = 16;
const NONE: number = 0;
const SOCKET_EVENTS: ReadonlyArray<string> = ['drain', 'finish', 'close', 'error'];
const TRANSPORT_CLOSED: Partial<DaemonTransportError> = { code: DaemonTransportErrorCode.transportClosed };

function countListeners(pair: IBackpressurePair): number[] {
  return SOCKET_EVENTS.map((eventName: string) => pair.server.socket.listenerCount(eventName));
}

posixIt('settles a backpressured send when the peer half-closes, then reads the frame', async () => {
  await withPausedPairAsync(async (pair: IBackpressurePair) => {
    const received: IDeferred<number> = createDeferred<number>();
    pair.client.onFrame((frame: IDaemonFrame) => received.resolve(frame.payload.length));
    const send: Promise<void> = pair.server.sendFrameAsync(createFrame(LARGE_FRAME_BYTES));
    const sendState: () => SendState = trackSend(send);
    // The next frame in line, started as a session's send queue starts it.
    const nextState: () => SendState = trackSend(
      send.then(() => pair.server.sendFrameAsync(createFrame(SMALL_FRAME_BYTES)))
    );
    expect(pair.server.socket.writableNeedDrain).toBe(true);
    // The daemon's side doesn't allow a half-open connection, so the peer's FIN ends it, and the
    // buffered frame then finishes writing without a 'drain'.
    pair.client.socket.end();
    pair.client.socket.resume();
    expect(await received.promise).toBe(LARGE_FRAME_BYTES);
    expect(await pair.serverClosed).toBeUndefined();
    await nextMacrotaskAsync();
    expect(sendState()).toBe('resolved');
    expect(nextState()).toBeInstanceOf(DaemonTransportError);
    expect(nextState()).toMatchObject(TRANSPORT_CLOSED);
  });
});

it('rejects a backpressured send when its connection closes without an error first', async () => {
  await withPausedPairAsync(async (pair: IBackpressurePair) => {
    const sendState: () => SendState = trackSend(pair.server.sendFrameAsync(createFrame(LARGE_FRAME_BYTES)));
    expect(pair.server.socket.writableNeedDrain).toBe(true);
    pair.server.socket.destroy();
    expect(await pair.serverClosed).toBeUndefined();
    await nextMacrotaskAsync();
    expect(sendState()).toBeInstanceOf(DaemonTransportError);
    expect(sendState()).toMatchObject(TRANSPORT_CLOSED);
  });
});

it('rejects a backpressured send with the error that aborted its connection', async () => {
  await withPausedPairAsync(async (pair: IBackpressurePair) => {
    const abortError: Error = new Error('The drain deadline passed.');
    const sendState: () => SendState = trackSend(pair.server.sendFrameAsync(createFrame(LARGE_FRAME_BYTES)));
    expect(pair.server.socket.writableNeedDrain).toBe(true);
    pair.server.abort(abortError);
    expect(await pair.serverClosed).toBe(abortError);
    await nextMacrotaskAsync();
    expect(sendState()).toBe(abortError);
  });
});

it('leaves no socket listeners behind once backpressured sends drain', async () => {
  await withPausedPairAsync(async (pair: IBackpressurePair) => {
    const allReceived: IDeferred<void> = createDeferred<void>();
    const listenersBefore: number[] = countListeners(pair);
    let received: number = NONE;
    let backpressured: number = NONE;
    pair.client.onFrame(() => {
      received++;
      if (received === FRAME_COUNT) allReceived.resolve();
    });
    pair.client.socket.resume();
    for (let index: number = NONE; index < FRAME_COUNT; index++) {
      const send: Promise<void> = pair.server.sendFrameAsync(createFrame(MEBIBYTE));
      if (pair.server.socket.writableNeedDrain) backpressured++;
      await send;
    }
    await allReceived.promise;
    expect(backpressured).toBeGreaterThan(NONE);
    expect(countListeners(pair)).toEqual(listenersBefore);
  });
});
