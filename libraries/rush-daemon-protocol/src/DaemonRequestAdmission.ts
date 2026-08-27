// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** The largest wait timeout accepted by Node.js timers. @beta */
export const MAX_DAEMON_REQUEST_WAIT_TIMEOUT_MS: number = 0x7fffffff;
const MINIMUM_WAIT_TIMEOUT_MS: number = 0;

/** A typed reason why a daemon request was not admitted. @beta */
export type DaemonRequestAdmissionErrorCode = 'aborted' | 'no-wait' | 'wait-timeout';

/** Resolved queue-and-wait behavior for one daemon request. @beta */
export interface IDaemonRequestAdmissionOptions {
  /** Fail immediately when the request cannot be admitted. */
  readonly noWait?: boolean;
  /** Maximum queue wait in milliseconds. Omission means no timeout. */
  readonly waitTimeoutMs?: number;
}

/** Reports a request's current one-based scheduler queue position. @beta */
export interface IDaemonRequestQueuePositionMessage {
  readonly kind: 'queuePosition';
  readonly payload: {
    readonly position: number;
    readonly requestId: string;
  };
}

/** Validates resolved admission values at a daemon request boundary. @beta */
export function validateDaemonRequestAdmissionOptions(
  options: IDaemonRequestAdmissionOptions | undefined
): void {
  if (options === undefined) {
    return;
  }
  validateAdmissionRecord(options);
  validateNoWait(options.noWait);
  validateWaitTimeout(options.waitTimeoutMs);
}

function validateAdmissionRecord(options: IDaemonRequestAdmissionOptions): void {
  if (typeof options !== 'object' || options === null) {
    throw new TypeError('Daemon request admission options must be an object.');
  }
}

function validateNoWait(value: unknown): void {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new TypeError('Daemon request admission noWait must be a boolean.');
  }
}

function validateWaitTimeout(value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!isBoundedInteger(value)) {
    throw new RangeError(
      `Daemon request admission waitTimeoutMs must be an integer between 0 and ${MAX_DAEMON_REQUEST_WAIT_TIMEOUT_MS}.`
    );
  }
}

function isBoundedInteger(value: unknown): value is number {
  return isInteger(value) && isWithinWaitTimeoutRange(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isWithinWaitTimeoutRange(value: number): boolean {
  return value >= MINIMUM_WAIT_TIMEOUT_MS && value <= MAX_DAEMON_REQUEST_WAIT_TIMEOUT_MS;
}
