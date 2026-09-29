// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Process groups that a reclaim stopped, because the daemon that left them running had exited.
 *
 * @beta
 */
export interface IDaemonOrphanReap {
  /** The PID of the daemon that exited. */
  readonly daemonPid: number;
  /** The process groups that were stopped: the daemon's own group, or the operation groups it recorded. */
  readonly processGroupIds: readonly number[];
  /** `terminated` when every group exited after SIGTERM, and `killed` when some needed SIGKILL. */
  readonly outcome: 'terminated' | 'killed';
}

/**
 * Options for {@link reclaimStaleDaemonAsync}.
 *
 * @beta
 */
export interface IDaemonReclaimOptions {
  /**
   * Called once for each set of process groups that the reclaim stopped, so that the caller can say so in
   * its own words. When it is omitted, each set is reported as a `RUSH_DAEMON_ORPHANS_REAPED` process warning.
   */
  readonly onOrphansReaped?: (reap: IDaemonOrphanReap) => void;
}
