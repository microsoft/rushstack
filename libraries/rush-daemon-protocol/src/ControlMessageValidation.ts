// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DAEMON_CONTROL_MESSAGE_KINDS } from './DaemonControlMessage';
import { DaemonProtocolError, DaemonProtocolErrorCode } from './DaemonProtocolError';
import { isDaemonVerbosity } from './DaemonVerbosity';

/** Returns `true` when `value` is a plain object. @beta */
export function isDaemonControlRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function fail(reason: string): never {
  throw new DaemonProtocolError(DaemonProtocolErrorCode.malformedControlMessage, reason);
}

function requireRecordField(record: Record<string, unknown>, field: string): Record<string, unknown> {
  const value: unknown = record[field];
  if (!isDaemonControlRecord(value)) {
    fail(`Control message field "${field}" must be an object.`);
  }
  return value;
}

function requireStringField(record: Record<string, unknown>, field: string): void {
  if (typeof record[field] !== 'string') {
    fail(`Control message field "${field}" must be a string.`);
  }
}

function requireNumberField(record: Record<string, unknown>, field: string): void {
  if (typeof record[field] !== 'number') {
    fail(`Control message field "${field}" must be a number.`);
  }
}

function requireVersion(record: Record<string, unknown>): void {
  const version: Record<string, unknown> = requireRecordField(record, 'protocolVersion');
  requireNumberField(version, 'major');
  requireNumberField(version, 'minor');
}

function requireCapsVerbosity(caps: Record<string, unknown>): void {
  if (caps.verbosity !== undefined && !isDaemonVerbosity(caps.verbosity)) {
    fail('Subscribe message caps.verbosity is not a known verbosity level.');
  }
}

function validateCaps(record: Record<string, unknown>): void {
  const caps: Record<string, unknown> = requireRecordField(record, 'caps');
  if (typeof caps.isTTY !== 'boolean') {
    fail('Subscribe message caps.isTTY must be a boolean.');
  }
  requireCapsVerbosity(caps);
}

function validateHelloAck(record: Record<string, unknown>): void {
  requireVersion(record);
  requireStringField(record, 'sessionId');
}

function validateError(record: Record<string, unknown>): void {
  requireStringField(record, 'code');
  requireStringField(record, 'message');
}

type ControlValidator = (record: Record<string, unknown>) => void;

const noopValidator: ControlValidator = () => undefined;

const VALIDATORS_BY_KIND: Record<string, ControlValidator> = {
  hello: requireVersion,
  helloAck: validateHelloAck,
  subscribe: validateCaps,
  unsubscribe: noopValidator,
  ping: noopValidator,
  pong: (record: Record<string, unknown>) => requireNumberField(record, 'uptimeMs'),
  error: validateError
};

function requireKnownKind(record: Record<string, unknown>): string {
  const kind: unknown = record.kind;
  if (typeof kind !== 'string' || !DAEMON_CONTROL_MESSAGE_KINDS.includes(kind)) {
    fail('Control message has an unknown kind.');
  }
  return kind;
}

/**
 * Structurally validates a parsed control message.
 * @throws {@link DaemonProtocolError} when the value is not a well-formed control message.
 * @beta
 */
export function validateDaemonControlMessage(value: unknown): void {
  if (!isDaemonControlRecord(value)) {
    fail('Control frame payload is not a JSON object.');
  }
  const kind: string = requireKnownKind(value);
  VALIDATORS_BY_KIND[kind](value);
}
