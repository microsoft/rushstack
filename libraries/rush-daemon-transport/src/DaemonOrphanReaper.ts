// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { terminateProcessGroupsAsync } from './DaemonGroupTermination';
import type { DaemonOrphanReapOutcome } from './DaemonGroupTermination';
import type { IDaemonLockfile } from './DaemonLockfile';
import { reapDeadDaemonOperationGroupsAsync } from './DaemonOperationGroupReaper';
import { createReapContext, isSignalableGroup } from './DaemonReapOptions';
import type { IDaemonOrphanReaperOptions, IReapContext } from './DaemonReapOptions';

function isOrphanedDaemonGroup(context: IReapContext): boolean {
  return isSignalableGroup(context.deadPid, context) && context.ops.groupExists(context.deadPid);
}

/**
 * Terminates processes left behind in a dead daemon's own process group (SIGKILL, OOM).
 *
 * @remarks
 * The daemon is spawned detached, so its pid is its process group id, and children it spawns without
 * `detached` inherit that group. Detached operation children lead groups of their own; see
 * {@link reapDeadDaemonOperationGroupsAsync}. Sends SIGTERM, then SIGKILL after `graceMs`, and throws if the
 * group still has not exited after a further `graceMs`.
 * PID-reuse guard: only group `deadPid` is signaled, and only once `deadPid` is proven dead while the group
 * still exists; POSIX never reuses a pid still in use as a process group id, so every remaining member
 * belongs to the dead daemon. Never signals the caller's pid or group, and does nothing when the caller's
 * group is unknown (no `/proc`). Call only under the reclaim mutex.
 */
export async function reapDeadDaemonProcessGroupAsync(
  deadPid: number,
  options: IDaemonOrphanReaperOptions = {}
): Promise<DaemonOrphanReapOutcome> {
  const context: IReapContext = createReapContext(deadPid, options);
  if (!isOrphanedDaemonGroup(context)) return 'none';
  const outcome: DaemonOrphanReapOutcome = await terminateProcessGroupsAsync(context, [deadPid]);
  context.ops.log(`Reclaimed dead daemon ${deadPid}: its orphaned operation process group was ${outcome}.`);
  return outcome;
}

/** Reaps the orphaned processes of a reclaimed daemon's recorded owner, if there is one. */
export async function reapOrphansOfDeadOwnerAsync(
  lockfilePath: string,
  owner: IDaemonLockfile | undefined,
  options: IDaemonOrphanReaperOptions = {}
): Promise<void> {
  if (!owner) return;
  await reapDeadDaemonProcessGroupAsync(owner.pid, options);
  await reapDeadDaemonOperationGroupsAsync(lockfilePath, owner.pid, options);
}
