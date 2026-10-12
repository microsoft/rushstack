// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonTransportError, DaemonTransportErrorCode } from '../DaemonTransportError';

import { createFrame, nextMacrotaskAsync, trackSend, withPausedPairAsync } from './BackpressureFixture';
import type { IBackpressurePair, SendState } from './BackpressureFixture';

const SMALL_FRAME_BYTES: number = 1;

it('rejects a send on a connection that already closed without an error', async () => {
  await withPausedPairAsync(async (pair: IBackpressurePair) => {
    pair.server.socket.destroy();
    expect(await pair.serverClosed).toBeUndefined();
    await nextMacrotaskAsync();
    // A write to a closed socket emits nothing more, so only the open check can settle this send.
    const sendState: () => SendState = trackSend(pair.server.sendFrameAsync(createFrame(SMALL_FRAME_BYTES)));
    await nextMacrotaskAsync();
    expect(sendState()).toBeInstanceOf(DaemonTransportError);
    expect(sendState()).toMatchObject({ code: DaemonTransportErrorCode.transportClosed });
  });
});

it('rejects sendFrameWrittenAsync on a connection that already closed without an error', async () => {
  await withPausedPairAsync(async (pair: IBackpressurePair) => {
    pair.server.socket.destroy();
    expect(await pair.serverClosed).toBeUndefined();
    await nextMacrotaskAsync();
    // Without the open check, the write would reject with the socket's own error instead.
    const writtenState: () => SendState = trackSend(
      pair.server.sendFrameWrittenAsync(createFrame(SMALL_FRAME_BYTES))
    );
    await nextMacrotaskAsync();
    expect(writtenState()).toBeInstanceOf(DaemonTransportError);
    expect(writtenState()).toMatchObject({ code: DaemonTransportErrorCode.transportClosed });
  });
});
