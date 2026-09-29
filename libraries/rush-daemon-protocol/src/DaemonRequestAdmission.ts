// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonRestartReason } from './DaemonInstallationChange';

/** The largest wait timeout accepted by Node.js timers. @beta */
export const MAX_DAEMON_REQUEST_WAIT_TIMEOUT_MS: number = 0x7fffffff;
const MINIMUM_WAIT_TIMEOUT_MS: number = 0;

/** A typed reason why a daemon request was not admitted. @beta */
export type DaemonRequestAdmissionErrorCode = 'aborted' | 'no-wait' | 'wait-timeout';

/** Resolved queue-and-wait behavior for one daemon request. @beta */
export interface IDaemonRequestAdmissionOptions {
  /** Fail immediately when the request cannot be admitted. */
  readonly noWait?: boolean;
  /**
   * True when `waitTimeoutMs` is a client default rather than an explicit user choice. A default timeout applies
   * to each daemon's workspace admission only: not to waiting behind running compatible shared builds, nor, when
   * the daemon restarts for the request's environment or because its installation changed, to waiting for the
   * requests that it was already serving while it serves no rushx script.
   */
  readonly waitTimeoutIsDefault?: boolean;
  /** Maximum queue wait in milliseconds. Omission means no timeout. */
  readonly waitTimeoutMs?: number;
}

/** Reports a request's current one-based scheduler queue position. @beta */
export interface IDaemonRequestQueuePositionMessage {
  readonly kind: 'queuePosition';
  readonly payload: {
    readonly position: number;
    readonly requestId: string;
    /**
     * Set while the request waits for the requests that `position` counts to finish, since the daemon then
     * restarts for this reason, and the request runs after the restart. Older daemons omit it; clients ignore
     * unknown kinds.
     */
    readonly restartReason?: DaemonRestartReason;
    /** Set with `restartReason` if any of the requests that `position` counts run a rushx script: how many. */
    readonly scriptCount?: number;
    /** Set with `restartReason` for a rushx script that waits for another request's restart, not its own. */
    readonly restartsForAnotherRequest?: boolean;
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
  validateBoolean(options.noWait, 'noWait');
  validateBoolean(options.waitTimeoutIsDefault, 'waitTimeoutIsDefault');
  validateWaitTimeout(options.waitTimeoutMs);
}

function validateAdmissionRecord(options: IDaemonRequestAdmissionOptions): void {
  if (typeof options !== 'object' || options === null) {
    throw new TypeError('Daemon request admission options must be an object.');
  }
}

function validateBoolean(value: unknown, name: string): void {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new TypeError(`Daemon request admission ${name} must be a boolean.`);
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
