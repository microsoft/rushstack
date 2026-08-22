// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { isDaemonControlMessageKind } from './DaemonControlKinds';
import { DaemonProtocolError } from './DaemonProtocolError';
import { isDaemonVerbosity } from './DaemonVerbosity';
import {
  validateInteractiveCapability,
  validateRawModeControl,
  validateTerminalPolicyControl
} from './InteractiveControlValidation';
import {
  validateRequestAdmissionCapability,
  validateRequestQueuePositionControl
} from './RequestAdmissionControlValidation';
/** Returns `true` when `value` is a non-null control record. @beta */
export function isDaemonControlRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function fail(reason: string): never {
  throw new DaemonProtocolError('malformedControlMessage', reason);
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
function requireVersion(payload: Record<string, unknown>): void {
  const version: Record<string, unknown> = requireRecordField(payload, 'protocolVersion');
  requireNumberField(version, 'major');
  requireNumberField(version, 'minor');
}
function validateHelloAck(payload: Record<string, unknown>): void {
  requireVersion(payload);
  requireStringField(payload, 'sessionId');
}
function validatePong(payload: Record<string, unknown>): void {
  if (payload.daemonVersion !== undefined) requireStringField(payload, 'daemonVersion');
  if (payload.protocolVersion !== undefined) requireVersion(payload);
  requireNumberField(payload, 'uptimeMs');
}
function validateSubscribe(payload: Record<string, unknown>): void {
  if (typeof payload.isTTY !== 'boolean') {
    fail('Subscribe message payload.isTTY must be a boolean.');
  }
  validateInteractiveCapability(payload);
  validateRequestAdmissionCapability(payload);
  requireSubscribeVerbosity(payload);
}
function requireSubscribeVerbosity(payload: Record<string, unknown>): void {
  if (payload.verbosity !== undefined && !isDaemonVerbosity(payload.verbosity)) {
    fail('Subscribe message payload.verbosity is not a known verbosity level.');
  }
}
function validateError(payload: Record<string, unknown>): void {
  requireStringField(payload, 'code');
  requireStringField(payload, 'message');
}
type ControlValidator = (payload: Record<string, unknown>) => void;

const noopValidator: ControlValidator = () => undefined;

const VALIDATORS_BY_KIND: Record<string, ControlValidator> = {
  hello: requireVersion,
  helloAck: validateHelloAck,
  subscribe: validateSubscribe,
  unsubscribe: noopValidator,
  ping: noopValidator,
  pong: validatePong,
  error: validateError,
  setRawMode: validateRawModeControl,
  rawModeChanged: validateRawModeControl,
  terminalPolicy: validateTerminalPolicyControl,
  queuePosition: validateRequestQueuePositionControl
};

/** Structurally validates a parsed control message. @beta */
export function validateDaemonControlMessage(value: unknown): void {
  if (!isDaemonControlRecord(value)) {
    fail('Control frame payload is not a JSON object.');
  }
  if (!isDaemonControlMessageKind(value.kind)) {
    fail('Control message has an unknown kind.');
  }
  const payload: Record<string, unknown> = requireRecordField(value, 'payload');
  VALIDATORS_BY_KIND[value.kind](payload);
}
