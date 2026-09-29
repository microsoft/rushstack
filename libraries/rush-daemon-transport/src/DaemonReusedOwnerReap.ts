// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { reapDeadDaemonOperationGroupsAsync } from './DaemonOperationGroupReaper';
import type { IDaemonPaths } from './DaemonPaths';
import type { IDaemonOrphanReaperOptions } from './DaemonReapOptions';
import { runUnderReclaimMutexAsync } from './DaemonReclaimMutex';
import type { IDaemonReclaimOptions } from './DaemonReclaimOptions';

/**
 * Stops the operation process groups that the daemon which wrote the lockfile recorded, when a process that
 * started after the lockfile was written now has that daemon's PID, `ownerPid`, and deletes the records.
 *
 * @remarks
 * The caller proves the reuse, for example from `/proc` and the lockfile's `startedAt`. The daemon is then gone,
 * and the process that has its PID now is not a daemon that lost its lockfile either, because such a daemon
 * would have written a later one. Once the lockfile is removed, no reclaim finds these records, since a live
 * PID's record folder is left alone, so call this before removing it.
 * A record is signaled only with the proof that a dead daemon's records require: its leader is alive with the
 * recorded start time and leads its own group and session, or its leader has exited and every live member of
 * the group is in the group's own session. Group `ownerPid`, which the later process may lead, is never
 * signaled. Unproven records are dropped without a signal, and records survive a failed reap. Each set of
 * stopped groups is reported to `options.onOrphansReaped`, or else as a `RUSH_DAEMON_ORPHANS_REAPED` process
 * warning. Nothing is read, reaped or removed unless the runtime directory is a private directory of this
 * user, and a record folder that is a symbolic link, or that another user owns, is left alone.
 *
 * @throws {@link DaemonTransportError} with code `daemonAlreadyRunning` when another process holds the
 * reclaim lock, and with code `unsafeRuntimeDirectory` for an unsafe runtime directory; and an `Error` when a
 * group survives SIGKILL.
 *
 * @beta
 */
export async function reapReusedOwnerOperationGroupsAsync(
  paths: IDaemonPaths,
  ownerPid: number,
  options?: IDaemonReclaimOptions
): Promise<void> {
  const reaperOptions: IDaemonOrphanReaperOptions = { ...options, deadPidReused: true };
  await runUnderReclaimMutexAsync(paths, async () => {
    await reapDeadDaemonOperationGroupsAsync(paths.lockfilePath, ownerPid, reaperOptions);
  });
}
