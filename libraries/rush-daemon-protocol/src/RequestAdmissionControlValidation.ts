// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { isDaemonControlRecord } from './ControlRecord';
import { DaemonProtocolError } from './DaemonProtocolError';
import { validateQueuedRestartReason } from './InstallationChangeValidation';

const EMPTY_STRING_LENGTH: number = 0;
const FIRST_PROCESS_ID: number = 1;
const FIRST_QUEUE_POSITION: number = 1;
const NO_SCRIPTS: number = 0;

/** Validates optional request-admission capability negotiation. @internal */
export function validateRequestAdmissionCapability(payload: Record<string, unknown>): void {
  if (
    payload.supportsRequestAdmission !== undefined &&
    typeof payload.supportsRequestAdmission !== 'boolean'
  ) {
    fail('Subscribe message payload.supportsRequestAdmission must be a boolean.');
  }
}

/** Validates a one-based request queue position control. @internal */
export function validateRequestQueuePositionControl(payload: Record<string, unknown>): void {
  validateRequestId(payload.requestId);
  validateQueuePosition(payload.position);
  validateQueuedRestartReason(payload);
  validateScriptCount(payload.scriptCount);
  validateRestartsForAnotherRequest(payload.restartsForAnotherRequest);
  validateNativeLockHolder(payload.nativeLockHolder);
}

function validateNativeLockHolder(value: unknown): void {
  if (value !== undefined) {
    validateNativeLockHolderFields(requireNativeLockHolderRecord(value));
  }
}

function requireNativeLockHolderRecord(value: unknown): Record<string, unknown> {
  if (!isDaemonControlRecord(value) || Array.isArray(value)) {
    fail('Queue position payload.nativeLockHolder must be an object.');
  }
  return value;
}

function validateNativeLockHolderFields(holder: Record<string, unknown>): void {
  validateOptional(holder.pid, isProcessId, 'nativeLockHolder.pid must be a positive safe integer');
  validateOptional(holder.command, isNonEmptyString, 'nativeLockHolder.command must be a nonempty string');
}

function validateOptional(value: unknown, isValid: (value: unknown) => boolean, requirement: string): void {
  if (value !== undefined && !isValid(value)) {
    fail(`Queue position payload.${requirement}.`);
  }
}

function isProcessId(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= FIRST_PROCESS_ID;
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > EMPTY_STRING_LENGTH;
}

function validateRestartsForAnotherRequest(value: unknown): void {
  if (value !== undefined && typeof value !== 'boolean') {
    fail('Queue position payload.restartsForAnotherRequest must be a boolean.');
  }
}

function validateScriptCount(value: unknown): void {
  if (value !== undefined && !isScriptCount(value)) {
    fail('Queue position payload.scriptCount must be a nonnegative safe integer.');
  }
}

function isScriptCount(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= NO_SCRIPTS;
}

function validateRequestId(value: unknown): void {
  if (typeof value !== 'string' || value.length === EMPTY_STRING_LENGTH) {
    fail('Queue position payload.requestId must be a nonempty string.');
  }
}

function validateQueuePosition(value: unknown): void {
  if (!Number.isSafeInteger(value) || (value as number) < FIRST_QUEUE_POSITION) {
    fail('Queue position payload.position must be a positive safe integer.');
  }
}

function fail(reason: string): never {
  throw new DaemonProtocolError('malformedControlMessage', reason);
}
