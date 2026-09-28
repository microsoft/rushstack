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
  /** How long SIGTERM'd (and then SIGKILL'd) processes get to exit. */
  readonly graceMs?: number;
}

interface IReapContext {
  readonly ops: IDaemonProcessGroupOps;
  readonly deadPid: number;
  readonly graceMs: number;
}
type OrphanCheck = (pid: number) => boolean;

function isNeitherSelfNorOwnGroup(pid: number, selfPid: number, ops: IDaemonProcessGroupOps): boolean {
  // Fail closed: an unknown own group might be `pid` (e.g. rush-client run by an operation).
  const ownGroupId: number | undefined = ops.ownGroupId();
  return pid !== selfPid && ownGroupId !== undefined && pid !== ownGroupId;
}

function orphanChecks(options: IDaemonOrphanReaperOptions, ops: IDaemonProcessGroupOps): OrphanCheck[] {
  return [
    () => (options.platform ?? process.platform) !== WINDOWS_PLATFORM,
    (pid: number) => Number.isSafeInteger(pid) && pid >= FIRST_USER_PID,
    (pid: number) => isNeitherSelfNorOwnGroup(pid, options.selfPid ?? process.pid, ops),
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
  if (await waitForGroupExitAsync(context)) return 'killed';
  throw new Error(`Processes of dead daemon ${context.deadPid} survived SIGKILL; not reclaiming its socket.`);
}

/**
 * Terminates operation processes left behind by a daemon that died without joining them (SIGKILL, OOM).
 *
 * @remarks
 * The daemon is spawned detached, so its pid is its process group id, and phased operation children inherit
 * that group (children spawned with their own detached group are out of scope). Sends SIGTERM, then SIGKILL
 * after `graceMs`, and throws if the group still has not exited after a further `graceMs`.
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
