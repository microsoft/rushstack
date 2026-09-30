// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

const FOLDER_INFIX: string = '.groups-';
const NAME_SEPARATOR: string = '-';
const RECORD_NAME_PATTERN: RegExp = /^(\d+)-(\d+)$/;
// A pid as getOperationGroupsFolder() writes it: no sign, no leading zero, and never 0.
const DAEMON_PID_PATTERN: RegExp = /^[1-9]\d*$/;
const GROUP_ID_MATCH: number = 1;
const START_TIME_MATCH: number = 2;
const DIR_MODE: number = 0o700;
const FILE_MODE: number = 0o600;
const EMPTY_FILE: string = '';

/** A running operation process group: its leader's pid (which is the group id) and start time. */
export interface IOperationGroupRecord {
  readonly groupId: number;
  readonly startTime: string;
}

/** The sidecar folder in which daemon `daemonPid` records the process groups of its running operations. */
export function getOperationGroupsFolder(lockfilePath: string, daemonPid: number): string {
  return `${lockfilePath}${FOLDER_INFIX}${daemonPid}`;
}

function getRecordPath(folder: string, record: IOperationGroupRecord): string {
  return path.join(folder, `${record.groupId}${NAME_SEPARATOR}${record.startTime}`);
}

/** Writes the empty file `entryPath`, creating its sidecar folder first; for records and spawn marks. */
export function writeOperationGroupsEntry(entryPath: string): void {
  fs.mkdirSync(path.dirname(entryPath), { recursive: true, mode: DIR_MODE });
  fs.writeFileSync(entryPath, EMPTY_FILE, { mode: FILE_MODE });
}

/** Records a running group as an empty file whose name is the record, so no record is ever half-written. */
export function writeOperationGroupRecord(folder: string, record: IOperationGroupRecord): void {
  writeOperationGroupsEntry(getRecordPath(folder, record));
}

/** Forgets a group whose leader has exited. */
export function removeOperationGroupRecord(folder: string, record: IOperationGroupRecord): void {
  fs.rmSync(getRecordPath(folder, record), { force: true });
}

function parseRecordName(name: string): IOperationGroupRecord | undefined {
  const match: RegExpExecArray | null = RECORD_NAME_PATTERN.exec(name);
  return match ? { groupId: Number(match[GROUP_ID_MATCH]), startTime: match[START_TIME_MATCH] } : undefined;
}

function isRecord(record: IOperationGroupRecord | undefined): record is IOperationGroupRecord {
  return record !== undefined;
}

/** The names of the entries in `folder`; none when it is missing or unreadable. */
export function readFolderNames(folder: string): string[] {
  try {
    return fs.readdirSync(folder);
  } catch {
    return [];
  }
}

/** Reads the recorded groups; a missing or unreadable folder holds none. */
export function readOperationGroupRecords(folder: string): IOperationGroupRecord[] {
  return readFolderNames(folder).map(parseRecordName).filter(isRecord);
}

/**
 * The pids of the daemons, running or not, whose record folders are beside `lockfilePath`. A name that
 * isn't a pid as {@link getOperationGroupsFolder} writes it, or whose number is too large to be exact, is
 * skipped.
 */
export function listOperationGroupsDaemonPids(lockfilePath: string): number[] {
  const prefix: string = `${path.basename(lockfilePath)}${FOLDER_INFIX}`;
  return readFolderNames(path.dirname(lockfilePath))
    .filter((name: string) => name.startsWith(prefix) && DAEMON_PID_PATTERN.test(name.slice(prefix.length)))
    .map((name: string) => Number(name.slice(prefix.length)))
    .filter(Number.isSafeInteger);
}

/** Deletes the sidecar folder and every record in it; idempotent. */
export function removeOperationGroupRecords(folder: string): void {
  fs.rmSync(folder, { recursive: true, force: true });
}
