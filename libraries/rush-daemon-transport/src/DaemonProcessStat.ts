// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

const PROC_ROOT: string = '/proc';
const STAT_FILE_NAME: string = 'stat';
const UTF8: BufferEncoding = 'utf8';
const COMM_END: string = ')';
const FIELD_SEPARATOR: string = ' ';
const PID_PATTERN: RegExp = /^\d+$/;
// Indices into the fields after the ")" that ends the command name (proc_pid_stat(5)):
// ") <state> <ppid> <pgrp> <session> ...", where starttime is field 22 of the whole record.
const STATE_INDEX: number = 1;
const GROUP_INDEX: number = 3;
const SESSION_INDEX: number = 4;
const START_TIME_INDEX: number = 20;
const EXITED_STATES: ReadonlySet<string> = new Set(['Z', 'X']);

/** The identity fields of one Linux `/proc/<pid>/stat` record. */
export interface IProcessStat {
  readonly pid: number;
  readonly groupId: number;
  readonly sessionId: number;
  /** Clock ticks after boot when the process started; a reused pid gets a different value. */
  readonly startTime: string;
  /** `true` for a zombie: it has exited but its parent has not reaped it yet. */
  readonly exited: boolean;
}

function parseProcessStat(pid: number, stat: string): IProcessStat {
  // The command name may contain spaces and ")", so parse after its last ")".
  const fields: string[] = stat.slice(stat.lastIndexOf(COMM_END)).split(FIELD_SEPARATOR);
  return {
    pid,
    groupId: Number(fields[GROUP_INDEX]),
    sessionId: Number(fields[SESSION_INDEX]),
    startTime: fields[START_TIME_INDEX],
    exited: EXITED_STATES.has(fields[STATE_INDEX])
  };
}

/** Reads `/proc/<pid>/stat`; throws when the record cannot be read. */
export function readStatRecord(pid: number): IProcessStat {
  return parseProcessStat(pid, fs.readFileSync(`${PROC_ROOT}/${pid}/${STAT_FILE_NAME}`, UTF8));
}

/** Reads `/proc/<pid>/stat`; `undefined` when the process is gone or the platform has no `/proc`. */
export function readProcessStat(pid: number): IProcessStat | undefined {
  try {
    return readStatRecord(pid);
  } catch {
    return undefined;
  }
}

/** `true` when `stat` is the record of a process in group `groupId` that has not exited. */
export function isLiveMemberOf(groupId: number, stat: IProcessStat | undefined): stat is IProcessStat {
  return stat !== undefined && stat.groupId === groupId && !stat.exited;
}

/** Lists the pids in `/proc`; throws when `/proc` cannot be listed. */
export function readProcessIds(): number[] {
  return fs
    .readdirSync(PROC_ROOT)
    .filter((name: string) => PID_PATTERN.test(name))
    .map(Number);
}

function listProcessIds(): number[] {
  try {
    return readProcessIds();
  } catch {
    return [];
  }
}

/** Lists the processes of group `groupId` that have not exited, by scanning `/proc`. */
export function listLiveGroupMembers(groupId: number): IProcessStat[] {
  return listProcessIds()
    .map(readProcessStat)
    .filter((stat: IProcessStat | undefined): stat is IProcessStat => isLiveMemberOf(groupId, stat));
}
