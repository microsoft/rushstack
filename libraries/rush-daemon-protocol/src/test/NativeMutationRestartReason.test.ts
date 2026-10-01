// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';
import type { DaemonControlMessage } from '../DaemonControlMessage';
import type { IDaemonNativeMutationRestartReason } from '../DaemonInstallationChange';
import { WIRE_TEXT_ENCODER } from '../DaemonWireText';

const POSITION: number = 2;
const SCRIPT_COUNT: number = 1;
const NOT_A_NAME: number = 1;
const REQUEST_ID: string = 'waits-behind-install';
const REASON: IDaemonNativeMutationRestartReason = { kind: 'nativeMutation', commandName: 'install' };

function queuePositionFrame(fields: object): Uint8Array {
  const payload: object = { position: POSITION, requestId: REQUEST_ID, ...fields };
  return WIRE_TEXT_ENCODER.encode(JSON.stringify({ kind: 'queuePosition', payload }));
}

it('round-trips a request that waits behind a native install while the install waits for rushx scripts', () => {
  const message: DaemonControlMessage = {
    kind: 'queuePosition',
    payload: {
      position: POSITION,
      requestId: REQUEST_ID,
      restartReason: REASON,
      scriptCount: SCRIPT_COUNT,
      restartsForAnotherRequest: true
    }
  };
  expect(decodeDaemonControlMessage(encodeDaemonControlMessage(message))).toEqual(message);
});

it.each([
  {},
  { commandName: '' },
  { commandName: NOT_A_NAME },
  { commandName: null },
  { commandName: ['install'] }
])('rejects a native mutation reason without a command name: %j', (fields: object) => {
  const restartReason: object = { kind: 'nativeMutation', ...fields };
  expect(() => decodeDaemonControlMessage(queuePositionFrame({ restartReason }))).toThrow(
    'Invalid restartReason.commandName.'
  );
});
