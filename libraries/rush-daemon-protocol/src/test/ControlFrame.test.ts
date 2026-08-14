// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';
import type { DaemonControlMessage } from '../DaemonControlMessage';
import { DaemonProtocolErrorCode } from '../DaemonProtocolError';
import { DAEMON_PROTOCOL_VERSION } from '../DaemonProtocolVersion';

import { captureProtocolError } from './TestVectors';

const UPTIME_MS: number = 42;
const COLUMNS: number = 120;

const MESSAGES: readonly DaemonControlMessage[] = [
  { kind: 'hello', protocolVersion: DAEMON_PROTOCOL_VERSION },
  { kind: 'helloAck', protocolVersion: DAEMON_PROTOCOL_VERSION, sessionId: 's-1' },
  { kind: 'subscribe', caps: { isTTY: true, verbosity: 'verbose', columns: COLUMNS } },
  { kind: 'unsubscribe' },
  { kind: 'ping' },
  { kind: 'pong', uptimeMs: UPTIME_MS },
  { kind: 'error', code: DaemonProtocolErrorCode.malformedPayload, message: 'bad' }
];

it('round-trips every control message kind', () => {
  for (const message of MESSAGES) {
    expect(decodeDaemonControlMessage(encodeDaemonControlMessage(message))).toEqual(message);
  }
});

it('rejects a non-JSON control payload', () => {
  const error: ReturnType<typeof captureProtocolError> = captureProtocolError(() =>
    decodeDaemonControlMessage(Buffer.from('not-json'))
  );
  expect(error.code).toBe(DaemonProtocolErrorCode.malformedControlMessage);
});

it('rejects a control message with an unknown kind', () => {
  const error: ReturnType<typeof captureProtocolError> = captureProtocolError(() =>
    decodeDaemonControlMessage(Buffer.from('{"kind":"teleport"}'))
  );
  expect(error.code).toBe(DaemonProtocolErrorCode.malformedControlMessage);
});

it('rejects a hello without a version', () => {
  const error: ReturnType<typeof captureProtocolError> = captureProtocolError(() =>
    decodeDaemonControlMessage(Buffer.from('{"kind":"hello"}'))
  );
  expect(error.code).toBe(DaemonProtocolErrorCode.malformedControlMessage);
});

it('rejects a subscribe with an unknown verbosity', () => {
  const json: string = '{"kind":"subscribe","caps":{"isTTY":true,"verbosity":"loud"}}';
  const error: ReturnType<typeof captureProtocolError> = captureProtocolError(() =>
    decodeDaemonControlMessage(Buffer.from(json))
  );
  expect(error.code).toBe(DaemonProtocolErrorCode.malformedControlMessage);
});
