// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonProcessGroupOps } from './DaemonProcessGroup';
import { POSIX_PROCESS_GROUP_OPS } from './DaemonProcessGroup';
import type { IDaemonOrphanReap, IDaemonReclaimOptions } from './DaemonReclaimOptions';

const WINDOWS_PLATFORM: NodeJS.Platform = 'win32';
// 0 and 1 are never daemons, and kill(-0)/kill(-1) would signal our own group or every process.
const FIRST_USER_PID: number = 2;
const DEFAULT_GRACE_MS: number = 2000;

/** Options for reaping a dead daemon's orphans; every field defaults to the real process. */
export interface IDaemonOrphanReaperOptions extends IDaemonReclaimOptions {
  readonly ops?: IDaemonProcessGroupOps;
  readonly platform?: NodeJS.Platform;
  readonly selfPid?: number;
  /** How long SIGTERM'd (and then SIGKILL'd) processes get to exit. */
  readonly graceMs?: number;
  /** The caller's user id (`process.getuid()`); only records that this user owns are acted on. */
  readonly uid?: number;
  /**
   * `true` when a process that started after the dead daemon's lockfile was written now has the daemon's pid:
   * the daemon is gone although its pid is alive, and that process may lead group `deadPid`.
   */
  readonly deadPidReused?: boolean;
}

/** {@link IDaemonOrphanReaperOptions} with every default applied, for the dead daemon `deadPid`. */
export interface IReapContext extends IDaemonReclaimOptions {
  readonly ops: IDaemonProcessGroupOps;
  readonly platform: NodeJS.Platform;
  readonly selfPid: number;
  readonly deadPid: number;
  readonly graceMs: number;
  readonly uid: number | undefined;
  readonly deadPidReused: boolean;
}

function resolveCaller(options: IDaemonOrphanReaperOptions): Pick<IReapContext, 'platform' | 'selfPid'> {
  return { platform: options.platform ?? process.platform, selfPid: options.selfPid ?? process.pid };
}

function resolveReapPolicy(
  options: IDaemonOrphanReaperOptions
): Pick<IReapContext, 'graceMs' | 'deadPidReused'> {
  return { graceMs: options.graceMs ?? DEFAULT_GRACE_MS, deadPidReused: options.deadPidReused ?? false };
}

/** The user whose records may be acted on. */
export function resolveCallerUid(options: IDaemonOrphanReaperOptions): number | undefined {
  return options.uid ?? process.getuid?.();
}

/** Applies the defaults of {@link IDaemonOrphanReaperOptions}. */
export function createReapContext(deadPid: number, options: IDaemonOrphanReaperOptions): IReapContext {
  return {
    ...resolveCaller(options),
    ...resolveReapPolicy(options),
    ops: options.ops ?? POSIX_PROCESS_GROUP_OPS,
    deadPid,
    uid: resolveCallerUid(options),
    onOrphansReaped: options.onOrphansReaped,
    onOperationGroupLeftRunning: options.onOperationGroupLeftRunning
  };
}

/** Reports the process groups that a reap stopped to `onOrphansReaped`, or else logs `message`. */
export function reportOrphansReaped(context: IReapContext, reap: IDaemonOrphanReap, message: string): void {
  if (context.onOrphansReaped) context.onOrphansReaped(reap);
  else context.ops.log(message);
}

function isNeitherSelfNorOwnGroup(groupId: number, context: IReapContext): boolean {
  // Fail closed: an unknown own group might be `groupId` (e.g. rush-client run by an operation).
  const ownGroupId: number | undefined = context.ops.ownGroupId();
  return groupId !== context.selfPid && ownGroupId !== undefined && groupId !== ownGroupId;
}

type GroupCheck = (groupId: number, context: IReapContext) => boolean;

const SIGNALABLE_GROUP_CHECKS: readonly GroupCheck[] = [
  (groupId: number, context: IReapContext) => context.platform !== WINDOWS_PLATFORM,
  (groupId: number) => Number.isSafeInteger(groupId) && groupId >= FIRST_USER_PID,
  isNeitherSelfNorOwnGroup,
  // A live daemon still owns its operations. The later process that has a gone daemon's pid may lead group
  // `deadPid`, which is then never signaled.
  (groupId: number, context: IReapContext) =>
    context.deadPidReused ? groupId !== context.deadPid : !context.ops.isProcessAlive(context.deadPid)
];

/**
 * `true` when group `groupId` may be signaled at all: POSIX, a user pid, not ours, and its daemon is dead (or
 * its pid was reused, and the group is not the one of that pid).
 */
export function isSignalableGroup(groupId: number, context: IReapContext): boolean {
  return SIGNALABLE_GROUP_CHECKS.every((check: GroupCheck) => check(groupId, context));
}
