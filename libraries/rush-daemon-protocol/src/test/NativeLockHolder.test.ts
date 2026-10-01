// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';
import type { DaemonControlMessage } from '../DaemonControlMessage';
import { WIRE_TEXT_ENCODER } from '../DaemonWireText';

const FIRST_POSITION: number = 1;
const HOLDER_PID: number = 4242;
const REQUEST_ID: string = 'waits-for-native-rush';

function queuePositionFrame(fields: object): Uint8Array {
  const payload: object = { position: FIRST_POSITION, requestId: REQUEST_ID, ...fields };
  return WIRE_TEXT_ENCODER.encode(JSON.stringify({ kind: 'queuePosition', payload }));
}

it('round-trips a queue position that waits for a native Rush process to release the repository lock', () => {
  const message: DaemonControlMessage = {
    kind: 'queuePosition',
    payload: {
      position: FIRST_POSITION,
      requestId: REQUEST_ID,
      nativeLockHolder: { pid: HOLDER_PID, command: 'rush install' }
    }
  };
  expect(decodeDaemonControlMessage(encodeDaemonControlMessage(message))).toEqual(message);
});

it.each([{}, { pid: HOLDER_PID }, { command: 'rush build' }])(
  'accepts a native lock holder whose pid or command is unknown %j',
  (nativeLockHolder: object) => {
    expect(decodeDaemonControlMessage(queuePositionFrame({ nativeLockHolder }))).toMatchObject({
      payload: { nativeLockHolder }
    });
  }
);

it.each([
  null,
  'rush install',
  [HOLDER_PID],
  { pid: 0 },
  { pid: -1 },
  { pid: 1.5 },
  { pid: '4242' },
  { command: HOLDER_PID },
  { command: '' }
])('rejects a malformed native lock holder %j', (nativeLockHolder: unknown) => {
  expect(() => decodeDaemonControlMessage(queuePositionFrame({ nativeLockHolder }))).toThrow(
    /nativeLockHolder/
  );
});
