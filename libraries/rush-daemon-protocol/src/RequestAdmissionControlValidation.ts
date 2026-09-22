// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonProtocolError } from './DaemonProtocolError';

const EMPTY_STRING_LENGTH: number = 0;
const FIRST_QUEUE_POSITION: number = 1;

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
