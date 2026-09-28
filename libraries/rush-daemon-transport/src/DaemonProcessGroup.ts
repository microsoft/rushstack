// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { isDaemonProcessAlive } from './DaemonLockfile';
import { listLiveGroupMembers, readProcessStat } from './DaemonProcessStat';
import type { IProcessStat } from './DaemonProcessStat';

const NO_SIGNAL: number = 0;
const NO_SUCH_PROCESS: string = 'ESRCH';
const PROC_SELF_STAT: string = '/proc/self/stat';
const UTF8: BufferEncoding = 'utf8';
const COMM_END: string = ')';
const FIELD_SEPARATOR: string = ' ';
// After the ")" that ends the command name come: " <state> <ppid> <pgrp> ...".
const PGRP_FIELD_INDEX: number = 3;

/** Process probing/signaling used to reap a dead daemon's orphaned process groups; injectable for tests. */
export interface IDaemonProcessGroupOps {
  readonly isProcessAlive: (pid: number) => boolean;
  readonly groupExists: (groupId: number) => boolean;
  readonly signalGroup: (groupId: number, signal: NodeJS.Signals) => void;
  /** The caller's own process group id, or `undefined` when the platform cannot report it. */
  readonly ownGroupId: () => number | undefined;
  /** Reads a process's `/proc` identity, or `undefined` when it is gone (or there is no `/proc`). */
  readonly readProcessStat: (pid: number) => IProcessStat | undefined;
  /** The processes in a group that have not exited. */
  readonly listLiveGroupMembers: (groupId: number) => IProcessStat[];
  readonly delayAsync: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly log: (message: string) => void;
}

// Only ESRCH proves the group is gone; EPERM and other failures propagate so reclaim fails closed.
function rethrowUnlessNoSuchProcess(error: unknown): void {
  if ((error as NodeJS.ErrnoException | undefined)?.code !== NO_SUCH_PROCESS) throw error;
}

function groupExists(groupId: number): boolean {
  try {
    process.kill(-groupId, NO_SIGNAL);
    return true;
  } catch (error) {
    rethrowUnlessNoSuchProcess(error);
    return false;
  }
}

function signalGroup(groupId: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-groupId, signal);
  } catch (error) {
    rethrowUnlessNoSuchProcess(error);
  }
}

function ownGroupId(): number | undefined {
  try {
    const stat: string = fs.readFileSync(PROC_SELF_STAT, UTF8);
    const fields: string[] = stat.slice(stat.lastIndexOf(COMM_END)).split(FIELD_SEPARATOR);
    return Number(fields[PGRP_FIELD_INDEX]);
  } catch {
    return undefined;
  }
}

function log(message: string): void {
  process.emitWarning(message, { code: 'RUSH_DAEMON_ORPHANS_REAPED' });
}

/** The real POSIX implementation of {@link IDaemonProcessGroupOps}. */
export const POSIX_PROCESS_GROUP_OPS: IDaemonProcessGroupOps = {
  isProcessAlive: isDaemonProcessAlive,
  groupExists,
  signalGroup,
  ownGroupId,
  readProcessStat,
  listLiveGroupMembers,
  delayAsync: async (ms: number) => {
    await delayAsync(ms);
  },
  now: Date.now,
  log
};
