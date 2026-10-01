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
 * The first condition that a recorded operation process group failed, so that a reclaim left it running.
 *
 * @remarks
 * - `callerGroup`: the group's ID is the PID or the process group ID of the process that reclaims (a
 *   `rush-client` that the operation ran, for example), or that process cannot read its own process group.
 *
 * - `daemonPidInUse`: another process has the exited daemon's PID now. When the reclaim was told so
 *   (`deadPidReused`), only the group whose ID is that PID is left running for this reason.
 *
 * - `leaderChanged`: the process whose PID is the group's ID is not the leader that the daemon recorded: it
 *   started at another time, or it has left the group or the group's session.
 *
 * - `otherSession`: the group's leader has exited, and a live process of the group is in another session.
 *
 * - `noMarker`: the group's leader has exited, and no live process of the group has the exited daemon's
 *   `RUSHD_OPERATION_GROUPS` value, which a daemon from a release before that variable does not set.
 *
 * @beta
 */
export type DaemonOperationGroupLeftRunningReason =
  | 'callerGroup'
  | 'daemonPidInUse'
  | 'leaderChanged'
  | 'otherSession'
  | 'noMarker';

/**
 * A process group that an exited daemon recorded for an operation, and whose record a reclaim removed without
 * a signal, because it could not prove that the group still runs that operation.
 *
 * @beta
 */
export interface IDaemonOperationGroupLeftRunning {
  /** The PID of the daemon that recorded the group and exited. */
  readonly daemonPid: number;
  /** The process group, which still had a live process when the reclaim left it. */
  readonly processGroupId: number;
  /** The first condition that the group failed. */
  readonly reason: DaemonOperationGroupLeftRunningReason;
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
  /**
   * Called once for each recorded operation process group that the reclaim left running when it removed the
   * group's record, because it could not prove that the group still runs an operation of the exited daemon.
   * A group without a live process is not reported. When it is omitted, nothing is reported.
   */
  readonly onOperationGroupLeftRunning?: (group: IDaemonOperationGroupLeftRunning) => void;
}
