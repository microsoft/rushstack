// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonEventEnvelope } from '../DaemonEventEnvelope';
import type { DaemonEventType } from '../DaemonEventType';
import type { DaemonProtocolError } from '../DaemonProtocolError';

const BYTE_FF: number = 0xff;
const BYTE_FE: number = 0xfe;
const BYTE_80: number = 0x80;
const BYTE_NUL: number = 0x00;

/** A byte sequence that is invalid UTF-8, for lossless round-trip tests. */
export const NON_UTF8_BYTES: Buffer = Buffer.from([BYTE_FF, BYTE_FE, BYTE_80, BYTE_NUL]);

const FIRST_SEQUENCE: number = 1;
const SCHEMA_MAJOR: number = 0;
const SCHEMA_MINOR: number = 1;

/** The count of an empty collection. */
export const EMPTY_COUNT: number = 0;

/** The count of a single-element collection. */
export const SINGLE_COUNT: number = 1;

/** The count of a two-element collection. */
export const PAIR_COUNT: number = 2;

/** The index of the first element of a collection or buffer. */
export const FIRST_INDEX: number = 0;

/**
 * Captures the {@link DaemonProtocolError} thrown by `run`.
 */
export function captureProtocolError(run: () => unknown): DaemonProtocolError {
  try {
    run();
  } catch (error) {
    return error as DaemonProtocolError;
  }
  throw new Error('Expected the call to throw a DaemonProtocolError.');
}

/** Options for {@link createTestEnvelope}. */
export interface ITestEnvelopeOptions {
  readonly type: DaemonEventType;
  readonly payload?: unknown;
  readonly required?: boolean;
}

/** Creates a minimal but structurally complete event envelope for tests. */
export function createTestEnvelope(options: ITestEnvelopeOptions): IDaemonEventEnvelope {
  return {
    protocolVersion: { major: SCHEMA_MAJOR, minor: SCHEMA_MINOR },
    eventId: 'evt-test',
    sessionId: 'session-test',
    sequence: FIRST_SEQUENCE,
    timestamp: '2026-08-13T00:00:00.000Z',
    source: { packageName: '@rushstack/rush-daemon-protocol', packageVersion: '0.1.0' },
    privacy: 'public',
    required: options.required ?? false,
    type: options.type,
    payload: options.payload
  };
}
