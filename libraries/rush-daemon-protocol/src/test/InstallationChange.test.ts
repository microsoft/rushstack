// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';
import type { IDaemonCommandResult } from '../DaemonCommandResult';
import type { DaemonControlMessage } from '../DaemonControlMessage';
import type { IDaemonInstallationChange } from '../DaemonInstallationChange';
import { WIRE_TEXT_ENCODER } from '../DaemonWireText';

const FAILURE_EXIT_CODE: number = 1;
const ZERO: number = 0;
const CHANGE: IDaemonInstallationChange = { change: 'removed', folder: '/snapshots/s9' };
const RESULT: IDaemonCommandResult = {
  aborted: false,
  exitCode: FAILURE_EXIT_CODE,
  outcome: 'failure',
  requestId: 'installation',
  retryAfterRestart: true,
  restartReason: { kind: 'installationChanged', ...CHANGE }
};

function resultFrame(payload: object): Uint8Array {
  return WIRE_TEXT_ENCODER.encode(JSON.stringify({ kind: 'requestResult', payload }));
}

function pongFrame(installationChange: unknown): Uint8Array {
  return WIRE_TEXT_ENCODER.encode(
    JSON.stringify({ kind: 'pong', payload: { uptimeMs: ZERO, installationChange } })
  );
}

it('round-trips a restart result that names the changed installation', () => {
  const message: DaemonControlMessage = { kind: 'requestResult', payload: RESULT };
  expect(decodeDaemonControlMessage(encodeDaemonControlMessage(message))).toEqual(message);
});

it('accepts a restart reason kind from a newer daemon', () => {
  const payload: object = {
    ...RESULT,
    restartReason: { kind: 'newerReason', detail: ['NODE_OPTIONS'] }
  };
  expect(decodeDaemonControlMessage(resultFrame(payload))).toMatchObject({ payload });
});

it.each([
  { restartReason: null },
  { restartReason: 'installationChanged' },
  { restartReason: [] },
  { restartReason: { kind: '' } },
  { restartReason: { ...CHANGE } },
  { restartReason: { kind: 'installationChanged', change: 'moved', folder: CHANGE.folder } },
  { restartReason: { kind: 'installationChanged', change: 'removed', folder: '' } },
  { restartReason: { kind: 'installationChanged', change: 'removed' } },
  { retryAfterRestart: undefined, exitCode: ZERO, outcome: 'success' }
])('rejects a malformed restart reason %j', (override: object) => {
  expect(() => decodeDaemonControlMessage(resultFrame({ ...RESULT, ...override }))).toThrow();
});

it.each([undefined, CHANGE, { change: 'replaced', folder: '/snapshots/s9/libraries' }])(
  'round-trips an optional pong installation change %j',
  (installationChange: unknown) => {
    const frame: Uint8Array = pongFrame(installationChange);
    expect(encodeDaemonControlMessage(decodeDaemonControlMessage(frame))).toEqual(frame);
  }
);

it.each([null, [], {}, { change: 'moved', folder: '/x' }, { change: 'removed', folder: ZERO }])(
  'rejects a malformed pong installation change %j',
  (installationChange: unknown) => {
    expect(() => decodeDaemonControlMessage(pongFrame(installationChange))).toThrow(/installationChange/);
  }
);
