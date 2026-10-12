// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonRequestAdmissionOptions } from '@rushstack/rush-daemon-protocol';

import { loadEnvironmentConfiguration } from './lazyRushModules';

/**
 * How long Rush, when the client runs it in-process after it tried the daemon, waits for another Rush process to
 * release the repository's lock, instead of failing at once as it does when it runs without the client.
 */
export interface IInProcessLockWait {
  /**
   * When the request's wait began, in milliseconds since the Unix epoch: when the client sent the request to the
   * daemon, or, if the client could not reach a daemon, when it gave up on the daemon.
   */
  readonly startedAtMs: number;
  /** The request's admission options, whose wait timeout also ends the wait for the lock. */
  readonly admission: IDaemonRequestAdmissionOptions | undefined;
  /** The process ID of the daemon that handed the command back, so that Rush can name it if it holds the lock. */
  readonly daemonPid: number | undefined;
}

/**
 * Returns the time until which Rush waits for the repository's lock: the request's wait timeout after its wait began,
 * so that the time that the request already waited on the daemon counts. With `--no-wait` or a zero timeout, Rush
 * tries once, as it does without the client, and names the process that holds the lock.
 */
export function getInProcessLockWaitDeadlineMs(wait: IInProcessLockWait): number {
  const { admission, startedAtMs } = wait;
  // The client always sends a timeout unless it sends noWait.
  const waitTimeoutMs: number = admission?.noWait ? 0 : (admission?.waitTimeoutMs ?? 0);
  return Math.floor(startedAtMs + waitTimeoutMs);
}

/**
 * Asks the Rush that the client runs in-process to wait for the repository's lock. Rush reads and removes these
 * variables when it starts, so its operations do not inherit them. Only the Rush release that the client bundles
 * reads them.
 */
export function setInProcessLockWait(environment: NodeJS.ProcessEnv, wait: IInProcessLockWait): void {
  const { EnvironmentVariableNames } = loadEnvironmentConfiguration();
  environment[EnvironmentVariableNames._RUSH_LOCK_WAIT_DEADLINE] = `${getInProcessLockWaitDeadlineMs(wait)}`;
  if (wait.daemonPid === undefined) {
    delete environment[EnvironmentVariableNames._RUSH_LOCK_WAIT_DAEMON_PID];
  } else {
    environment[EnvironmentVariableNames._RUSH_LOCK_WAIT_DAEMON_PID] = `${wait.daemonPid}`;
  }
}
