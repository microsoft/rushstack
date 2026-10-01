// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';
import { validateDaemonControlMessage } from '../ControlMessageValidation';
import type { DaemonControlMessage } from '../DaemonControlMessage';
import {
  DAEMON_KEEPALIVE_PROTOCOL_MINOR,
  DAEMON_PROTOCOL_VERSION,
  DAEMON_REQUEST_STARTED_PROTOCOL_MINOR
} from '../DaemonProtocolVersion';

const REQUEST_ID: string = 'started-request';

it('is a minor after keepalive, and the one this package implements', () => {
  expect(DAEMON_REQUEST_STARTED_PROTOCOL_MINOR).toBeGreaterThan(DAEMON_KEEPALIVE_PROTOCOL_MINOR);
  expect(DAEMON_PROTOCOL_VERSION.minor).toBe(DAEMON_REQUEST_STARTED_PROTOCOL_MINOR);
});

it('round-trips requestStarted', () => {
  const message: DaemonControlMessage = { kind: 'requestStarted', payload: { requestId: REQUEST_ID } };
  expect(decodeDaemonControlMessage(encodeDaemonControlMessage(message))).toEqual(message);
});

it('requires a valid request identifier for requestStarted', () => {
  const kind: string = 'requestStarted';
  expect(() => validateDaemonControlMessage({ kind, payload: {} })).toThrow();
  expect(() => validateDaemonControlMessage({ kind, payload: { requestId: '' } })).toThrow();
  expect(() => validateDaemonControlMessage({ kind, payload: { requestId: ' invalid ' } })).toThrow();
});

it.each([true, false, undefined])('accepts the requestStarted capability %s', (supportsRequestStarted) => {
  expect(() =>
    validateDaemonControlMessage({
      kind: 'subscribe',
      payload: { isTTY: false, supportsRequestStarted }
    })
  ).not.toThrow();
});

it('rejects an invalid requestStarted capability', () => {
  expect(() =>
    validateDaemonControlMessage({
      kind: 'subscribe',
      payload: { isTTY: false, supportsRequestStarted: 'yes' }
    })
  ).toThrow('supportsRequestStarted');
});
