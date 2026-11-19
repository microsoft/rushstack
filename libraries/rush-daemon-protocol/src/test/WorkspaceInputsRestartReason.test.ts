// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';
import type { DaemonControlMessage } from '../DaemonControlMessage';
import { WIRE_TEXT_ENCODER } from '../DaemonWireText';
import type { IDaemonWorkspaceInputsChangedRestartReason } from '../DaemonWorkspaceInputsChange';

const FAILURE_EXIT_CODE: number = 1;
const POSITION: number = 2;
const SCRIPT_COUNT: number = 1;
const NO_SCRIPTS: number = 0;
const FRACTIONAL_COUNT: number = 1.5;
const NEGATIVE_COUNT: number = -1;
const REQUEST_ID: string = 'waits-for-inputs';
const REASON: IDaemonWorkspaceInputsChangedRestartReason = {
  kind: 'workspaceInputsChanged',
  installationFiles: ['common/config/rush/pnpm-lock.yaml'],
  implementationFiles: ['common/autoinstallers/plugins/node_modules/p/lib/index.js'],
  selectedRushVersion: '5.180.0'
};

function roundTrip(message: DaemonControlMessage): unknown {
  return decodeDaemonControlMessage(encodeDaemonControlMessage(message));
}

function queuePositionFrame(fields: object): Uint8Array {
  const payload: object = { position: POSITION, requestId: REQUEST_ID, ...fields };
  return WIRE_TEXT_ENCODER.encode(JSON.stringify({ kind: 'queuePosition', payload }));
}

it('round-trips a queue position that waits for a restart for changed workspace inputs', () => {
  const message: DaemonControlMessage = {
    kind: 'queuePosition',
    payload: { position: POSITION, requestId: REQUEST_ID, restartReason: REASON, scriptCount: SCRIPT_COUNT }
  };
  expect(roundTrip(message)).toEqual(message);
});

it('round-trips a rushx script that waits for another request restart', () => {
  const restartReason: IDaemonWorkspaceInputsChangedRestartReason = { kind: 'workspaceInputsChanged' };
  const payload: object = { restartReason, restartsForAnotherRequest: true, scriptCount: NO_SCRIPTS };
  expect(decodeDaemonControlMessage(queuePositionFrame(payload))).toMatchObject({ payload });
});

it('round-trips a restart result for changed workspace inputs', () => {
  const message: DaemonControlMessage = {
    kind: 'requestResult',
    payload: {
      aborted: false,
      exitCode: FAILURE_EXIT_CODE,
      outcome: 'failure',
      requestId: REQUEST_ID,
      restartReason: REASON,
      retryAfterRestart: true
    }
  };
  expect(roundTrip(message)).toEqual(message);
});

it.each([
  { installationFiles: 'common/config/rush/pnpm-lock.yaml' },
  { implementationFiles: [''] },
  { installationFiles: [FAILURE_EXIT_CODE] },
  { implementationFiles: null },
  { selectedRushVersion: '' },
  { selectedRushVersion: [] }
])('rejects a malformed workspace inputs reason %j', (fields: object) => {
  const restartReason: object = { kind: 'workspaceInputsChanged', ...fields };
  expect(() => decodeDaemonControlMessage(queuePositionFrame({ restartReason }))).toThrow(/restartReason/);
});

it.each([
  { scriptCount: NEGATIVE_COUNT },
  { scriptCount: FRACTIONAL_COUNT },
  { scriptCount: '1' },
  { restartsForAnotherRequest: 'yes' }
])('rejects a malformed restart wait %j', (fields: object) => {
  expect(() => decodeDaemonControlMessage(queuePositionFrame({ restartReason: REASON, ...fields }))).toThrow(
    /scriptCount|restartsForAnotherRequest/
  );
});
