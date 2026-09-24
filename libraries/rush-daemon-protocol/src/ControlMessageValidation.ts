// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { isDaemonControlRecord } from './ControlRecord';
import { isDaemonControlMessageKind } from './DaemonControlKinds';
import { validateDaemonPong } from './DaemonPongValidation';
import { DaemonProtocolError } from './DaemonProtocolError';
import { validateRawModeControl, validateTerminalPolicyControl } from './InteractiveControlValidation';
import { validateRequestQueuePositionControl } from './RequestAdmissionControlValidation';
import {
  validateRequestCancelControl,
  validateRequestRejectedControl,
  validateRequestResultControl,
  validateRequestStartControl
} from './RequestControlValidation';
import { validateShutdownAck } from './ShutdownAckValidation';
import { validateSubscribeControl } from './SubscribeControlValidation';
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
function validateError(payload: Record<string, unknown>): void {
  requireStringField(payload, 'code');
  requireStringField(payload, 'message');
}
type ControlValidator = (payload: Record<string, unknown>) => void;
const noopValidator: ControlValidator = () => undefined;

const VALIDATORS_BY_KIND: Record<string, ControlValidator> = {
  hello: requireVersion,
  helloAck: validateHelloAck,
  subscribe: validateSubscribeControl,
  unsubscribe: noopValidator,
  ping: noopValidator,
  pong: validateDaemonPong,
  error: validateError,
  setRawMode: validateRawModeControl,
  rawModeChanged: validateRawModeControl,
  terminalPolicy: validateTerminalPolicyControl,
  queuePosition: validateRequestQueuePositionControl,
  requestStart: validateRequestStartControl,
  requestCancel: validateRequestCancelControl,
  requestRejected: validateRequestRejectedControl,
  requestResult: validateRequestResultControl,
  shutdown: noopValidator,
  shutdownAck: validateShutdownAck,
  stdinReady: validateRequestCancelControl,
  stdinEnd: validateRequestCancelControl
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
