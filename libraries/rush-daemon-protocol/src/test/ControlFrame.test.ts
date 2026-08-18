// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';
import type { DaemonControlMessage } from '../DaemonControlMessage';
import { DAEMON_PROTOCOL_VERSION } from '../DaemonProtocolVersion';

import { captureProtocolError } from './TestVectors';

const UPTIME_MS: number = 42;
const COLUMNS: number = 120;
const DAEMON_VERSION: string = '5.178.1';

const MESSAGES: readonly DaemonControlMessage[] = [
  { kind: 'hello', payload: { protocolVersion: DAEMON_PROTOCOL_VERSION } },
  { kind: 'helloAck', payload: { protocolVersion: DAEMON_PROTOCOL_VERSION, sessionId: 's-1' } },
  { kind: 'subscribe', payload: { isTTY: true, verbosity: 'verbose', columns: COLUMNS } },
  { kind: 'unsubscribe', payload: {} },
  { kind: 'ping', payload: {} },
  {
    kind: 'pong',
    payload: {
      daemonVersion: DAEMON_VERSION,
      protocolVersion: DAEMON_PROTOCOL_VERSION,
      uptimeMs: UPTIME_MS
    }
  },
  { kind: 'error', payload: { code: 'malformedPayload', message: 'bad' } }
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
  expect(error.code).toBe('malformedControlMessage');
  expect(error.cause).toBeDefined();
});

it('rejects a control message with an unknown kind', () => {
  const error: ReturnType<typeof captureProtocolError> = captureProtocolError(() =>
    decodeDaemonControlMessage(Buffer.from('{"kind":"teleport","payload":{}}'))
  );
  expect(error.code).toBe('malformedControlMessage');
});

it('rejects a control message without a payload object', () => {
  const error: ReturnType<typeof captureProtocolError> = captureProtocolError(() =>
    decodeDaemonControlMessage(Buffer.from('{"kind":"hello"}'))
  );
  expect(error.code).toBe('malformedControlMessage');
});

it('rejects a hello without a version', () => {
  const error: ReturnType<typeof captureProtocolError> = captureProtocolError(() =>
    decodeDaemonControlMessage(Buffer.from('{"kind":"hello","payload":{}}'))
  );
  expect(error.code).toBe('malformedControlMessage');
});

it('rejects a subscribe with an unknown verbosity', () => {
  const json: string = '{"kind":"subscribe","payload":{"isTTY":true,"verbosity":"loud"}}';
  const error: ReturnType<typeof captureProtocolError> = captureProtocolError(() =>
    decodeDaemonControlMessage(Buffer.from(json))
  );
  expect(error.code).toBe('malformedControlMessage');
});
