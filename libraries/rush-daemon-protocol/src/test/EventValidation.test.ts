// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonEventEnvelope } from '../DaemonEventEnvelope';
import { decodeDaemonEventFrame, encodeDaemonEventFrame } from '../DaemonEventFrameCodec';
import { isDaemonEventEnvelope } from '../DaemonEventValidation';

import { captureProtocolError, createTestEnvelope } from './TestVectors';

it('accepts a well-formed envelope and round-trips it', () => {
  const envelope: IDaemonEventEnvelope = createTestEnvelope({ type: 'operationStatusChanged' });
  const decoded: IDaemonEventEnvelope = decodeDaemonEventFrame(encodeDaemonEventFrame(envelope));
  expect(decoded).toEqual(envelope);
});

it('rejects an envelope with an unknown event type', () => {
  const invalid: unknown = { ...createTestEnvelope({ type: 'commandResult' }), type: 'warpDrive' };
  expect(isDaemonEventEnvelope(invalid)).toBe(false);
  const error: ReturnType<typeof captureProtocolError> = captureProtocolError(() =>
    decodeDaemonEventFrame(Buffer.from(JSON.stringify(invalid)))
  );
  expect(error.code).toBe('malformedPayload');
});

it('rejects an envelope missing required string fields', () => {
  const partial: unknown = { ...createTestEnvelope({ type: 'commandResult' }), eventId: undefined };
  expect(isDaemonEventEnvelope(partial)).toBe(false);
});

it('rejects an envelope with a malformed source', () => {
  const badSource: unknown = { ...createTestEnvelope({ type: 'commandResult' }), source: {} };
  expect(isDaemonEventEnvelope(badSource)).toBe(false);
});

it('rejects non-JSON event payloads with a typed error carrying the cause', () => {
  const error: ReturnType<typeof captureProtocolError> = captureProtocolError(() =>
    decodeDaemonEventFrame(Buffer.from('{nope'))
  );
  expect(error.code).toBe('malformedPayload');
  expect(error.cause).toBeDefined();
});
