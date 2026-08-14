// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonEventEnvelope } from './DaemonEventEnvelope';
import { validateDaemonEventEnvelope } from './DaemonEventValidation';
import { DaemonProtocolError } from './DaemonProtocolError';
import type { DaemonVerbosity } from './DaemonVerbosity';
import { shouldSerializeDaemonEvent } from './DaemonVerbosityFilter';
import { WIRE_TEXT_DECODER, WIRE_TEXT_ENCODER } from './DaemonWireText';

/**
 * Serializes an event envelope as UTF-8 JSON for a `0x05` event frame.
 *
 * @beta
 */
export function encodeDaemonEventFrame(envelope: IDaemonEventEnvelope): Uint8Array {
  return WIRE_TEXT_ENCODER.encode(JSON.stringify(envelope));
}

/**
 * Parses and structurally validates the payload of a `0x05` event frame.
 *
 * @remarks
 * Unknown optional fields introduced by newer minor protocol versions are
 * preserved; malformed input is rejected with a typed error rather than
 * reaching event routing.
 *
 * @throws {@link DaemonProtocolError} when the payload is not valid JSON or
 * fails envelope shape validation.
 *
 * @beta
 */
export function decodeDaemonEventFrame(payload: Uint8Array): IDaemonEventEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(WIRE_TEXT_DECODER.decode(payload)) as unknown;
  } catch (error) {
    throw new DaemonProtocolError('malformedPayload', 'Event frame payload is not valid JSON.', {
      cause: error
    });
  }
  return validateDaemonEventEnvelope(parsed);
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
): Uint8Array | undefined {
  if (!shouldSerializeDaemonEvent(verbosity, envelope)) {
    return undefined;
  }
  return encodeDaemonEventFrame(envelope);
}
