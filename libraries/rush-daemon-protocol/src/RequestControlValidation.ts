// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { isDaemonControlRecord } from './ControlRecord';
import { DaemonProtocolError } from './DaemonProtocolError';
import { validateRequestAdmission, validateRequestTerminal } from './RequestEnvelopeValidation';
import { validateRequestId } from './RequestIdentifierValidation';
import { validateRequestResultFields } from './RequestResultValidation';

const MINIMUM_EXIT_CODE: number = 0;
const COMMAND_ORIGINS: ReadonlySet<unknown> = new Set(['built-in', 'custom']);
const REQUEST_OUTCOMES: ReadonlySet<unknown> = new Set([
  'success',
  'success-with-warning',
  'failure',
  'aborted'
]);
const REJECTION_CODES: ReadonlySet<unknown> = new Set([
  'invalidRequest',
  'routingFailed',
  'unsupported',
  'workspaceRecreationRequired'
]);

/** Validates a request-start payload. @internal */
export function validateRequestStartControl(payload: Record<string, unknown>): void {
  validateRequestId(payload.requestId);
  requireString(payload.commandName, 'requestStart payload.commandName');
  if (!COMMAND_ORIGINS.has(payload.commandOrigin)) fail('Request command origin is not recognized.');
  requireString(payload.cwd, 'requestStart payload.cwd');
  requireStringArray(payload.argv, 'requestStart payload.argv');
  requireStringRecord(payload.environment, 'requestStart payload.environment');
  validateRequestTerminal(payload.terminal);
  validateRequestAdmission(payload.admission);
}

/** Validates a request-cancel payload. @internal */
export function validateRequestCancelControl(payload: Record<string, unknown>): void {
  validateRequestId(payload.requestId);
}

/** Validates a terminal request-rejection payload. @internal */
export function validateRequestRejectedControl(payload: Record<string, unknown>): void {
  validateRequestId(payload.requestId);
  requireString(payload.code, 'requestRejected payload.code');
  requireString(payload.message, 'requestRejected payload.message');
  if (!REJECTION_CODES.has(payload.code)) fail('Request rejection code is not recognized.');
}

/** Validates a terminal request-result payload. @internal */
export function validateRequestResultControl(payload: Record<string, unknown>): void {
  validateRequestId(payload.requestId);
  requireString(payload.outcome, 'requestResult payload.outcome');
  if (!REQUEST_OUTCOMES.has(payload.outcome)) fail('Request result outcome is not recognized.');
  validateResultFields(payload);
}

function validateResultFields(payload: Record<string, unknown>): void {
  if (typeof payload.aborted !== 'boolean') fail('Request result aborted must be a boolean.');
  validateExitCode(payload.exitCode);
  validateRequestResultFields(payload);
}
function validateExitCode(exitCode: unknown): void {
  if (!Number.isSafeInteger(exitCode)) {
    fail('Request result exitCode must be an integer.');
  }
  if ((exitCode as number) < MINIMUM_EXIT_CODE) {
    fail('Request result exitCode must be a nonnegative integer.');
  }
}
function requireString(value: unknown, name: string): void {
  if (typeof value !== 'string') fail(`${name} must be a string.`);
}

function requireStringArray(value: unknown, name: string): void {
  if (!Array.isArray(value) || value.some((item: unknown) => typeof item !== 'string')) {
    fail(`${name} must be an array of strings.`);
  }
}

function requireStringRecord(value: unknown, name: string): void {
  const record: Record<string, unknown> = requireRecord(value, name);
  if (Object.values(record).some((item: unknown) => typeof item !== 'string')) {
    fail(`${name} values must be strings.`);
  }
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!isDaemonControlRecord(value) || Array.isArray(value)) fail(`${name} must be an object.`);
  return value;
}

function fail(reason: string): never {
  throw new DaemonProtocolError('malformedControlMessage', reason);
}
