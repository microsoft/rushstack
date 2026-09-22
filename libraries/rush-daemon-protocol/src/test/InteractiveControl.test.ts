// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';
import type { DaemonControlMessage } from '../DaemonControlMessage';

import { captureProtocolError } from './TestVectors';

const MESSAGES: readonly DaemonControlMessage[] = [
  {
    kind: 'subscribe',
    payload: { isTTY: true, supportsInteractiveIO: true }
  },
  { kind: 'setRawMode', payload: { enabled: true, requestId: 'request-1' } },
  { kind: 'rawModeChanged', payload: { enabled: false, requestId: 'request-1' } },
  {
    kind: 'terminalPolicy',
    payload: {
      decision: 'requiresInProcess',
      reason: 'controllingTerminalRequired',
      requestId: 'request-1'
    }
  }
];

it('round-trips interactive capability and request-scoped controls', () => {
  for (const message of MESSAGES) {
    expect(decodeDaemonControlMessage(encodeDaemonControlMessage(message))).toEqual(message);
  }
});

it('rejects malformed interactive capability and control messages', () => {
  const invalidMessages: readonly string[] = [
    '{"kind":"subscribe","payload":{"isTTY":true,"supportsInteractiveIO":"yes"}}',
    '{"kind":"setRawMode","payload":{"enabled":"yes","requestId":"r"}}',
    '{"kind":"terminalPolicy","payload":{"decision":"allocatePty","requestId":"r"}}'
  ];
  for (const json of invalidMessages) {
    expect(captureProtocolError(() => decodeDaemonControlMessage(Buffer.from(json))).code).toBe(
      'malformedControlMessage'
    );
  }
});
