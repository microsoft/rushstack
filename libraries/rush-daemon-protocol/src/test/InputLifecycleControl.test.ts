// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';
import { validateDaemonControlMessage } from '../ControlMessageValidation';
import type { DaemonControlMessage } from '../DaemonControlMessage';

const REQUEST_ID: string = 'input-request';
const MESSAGES: readonly DaemonControlMessage[] = [
  { kind: 'stdinReady', payload: { requestId: REQUEST_ID } },
  { kind: 'stdinEnd', payload: { requestId: REQUEST_ID } }
];

it.each(MESSAGES)('round-trips $kind', (message: DaemonControlMessage) => {
  expect(decodeDaemonControlMessage(encodeDaemonControlMessage(message))).toEqual(message);
});

it.each(['stdinReady', 'stdinEnd'])('requires a valid request identifier for %s', (kind: string) => {
  expect(() => validateDaemonControlMessage({ kind, payload: {} })).toThrow();
  expect(() => validateDaemonControlMessage({ kind, payload: { requestId: '' } })).toThrow();
  expect(() => validateDaemonControlMessage({ kind, payload: { requestId: ' invalid ' } })).toThrow();
});

it.each([true, false, undefined])('accepts input capability %s', (supportsInputLifecycle) => {
  expect(() => validateDaemonControlMessage({
    kind: 'subscribe',
    payload: { isTTY: false, supportsInputLifecycle }
  })).not.toThrow();
});

it('rejects an invalid input lifecycle capability', () => {
  expect(() => validateDaemonControlMessage({
    kind: 'subscribe',
    payload: { isTTY: false, supportsInputLifecycle: 'yes' }
  })).toThrow('supportsInputLifecycle');
});
