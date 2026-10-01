// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { hasLiveGroupMember, mayHaveGroupMembers } from './DaemonGroupMemberScan';
import { isDaemonProcessAlive } from './DaemonLockfile';
import { ownGroupId } from './DaemonOwnGroup';
import { listLiveGroupMembers, listProcesses } from './DaemonProcessList';
import { hasEnvironmentEntry, readProcessStat } from './DaemonProcessStat';
import type { IProcessStat } from './DaemonProcessStat';

const NO_SIGNAL: number = 0;
const NO_SUCH_PROCESS: string = 'ESRCH';
const PROC_SELF_STAT: string = '/proc/self/stat';

/** Process probing/signaling used to reap a dead daemon's orphaned process groups; injectable for tests. */
export interface IDaemonProcessGroupOps {
  readonly isProcessAlive: (pid: number) => boolean;
  /** `true` while a member of the group has not exited; where `/proc` exists, a group of zombies is gone. */
  readonly groupExists: (groupId: number) => boolean;
  /** `false` only when the group has no process at all, not even a zombie; `true` when that is unknown. */
  readonly mayHaveMembers: (groupId: number) => boolean;
  readonly signalGroup: (groupId: number, signal: NodeJS.Signals) => void;
  /** The caller's own process group id, or `undefined` when the platform cannot report it. */
  readonly ownGroupId: () => number | undefined;
  /** Reads a process's `/proc` identity, or `undefined` when it is gone (or there is no `/proc`). */
  readonly readProcessStat: (pid: number) => IProcessStat | undefined;
  /** The processes in a group that have not exited. */
  readonly listLiveGroupMembers: (groupId: number) => IProcessStat[];
  /** Every process's `/proc` identity, zombies included; none where there is no `/proc`. */
  readonly listProcesses: () => IProcessStat[];
  readonly hasEnvironmentEntry: (pid: number, entry: string) => boolean;
  readonly delayAsync: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly log: (message: string) => void;
}

// Only ESRCH proves the group is gone; EPERM and other failures propagate so reclaim fails closed.
function rethrowUnlessNoSuchProcess(error: unknown): void {
  if ((error as NodeJS.ErrnoException | undefined)?.code !== NO_SUCH_PROCESS) throw error;
}

function hasAnyMember(groupId: number): boolean {
  try {
    process.kill(-groupId, NO_SIGNAL);
    return true;
  } catch (error) {
    rethrowUnlessNoSuchProcess(error);
    return false;
  }
}

// kill() also finds a group whose members have all exited but are not reaped (zombies). No signal ends
// them, and a parent that never reaps, such as a container's init, keeps them, so where `/proc` can tell,
// they don't count. Without `/proc`, any member counts.
function groupExists(groupId: number): boolean {
  return hasAnyMember(groupId) && (!fs.existsSync(PROC_SELF_STAT) || hasLiveGroupMember(groupId));
}

function signalGroup(groupId: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-groupId, signal);
  } catch (error) {
    rethrowUnlessNoSuchProcess(error);
  }
}

function log(message: string): void {
  process.emitWarning(message, { code: 'RUSH_DAEMON_ORPHANS_REAPED' });
}

/** The real POSIX implementation of {@link IDaemonProcessGroupOps}. */
export const POSIX_PROCESS_GROUP_OPS: IDaemonProcessGroupOps = {
  isProcessAlive: isDaemonProcessAlive,
  groupExists,
  mayHaveMembers: mayHaveGroupMembers,
  signalGroup,
  ownGroupId,
  readProcessStat,
  listLiveGroupMembers,
  listProcesses,
  hasEnvironmentEntry,
  delayAsync: async (ms: number) => {
    await delayAsync(ms);
  },
  now: Date.now,
  log
};
