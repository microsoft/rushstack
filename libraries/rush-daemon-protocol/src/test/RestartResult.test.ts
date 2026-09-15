// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';
import type { IDaemonCommandResult } from '../DaemonCommandResult';
import type { DaemonControlMessage } from '../DaemonControlMessage';

const FAILURE_EXIT_CODE: number = 1;
const SUCCESS_EXIT_CODE: number = 0;
const RESULT: IDaemonCommandResult = {
  aborted: false, exitCode: FAILURE_EXIT_CODE, outcome: 'failure', requestId: 'restart',
  retryAfterRestart: true
};

it('round-trips a guaranteed pre-execution restart result', () => {
  const message: DaemonControlMessage = { kind: 'requestResult', payload: RESULT };
  expect(decodeDaemonControlMessage(encodeDaemonControlMessage(message))).toEqual(message);
});

it.each([
  { retryAfterRestart: false }, { retryAfterRestart: 'yes' }, { retryAfterRestart: null },
  { outcome: 'success' }, { exitCode: SUCCESS_EXIT_CODE }, { aborted: true },
  { admissionErrorCode: 'aborted' }, { scheduled: false, operationResults: [] }
])('rejects contradictory restart result %j', (override: object) => {
  const message: unknown = { kind: 'requestResult', payload: { ...RESULT, ...override } };
  expect(() => decodeDaemonControlMessage(encodeDaemonControlMessage(message as DaemonControlMessage))).toThrow();
});
