// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';
import type { IDaemonCommandResult } from '../DaemonCommandResult';
import type { DaemonControlMessage } from '../DaemonControlMessage';

const BASE_RESULT: IDaemonCommandResult = {
  aborted: false,
  exitCode: 0,
  outcome: 'success',
  requestId: 'request'
};
const NATIVE_USAGE_EXIT_CODE: number = 2;

it.each([
  ['negative exit code', { ...BASE_RESULT, exitCode: -1 }],
  ['unknown admission error', { ...BASE_RESULT, admissionErrorCode: 'later' }],
  ['non-string error', { ...BASE_RESULT, errorMessage: false }],
  ['non-string usage', { ...BASE_RESULT, usage: false }],
  ['partial phased result', { ...BASE_RESULT, scheduled: true }],
  [
    'malformed operation result',
    { ...BASE_RESULT, operationResults: [{ operationId: '', status: 1 }], scheduled: true }
  ]
])('rejects a request result with a %s', (testName: string, payload: unknown) => {
  expect(testName).toBeDefined();
  const message = { kind: 'requestResult', payload } as DaemonControlMessage;
  expect(() => decodeDaemonControlMessage(encodeDaemonControlMessage(message))).toThrow();
});

it('accepts a complete phased request result', () => {
  const message: DaemonControlMessage = {
    kind: 'requestResult',
    payload: {
      ...BASE_RESULT,
      operationResults: [{ operationId: 'project (_phase:build)', status: 'SUCCESS' }],
      scheduled: true
    }
  };
  expect(decodeDaemonControlMessage(encodeDaemonControlMessage(message))).toEqual(message);
});

it('accepts a failed request result with the usage of its command', () => {
  const message: DaemonControlMessage = {
    kind: 'requestResult',
    payload: {
      ...BASE_RESULT,
      exitCode: NATIVE_USAGE_EXIT_CODE,
      outcome: 'failure',
      errorMessage: 'rush build: error: Unrecognized arguments: --nope.',
      usage: 'usage: rush build [-h] [-t PROJECT]\n'
    }
  };
  expect(decodeDaemonControlMessage(encodeDaemonControlMessage(message))).toEqual(message);
});
