// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';
import type { IDaemonCommandResult } from '../DaemonCommandResult';
import type { DaemonControlMessage } from '../DaemonControlMessage';
import type { IDaemonEnvironmentChangedRestartReason } from '../DaemonEnvironmentChange';
import { WIRE_TEXT_ENCODER } from '../DaemonWireText';

const FAILURE_EXIT_CODE: number = 1;
const FIRST_POSITION: number = 1;
const NOT_A_NAME: number = 7;
const QUEUED_REQUEST_ID: string = 'queued-before-restart';
const REASON: IDaemonEnvironmentChangedRestartReason = {
  kind: 'environmentChanged',
  variableNames: ['FOO', 'NODE_OPTIONS']
};
const RESULT: IDaemonCommandResult = {
  aborted: false,
  exitCode: FAILURE_EXIT_CODE,
  outcome: 'failure',
  requestId: 'environment',
  retryAfterRestart: true,
  restartReason: REASON
};

function resultFrame(restartReason: unknown): Uint8Array {
  return WIRE_TEXT_ENCODER.encode(
    JSON.stringify({ kind: 'requestResult', payload: { ...RESULT, restartReason } })
  );
}

function queuePositionFrame(restartReason: unknown): Uint8Array {
  return WIRE_TEXT_ENCODER.encode(
    JSON.stringify({
      kind: 'queuePosition',
      payload: { position: FIRST_POSITION, requestId: QUEUED_REQUEST_ID, restartReason }
    })
  );
}

it('round-trips a restart result that names the variables that differ', () => {
  const message: DaemonControlMessage = { kind: 'requestResult', payload: RESULT };
  expect(decodeDaemonControlMessage(encodeDaemonControlMessage(message))).toEqual(message);
});

it('round-trips a queue position whose restart is for an environment', () => {
  const message: DaemonControlMessage = {
    kind: 'queuePosition',
    payload: { position: FIRST_POSITION, requestId: QUEUED_REQUEST_ID, restartReason: REASON }
  };
  expect(decodeDaemonControlMessage(encodeDaemonControlMessage(message))).toEqual(message);
});

it('accepts an environment reason that names no variables', () => {
  const restartReason: object = { kind: 'environmentChanged', variableNames: [] };
  expect(decodeDaemonControlMessage(resultFrame(restartReason))).toMatchObject({
    payload: { restartReason }
  });
});

const MALFORMED_REASONS: object[] = [
  { kind: 'environmentChanged' },
  { kind: 'environmentChanged', variableNames: null },
  { kind: 'environmentChanged', variableNames: 'NODE_OPTIONS' },
  { kind: 'environmentChanged', variableNames: [''] },
  { kind: 'environmentChanged', variableNames: ['NODE_OPTIONS', NOT_A_NAME] }
];

it.each(MALFORMED_REASONS)('rejects a restart result whose environment reason is %j', (reason: object) => {
  expect(() => decodeDaemonControlMessage(resultFrame(reason))).toThrow(/restartReason\.variableNames/);
});

it.each(MALFORMED_REASONS)('rejects a queue position whose environment reason is %j', (reason: object) => {
  expect(() => decodeDaemonControlMessage(queuePositionFrame(reason))).toThrow(
    /restartReason\.variableNames/
  );
});
