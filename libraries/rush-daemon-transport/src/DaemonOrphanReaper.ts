// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonLockfile } from './DaemonLockfile';
import type { IDaemonProcessGroupOps } from './DaemonProcessGroup';
import { POSIX_PROCESS_GROUP_OPS } from './DaemonProcessGroup';

const WINDOWS_PLATFORM: NodeJS.Platform = 'win32';
// 0 and 1 are never daemons, and kill(-0)/kill(-1) would signal our own group or every process.
const FIRST_USER_PID: number = 2;
const POLL_INTERVAL_MS: number = 20;
const DEFAULT_GRACE_MS: number = 2000;

/** Outcome of reaping a dead daemon's process group. */
export type DaemonOrphanReapOutcome = 'none' | 'terminated' | 'killed';

/** Options for {@link reapDeadDaemonProcessGroupAsync}; every field defaults to the real process. */
export interface IDaemonOrphanReaperOptions {
  readonly ops?: IDaemonProcessGroupOps;
  readonly platform?: NodeJS.Platform;
  readonly selfPid?: number;
  /** How long SIGTERM'd processes get to exit before SIGKILL. */
  readonly graceMs?: number;
}

interface IReapContext {
  readonly ops: IDaemonProcessGroupOps;
  readonly deadPid: number;
  readonly graceMs: number;
}

type OrphanCheck = (pid: number) => boolean;

function orphanChecks(options: IDaemonOrphanReaperOptions, ops: IDaemonProcessGroupOps): OrphanCheck[] {
  return [
    () => (options.platform ?? process.platform) !== WINDOWS_PLATFORM,
    (pid: number) => Number.isSafeInteger(pid) && pid >= FIRST_USER_PID,
    (pid: number) => pid !== (options.selfPid ?? process.pid) && pid !== ops.ownGroupId(),
    (pid: number) => !ops.isProcessAlive(pid),
    (pid: number) => ops.groupExists(pid)
  ];
}

async function waitForGroupExitAsync(context: IReapContext): Promise<boolean> {
  const deadline: number = context.ops.now() + context.graceMs;
  while (context.ops.now() < deadline) {
    if (!context.ops.groupExists(context.deadPid)) return true;
    await context.ops.delayAsync(POLL_INTERVAL_MS);
  }
  return !context.ops.groupExists(context.deadPid);
}

async function terminateGroupAsync(context: IReapContext): Promise<DaemonOrphanReapOutcome> {
  context.ops.signalGroup(context.deadPid, 'SIGTERM');
  if (await waitForGroupExitAsync(context)) return 'terminated';
  context.ops.signalGroup(context.deadPid, 'SIGKILL');
  return 'killed';
}

/**
 * Terminates operation processes left behind by a daemon that died without joining them (SIGKILL, OOM).
 *
 * @remarks
 * The daemon is spawned detached (`setsid`), so its pid is also its session and process group id, and its
 * operation children inherit that group. Sends SIGTERM to the group, then SIGKILL after `graceMs`.
 *
 * PID-reuse guard: only group id `deadPid` is ever signaled, and only once `deadPid` is proven dead while
 * that group still exists. POSIX never hands out a pid that is still in use as a process group id, so no
 * unrelated process can have taken `deadPid` and every remaining member belongs to the dead daemon. The
 * caller's own pid and group are never signaled. Call only under the reclaim mutex.
 */
export async function reapDeadDaemonProcessGroupAsync(
  deadPid: number,
  options: IDaemonOrphanReaperOptions = {}
): Promise<DaemonOrphanReapOutcome> {
  const context: IReapContext = createReapContext(deadPid, options);
  if (!orphanChecks(options, context.ops).every((check: OrphanCheck) => check(deadPid))) return 'none';
  const outcome: DaemonOrphanReapOutcome = await terminateGroupAsync(context);
  context.ops.log(`Reclaimed dead daemon ${deadPid}: its orphaned operation process group was ${outcome}.`);
  return outcome;
}

function createReapContext(deadPid: number, options: IDaemonOrphanReaperOptions): IReapContext {
  return {
    ops: options.ops ?? POSIX_PROCESS_GROUP_OPS,
    deadPid,
    graceMs: options.graceMs ?? DEFAULT_GRACE_MS
  };
}

/** Reaps the orphaned operations of a reclaimed daemon's recorded owner, if there is one. */
export async function reapOrphansOfDeadOwnerAsync(owner: IDaemonLockfile | undefined): Promise<void> {
  if (owner) await reapDeadDaemonProcessGroupAsync(owner.pid);
}
