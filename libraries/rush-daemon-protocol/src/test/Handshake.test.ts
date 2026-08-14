// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createDaemonHello, negotiateDaemonHello } from '../DaemonHandshake';
import type { DaemonHandshakeOutcome } from '../DaemonHandshake';
import { DaemonProtocolErrorCode, ProtocolVersionMismatchError } from '../DaemonProtocolError';
import { DAEMON_PROTOCOL_VERSION } from '../DaemonProtocolVersion';

const NEWER_MAJOR: number = 1;
const SESSION_ID: string = 'session-abc';

it('exports a well-formed DAEMON_PROTOCOL_VERSION', () => {
  expect(typeof DAEMON_PROTOCOL_VERSION.major).toBe('number');
  expect(typeof DAEMON_PROTOCOL_VERSION.minor).toBe('number');
});

it('accepts a matching major version', () => {
  const hello: ReturnType<typeof createDaemonHello> = createDaemonHello(DAEMON_PROTOCOL_VERSION);
  const outcome: DaemonHandshakeOutcome = negotiateDaemonHello(hello, DAEMON_PROTOCOL_VERSION, SESSION_ID);
  expect(outcome.accepted).toBe(true);
  if (outcome.accepted) {
    expect(outcome.ack.sessionId).toBe(SESSION_ID);
    expect(outcome.ack.protocolVersion).toEqual(DAEMON_PROTOCOL_VERSION);
  }
});

it('rejects a mismatched major version with a typed error', () => {
  const hello: ReturnType<typeof createDaemonHello> = createDaemonHello({
    major: DAEMON_PROTOCOL_VERSION.major + NEWER_MAJOR,
    minor: DAEMON_PROTOCOL_VERSION.minor
  });
  const outcome: DaemonHandshakeOutcome = negotiateDaemonHello(hello, DAEMON_PROTOCOL_VERSION, SESSION_ID);
  expect(outcome.accepted).toBe(false);
  if (!outcome.accepted) {
    expect(outcome.error).toBeInstanceOf(ProtocolVersionMismatchError);
    expect(outcome.error.code).toBe(DaemonProtocolErrorCode.protocolVersionMismatch);
    expect(outcome.error.expectedMajor).toBe(DAEMON_PROTOCOL_VERSION.major);
    expect(outcome.error.actualMajor).toBe(DAEMON_PROTOCOL_VERSION.major + NEWER_MAJOR);
  }
});
