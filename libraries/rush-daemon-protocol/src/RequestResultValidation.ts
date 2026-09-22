// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { isDaemonControlRecord } from './ControlRecord';
import { DaemonProtocolError } from './DaemonProtocolError';

const ADMISSION_ERROR_CODES: ReadonlySet<unknown> = new Set(['aborted', 'no-wait', 'wait-timeout']);
const EMPTY_STRING_LENGTH: number = 0;

/** Validates optional global and phased result fields. @internal */
export function validateRequestResultFields(payload: Record<string, unknown>): void {
  validateOptionalString(payload.errorMessage, 'errorMessage');
  validateAdmissionErrorCode(payload.admissionErrorCode);
  validatePhasedResultShape(payload);
}

function validateAdmissionErrorCode(value: unknown): void {
  if (value !== undefined && !ADMISSION_ERROR_CODES.has(value)) {
    fail('Request result admissionErrorCode is not recognized.');
  }
}

function validatePhasedResultShape(payload: Record<string, unknown>): void {
  const hasScheduled: boolean = payload.scheduled !== undefined;
  const hasOperationResults: boolean = payload.operationResults !== undefined;
  if (hasScheduled !== hasOperationResults) {
    fail('Phased request results require scheduled and operationResults together.');
  }
  if (!hasScheduled) return;
  validatePhasedResult(payload.scheduled, payload.operationResults);
}

function validatePhasedResult(scheduled: unknown, operationResults: unknown): void {
  requireBoolean(scheduled, 'Request result scheduled');
  requireArray(operationResults, 'Request result operationResults');
  for (const result of operationResults) validateOperationResult(result);
}

function validateOperationResult(value: unknown): void {
  if (!isDaemonControlRecord(value) || Array.isArray(value)) {
    fail('Phased operation result must be an object.');
  }
  requireNonemptyString(value.operationId, 'operationId');
  requireNonemptyString(value.status, 'status');
  validateOptionalString(value.errorMessage, 'operation errorMessage');
}

function validateOptionalString(value: unknown, name: string): void {
  if (value !== undefined && typeof value !== 'string') {
    fail(`Request result ${name} must be a string.`);
  }
}

function requireNonemptyString(value: unknown, name: string): void {
  if (typeof value !== 'string') {
    fail(`Phased operation result ${name} must be a string.`);
  }
  requireNonemptyTrimmedString(value, name);
}

function requireNonemptyTrimmedString(value: string, name: string): void {
  if (value.length === EMPTY_STRING_LENGTH) {
    fail(`Phased operation result ${name} must be a nonempty trimmed string.`);
  }
  if (value.trim() !== value) {
    fail(`Phased operation result ${name} must be a nonempty trimmed string.`);
  }
}

function requireBoolean(value: unknown, name: string): asserts value is boolean {
  if (typeof value !== 'boolean') fail(`${name} must be a boolean.`);
}

function requireArray(value: unknown, name: string): asserts value is unknown[] {
  if (!Array.isArray(value)) fail(`${name} must be an array.`);
}

function fail(reason: string): never {
  throw new DaemonProtocolError('malformedControlMessage', reason);
}
