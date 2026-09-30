// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { isDaemonControlRecord } from './ControlRecord';
import { DaemonProtocolError } from './DaemonProtocolError';

const EMPTY_STRING_LENGTH: number = 0;
const FIRST_OPERATION_COUNT: number = 1;

/**
 * Whether `value` is an `IDaemonContinuingOperations`: a positive count, and at most that many nonempty names.
 * @internal
 */
export function isDaemonContinuingOperations(value: unknown): boolean {
  return isDaemonControlRecord(value) && !Array.isArray(value) && hasContinuingOperationsFields(value);
}

/** Validates a queue position's optional `continuingOperations`. @internal */
export function validateQueuedContinuingOperations(value: unknown): void {
  if (value !== undefined && !isDaemonContinuingOperations(value)) {
    throw new DaemonProtocolError(
      'malformedControlMessage',
      'Queue position payload.continuingOperations must have a positive count and at most that many ' +
        'nonempty names.'
    );
  }
}

function hasContinuingOperationsFields(value: Record<string, unknown>): boolean {
  return isOperationCount(value.count) && isNameList(value.names, value.count as number);
}

function isOperationCount(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= FIRST_OPERATION_COUNT;
}

function isNameList(value: unknown, count: number): boolean {
  return Array.isArray(value) && value.length <= count && value.every(isNonEmptyString);
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > EMPTY_STRING_LENGTH;
}
