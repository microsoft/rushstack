// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import { setTimeout as delayAsync } from 'node:timers/promises';

const PROC_ROOT: string = '/proc';
const PID_ENTRY_REGEXP: RegExp = /^\d+$/;
// Indices into the fields that follow "(comm) " in /proc/<pid>/stat.
const PROC_STAT_STATE_INDEX: number = 0;
const PROC_STAT_SESSION_INDEX: number = 3;
const PROC_STAT_READ_CONCURRENCY: number = 32;
// Sentinel (never a real one-letter state) for a procfs entry that exists but cannot be read.
const UNREADABLE_STATE: string = '<unreadable>';
const DEFAULT_EXIT_TIMEOUT_MS: number = 5_000;
const EXIT_POLL_INTERVAL_MS: number = 10;
const MAX_TIMEOUT_MS: number = 0x7fffffff;

/** Reads Linux procfs. Injectable so tests can simulate process tables or a missing procfs. */
export interface ILinuxProcfsReader {
  /** Lists the entries of the procfs root; rejects when procfs is unavailable. */
  readonly listEntriesAsync: () => Promise<string[]>;
  /** Reads `/proc/<pid>/stat`; rejects when the process has exited. */
  readonly readStatAsync: (pid: string) => Promise<string>;
}

export const NODE_PROCFS_READER: ILinuxProcfsReader = {
  listEntriesAsync: () => fs.promises.readdir(PROC_ROOT),
  readStatAsync: (pid: string) => fs.promises.readFile(`${PROC_ROOT}/${pid}/stat`, 'utf8')
};

/**
 * Waits for a captured detached Linux group/session to disappear or contain only zombies.
 * Member states come from procfs; `ps --sid` is used only when procfs is unavailable.
 */
export async function waitForLinuxProcessGroupExitAsync(
  groupId: number,
  timeoutMs: number = DEFAULT_EXIT_TIMEOUT_MS,
  procfs: ILinuxProcfsReader = NODE_PROCFS_READER
): Promise<void> {
  if (!Number.isSafeInteger(groupId) || groupId <= 0 || groupId === process.pid) {
    throw new RangeError('Expected an owned child process group ID.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new RangeError('Expected a positive bounded process group exit timeout.');
  }
  const deadline: number = Date.now() + timeoutMs;
  while (processGroupExists(groupId)) {
    const remaining: number = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`Owned Linux process group ${groupId} did not exit within ${timeoutMs}ms.`);
    }
    const states: string[] = await readSessionStatesAsync(groupId, remaining, procfs);
    if (states.length > 0 && states.every((state) => state.startsWith('Z'))) return;
    await delayAsync(Math.min(EXIT_POLL_INTERVAL_MS, remaining));
  }
}

function processGroupExists(groupId: number): boolean {
  try {
    // Probe only. Never signal a potentially reused group while waiting for cleanup.
    process.kill(-groupId, 0);
    return true;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH') {
      return false;
    }
    throw error;
  }
}

async function readSessionStatesAsync(
  groupId: number,
  timeoutMs: number,
  procfs: ILinuxProcfsReader
): Promise<string[]> {
  const states: string[] | undefined = await tryReadSessionStatesFromProcAsync(groupId, procfs);
  return states ?? (await readSessionStatesFromPsAsync(groupId, timeoutMs));
}

/**
 * Reads member states from procfs, which every Linux system has; `ps` is missing from slim/distroless images
 * and busybox `ps` does not support `--sid`. Returns `undefined` when procfs is unavailable or an entry cannot
 * be read, so the caller falls back to `ps`.
 */
async function tryReadSessionStatesFromProcAsync(
  groupId: number,
  procfs: ILinuxProcfsReader
): Promise<string[] | undefined> {
  let entries: string[];
  try {
    entries = await procfs.listEntriesAsync();
  } catch {
    return undefined;
  }
  const pids: string[] = entries.filter((entry: string) => PID_ENTRY_REGEXP.test(entry));
  const states: string[] = [];
  // Bound concurrent reads so a large process table cannot flood the shared libuv thread pool.
  for (let start: number = 0; start < pids.length; start += PROC_STAT_READ_CONCURRENCY) {
    const batch: (string | undefined)[] = await Promise.all(
      pids
        .slice(start, start + PROC_STAT_READ_CONCURRENCY)
        .map((pid: string) => readSessionMemberStateAsync(pid, groupId, procfs))
    );
    for (const state of batch) {
      if (state === undefined) continue;
      // An unreadable entry could hide a live member, so procfs cannot prove the group exited.
      if (state === UNREADABLE_STATE) return undefined;
      // One live member already means "not exited"; only a zombies-only result needs a full scan.
      if (!state.startsWith('Z')) return [state];
      states.push(state);
    }
  }
  return states;
}

/**
 * Returns the member's state, `undefined` for a vanished PID or another session, or `UNREADABLE_STATE`
 * when the entry cannot be read (for example `hidepid` or `EIO`) and so might hide a live member.
 */
async function readSessionMemberStateAsync(
  pid: string,
  groupId: number,
  procfs: ILinuxProcfsReader
): Promise<string | undefined> {
  let stat: string;
  try {
    stat = await procfs.readStatAsync(pid);
  } catch (error) {
    return isProcessGoneError(error) ? undefined : UNREADABLE_STATE;
  }
  // Format: "pid (comm) state ppid pgrp session ..."; comm may contain spaces and parentheses.
  const fields: string[] = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  return Number(fields[PROC_STAT_SESSION_INDEX]) === groupId ? fields[PROC_STAT_STATE_INDEX] : undefined;
}

function isProcessGoneError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ESRCH')
  );
}

function readSessionStatesFromPsAsync(groupId: number, timeoutMs: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    // detached=true creates a new process group and session with the child's PID.
    execFile(
      'ps',
      ['--sid', String(groupId), '-o', 'stat='],
      {
        encoding: 'utf8',
        timeout: timeoutMs
      },
      (error, stdout, stderr) => {
        if (error && !(error.code === 1 && !stdout.trim() && !stderr.trim())) {
          reject(error);
        } else if (stderr.trim()) {
          reject(new Error(`Cannot inspect owned Linux process group ${groupId}: ${stderr.trim()}`));
        } else {
          resolve(stdout.trim() ? stdout.trim().split(/\s+/) : []);
        }
      }
    );
  });
}
