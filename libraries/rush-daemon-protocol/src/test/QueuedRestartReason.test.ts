// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';
import type { DaemonControlMessage } from '../DaemonControlMessage';
import type { DaemonRestartReason } from '../DaemonInstallationChange';
import { WIRE_TEXT_ENCODER } from '../DaemonWireText';

const FIRST_POSITION: number = 1;
const REQUEST_ID: string = 'queued-before-restart';
const REASON: DaemonRestartReason = {
  kind: 'installationChanged',
  change: 'removed',
  folder: '/snapshots/s9'
};

function queuePositionFrame(restartReason: unknown): Uint8Array {
  return WIRE_TEXT_ENCODER.encode(
    JSON.stringify({
      kind: 'queuePosition',
      payload: { position: FIRST_POSITION, requestId: REQUEST_ID, restartReason }
    })
  );
}

it('round-trips a queue position that says the daemon restarts once the requests ahead finish', () => {
  const message: DaemonControlMessage = {
    kind: 'queuePosition',
    payload: { position: FIRST_POSITION, requestId: REQUEST_ID, restartReason: REASON }
  };
  expect(decodeDaemonControlMessage(encodeDaemonControlMessage(message))).toEqual(message);
});

it('accepts a queued restart reason kind from a newer daemon', () => {
  const restartReason: object = { kind: 'environmentChanged', names: ['NODE_OPTIONS'] };
  expect(decodeDaemonControlMessage(queuePositionFrame(restartReason))).toMatchObject({
    payload: { restartReason }
  });
});

it.each([
  null,
  'installationChanged',
  [],
  { kind: '' },
  { change: 'removed', folder: '/x' },
  { kind: 'installationChanged', change: 'moved', folder: '/x' },
  { kind: 'installationChanged', change: 'removed', folder: '' }
])('rejects a malformed queued restart reason %j', (restartReason: unknown) => {
  expect(() => decodeDaemonControlMessage(queuePositionFrame(restartReason))).toThrow(/restartReason/);
});
