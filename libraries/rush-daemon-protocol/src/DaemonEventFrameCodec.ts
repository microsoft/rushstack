// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonEventEnvelope } from './DaemonEventEnvelope';
import { DaemonProtocolError, DaemonProtocolErrorCode } from './DaemonProtocolError';
import type { DaemonVerbosity } from './DaemonVerbosity';
import { shouldSerializeDaemonEvent } from './DaemonVerbosityFilter';

const UTF8: BufferEncoding = 'utf8';

/**
 * Serializes an event envelope as UTF-8 JSON for a `0x05` event frame.
 *
 * @beta
 */
export function encodeDaemonEventFrame(envelope: IDaemonEventEnvelope): Buffer {
  return Buffer.from(JSON.stringify(envelope), UTF8);
}

/**
 * Parses the payload of a `0x05` event frame.
 *
 * @remarks
 * Performs JSON parsing plus minimal envelope shape validation; unknown
 * optional fields introduced by newer minor protocol versions are preserved.
 *
 * @beta
 */
export function decodeDaemonEventFrame(payload: Buffer): IDaemonEventEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload.toString(UTF8)) as unknown;
  } catch (error) {
    throw new DaemonProtocolError(
      DaemonProtocolErrorCode.malformedPayload,
      `Event frame payload is not valid JSON: ${(error as Error).message}`
    );
  }
  return parsed as IDaemonEventEnvelope;
}

/**
 * Serializes `envelope` for a subscription at `verbosity`, or returns
 * `undefined` when the filter suppresses it for that subscription.
 *
 * @remarks
 * This is the serialization-time hook implementing per-client verbosity: the
 * shared engine event stream is never mutated; each subscription decides
 * independently.
 *
 * @beta
 */
export function serializeDaemonEventForSubscription(
  verbosity: DaemonVerbosity,
  envelope: IDaemonEventEnvelope
): Buffer | undefined {
  if (!shouldSerializeDaemonEvent(verbosity, envelope)) {
    return undefined;
  }
  return encodeDaemonEventFrame(envelope);
}
