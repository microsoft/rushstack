// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import { performance } from 'node:perf_hooks';

// USER_HZ is fixed at 100 on mainstream Linux ABIs; it is verified against this process before use.
const USER_HZ: number = 100;
const PROC_STAT_STATE_FIELD: number = 3;
const PROC_STAT_PARENT_PID_FIELD: number = 4;
const PROC_STAT_START_TIME_FIELD: number = 22;
const MAX_CALIBRATION_ERROR_MS: number = 1000;
/** A process that began this long after a record was written cannot be the record's writer. */
const MIN_REUSE_MARGIN_MS: number = 2000;

/**
 * Returns the wall-clock start time of `pid`, or `undefined` when it cannot be determined reliably.
 * Only Linux `/proc` is supported; other platforms always return `undefined` (unknown).
 */
export function tryGetProcessStartTimeMs(pid: number): number | undefined {
  if (process.platform !== 'linux') return undefined;
  const uptimeSeconds: number | undefined = readUptimeSeconds();
  const selfStartSeconds: number | undefined = readStartSeconds('self');
  if (uptimeSeconds === undefined || selfStartSeconds === undefined) return undefined;
  const now: number = Date.now();
  const selfStartMs: number = now - (uptimeSeconds - selfStartSeconds) * 1000;
  // Guards against an unexpected USER_HZ, a non-standard /proc, or a wall-clock jump since this process began.
  if (Math.abs(selfStartMs - performance.timeOrigin) > MAX_CALIBRATION_ERROR_MS) return undefined;
  const startSeconds: number | undefined = readStartSeconds(pid);
  return startSeconds === undefined ? undefined : now - (uptimeSeconds - startSeconds) * 1000;
}

/**
 * True only when `pid` provably started after `recordedAt`, so it cannot be the process that wrote a record
 * at that time (the PID was reused). Unknown start times return false.
 */
export function isProcessStartedAfter(pid: number, recordedAt: string): boolean {
  const recordedMs: number = Date.parse(recordedAt);
  if (!Number.isFinite(recordedMs)) return false;
  const startMs: number | undefined = tryGetProcessStartTimeMs(pid);
  return startMs !== undefined && startMs > recordedMs + MIN_REUSE_MARGIN_MS;
}

function readUptimeSeconds(): number | undefined {
  try {
    const uptime: number = Number.parseFloat(fs.readFileSync('/proc/uptime', 'utf8').split(' ')[0]);
    return Number.isFinite(uptime) ? uptime : undefined;
  } catch {
    return undefined;
  }
}

/**
 * True only on Linux when `pid` has exited but its parent has not reaped it yet. Such a zombie still accepts
 * signal 0, but it can no longer run or hold connections.
 */
export function isProcessDefunct(pid: number): boolean {
  if (process.platform !== 'linux') return false;
  const state: string | undefined = readStatFields(pid)?.[PROC_STAT_STATE_FIELD - 3];
  return state === 'Z' || state === 'X';
}

/** The scheduling state of a process, as Linux `/proc/<pid>/stat` shows it. */
export interface IProcessState {
  /** One letter, for example `R` (running), `S` (sleeping), `D` (waiting in the kernel) or `T` (stopped). */
  readonly code: string;
  readonly parentPid: number | undefined;
  /** When it started, in clock ticks after boot, which tells it from a later process with the same PID. */
  readonly startTicks?: number;
}

/** Returns the state of `pid` on Linux, or `undefined` when it cannot be read. */
export function tryGetProcessState(pid: number): IProcessState | undefined {
  if (process.platform !== 'linux') return undefined;
  const fields: string[] | undefined = readStatFields(pid);
  const code: string | undefined = fields?.[PROC_STAT_STATE_FIELD - 3];
  if (!fields || !code) return undefined;
  const parentPid: number = Number(fields[PROC_STAT_PARENT_PID_FIELD - 3]);
  const startTicks: number = Number(fields[PROC_STAT_START_TIME_FIELD - 3]);
  return {
    code,
    parentPid: Number.isSafeInteger(parentPid) && parentPid > 0 ? parentPid : undefined,
    startTicks: Number.isSafeInteger(startTicks) && startTicks >= 0 ? startTicks : undefined
  };
}

function readStartSeconds(pid: number | 'self'): number | undefined {
  const fields: string[] | undefined = readStatFields(pid);
  if (!fields) return undefined;
  const jiffies: number = Number(fields[PROC_STAT_START_TIME_FIELD - 3]);
  return Number.isSafeInteger(jiffies) && jiffies >= 0 ? jiffies / USER_HZ : undefined;
}

/** The fields of `/proc/<pid>/stat` from field 3 (the process state) on. */
function readStatFields(pid: number | 'self'): string[] | undefined {
  let stat: string;
  try {
    stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  } catch {
    return undefined;
  }
  // The command name (field 2) may contain spaces and parentheses; fields after it never do.
  const commandEnd: number = stat.lastIndexOf(')');
  if (commandEnd < 0) return undefined;
  return stat
    .slice(commandEnd + 1)
    .trim()
    .split(' ');
}
