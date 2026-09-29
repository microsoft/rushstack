// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonRestartReason } from './DaemonInstallationChange';
import type { IDaemonNativeLockHolder } from './DaemonNativeLockHolder';

/** The largest wait timeout accepted by Node.js timers. @beta */
export const MAX_DAEMON_REQUEST_WAIT_TIMEOUT_MS: number = 0x7fffffff;

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
    /**
     * Set with `restartReason` if any of the requests that `position` counts run a rushx script: how many. Set
     * without it while the request waits for that many running rushx scripts to exit before it runs, because it
     * restarts the daemon once it ends (a native `install` or `update`), which would end them; `position` then
     * counts the same scripts. Older daemons send a plain position instead.
     */
    readonly scriptCount?: number;
    /** Set with `restartReason` for a rushx script that waits for another request's restart, not its own. */
    readonly restartsForAnotherRequest?: boolean;
    /**
     * Set while the request waits for a Rush process that the daemon does not run to release the repository's
     * lock, rather than for other requests. `position` is then 1. Older daemons omit it; older clients ignore it.
     */
    readonly nativeLockHolder?: IDaemonNativeLockHolder;
  };
}
