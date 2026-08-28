// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { isDaemonControlRecord } from './ControlRecord';
import type { IDaemonEventEnvelope, IDaemonEventSource } from './DaemonEventEnvelope';
import { isDaemonEventType } from './DaemonEventType';
import { DaemonProtocolError } from './DaemonProtocolError';

const ENVELOPE_STRING_FIELDS: readonly string[] = ['eventId', 'sessionId', 'timestamp'];

function hasStringFields(record: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.every((field: string) => typeof record[field] === 'string');
}

function isProtocolVersionLike(value: unknown): boolean {
  if (!isDaemonControlRecord(value)) {
    return false;
  }
  return typeof value.major === 'number' && typeof value.minor === 'number';
}

function isEventSource(value: unknown): value is IDaemonEventSource {
  if (!isDaemonControlRecord(value)) {
    return false;
  }
  return typeof value.packageName === 'string' && typeof value.packageVersion === 'string';
}

function hasValidScalars(record: Record<string, unknown>): boolean {
  return typeof record.sequence === 'number' && typeof record.required === 'boolean';
}

function hasValidEnvelopeShape(record: Record<string, unknown>): boolean {
  return [
    isDaemonEventType(record.type),
    hasStringFields(record, ENVELOPE_STRING_FIELDS),
    hasValidScalars(record),
    isEventSource(record.source),
    isProtocolVersionLike(record.protocolVersion)
  ].every(Boolean);
}

/**
 * Returns `true` when `value` is structurally a valid event envelope.
 *
 * @remarks
 * Unknown optional fields introduced by newer minor protocol versions are
 * tolerated (they are preserved through JSON round-trips); only the core
 * shape is validated.
 *
 * @beta
 */
export function isDaemonEventEnvelope(value: unknown): value is IDaemonEventEnvelope {
  return isDaemonControlRecord(value) && hasValidEnvelopeShape(value);
}

/**
 * Validates `value` as an event envelope, throwing a typed
 * {@link DaemonProtocolError} (`malformedPayload`) otherwise.
 *
 * @beta
 */
export function validateDaemonEventEnvelope(value: unknown): IDaemonEventEnvelope {
  if (!isDaemonEventEnvelope(value)) {
    throw new DaemonProtocolError(
      'malformedPayload',
      'Event frame payload is not a valid event envelope.'
    );
  }
  return value;
}
