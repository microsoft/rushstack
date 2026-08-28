// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';
import type { DaemonControlMessage } from '../DaemonControlMessage';
import type { IDaemonRequestStartMessage } from '../DaemonRequestControl';

const REQUEST_ID: string = 'wire-request';
const INVALID_TERMINAL_COLUMN: number = -1;
const TERMINAL_COLUMNS: number = 120;
const WAIT_TIMEOUT_MS: number = 1000;

function createRequestStart(): IDaemonRequestStartMessage {
  return {
    kind: 'requestStart',
    payload: {
      admission: { waitTimeoutMs: WAIT_TIMEOUT_MS },
      argv: ['build', '--to', 'project-a'],
      commandName: 'build',
      commandOrigin: 'built-in',
      cwd: 'C:\\repo',
      environment: { CI: '1' },
      requestId: REQUEST_ID,
      terminal: {
        acceptsStdin: true,
        columns: TERMINAL_COLUMNS,
        isTTY: true,
        supportsColor: true,
        terminalRequirement: 'interactiveInput'
      }
    }
  };
}

it('round-trips a presentation-free request envelope', () => {
    expect(decodeDaemonControlMessage(encodeDaemonControlMessage(createRequestStart()))).toEqual(
      createRequestStart()
    );
});

it('round-trips cancellation, rejection, and final result controls', () => {
    const messages: ReadonlyArray<DaemonControlMessage> = [
      { kind: 'requestCancel', payload: { requestId: REQUEST_ID } },
      {
        kind: 'requestRejected',
        payload: { code: 'unsupported', message: 'No resolver.', requestId: REQUEST_ID }
      },
      {
        kind: 'requestResult',
        payload: {
          aborted: false,
          exitCode: 0,
          outcome: 'success',
          requestId: REQUEST_ID
        }
      }
    ];
    for (const message of messages) {
      expect(decodeDaemonControlMessage(encodeDaemonControlMessage(message))).toEqual(message);
    }
});

it.each([
    [
      'duplicate-free request id',
      { ...createRequestStart(), payload: { ...createRequestStart().payload, requestId: '' } }
    ],
    [
      'string environment',
      { ...createRequestStart(), payload: { ...createRequestStart().payload, environment: { CI: 1 } } }
    ],
    [
      'positive columns',
      {
        ...createRequestStart(),
        payload: {
          ...createRequestStart().payload,
          terminal: { columns: INVALID_TERMINAL_COLUMN, isTTY: true, supportsColor: true }
        }
      }
    ],
    [
      'typed request result fields',
      {
        kind: 'requestResult',
        payload: {
          aborted: false,
          admissionErrorCode: 'later',
          exitCode: 0,
          outcome: 'success',
          requestId: REQUEST_ID
        }
      }
    ]
])('rejects an invalid %s', (testName: string, message: unknown) => {
  expect(testName).toBeDefined();
  expect(() =>
    decodeDaemonControlMessage(encodeDaemonControlMessage(message as DaemonControlMessage))
  ).toThrow();
});
