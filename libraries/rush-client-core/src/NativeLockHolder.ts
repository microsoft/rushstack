// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { IDaemonNativeLockHolder } from '@rushstack/rush-daemon-protocol';

import { tryGetProcessStartTimeMs } from './ProcessStartTime';

/** The name of each lock file that LockFile.acquire(folder, 'rush') writes on Linux and macOS. */
const LOCK_FILE_PATTERN: RegExp = /^rush#(\d+)\.lock$/;
const SCRIPT_EXTENSION_PATTERN: RegExp = /\.[cm]?js$/;
const PROGRAM_PATTERN: RegExp = /^[\w@.+-]{1,40}$/;
const ACTION_PATTERN: RegExp = /^[a-z][\w:.-]{0,39}$/i;
/** A process that began this long after a lock file was written cannot have written it: its PID was reused. */
const PID_REUSE_MARGIN_MS: number = 2000;
const HOLDER_DESCRIPTION: string = 'another Rush process';

interface ILockFileCandidate {
  readonly pid: number;
  readonly writtenMs: number;
}

/**
 * Names the process that holds Rush's repository lock in `lockFolder`, the common temp folder, as far as this
 * platform can tell. Like LockFile, it treats the live process with the oldest lock file as the holder, and it
 * ignores `ownPid`, empty lock files (processes still trying to acquire) and lock files of exited processes.
 * Only Linux can tell a live holder from a stale lock file, so other platforms name no holder.
 *
 * The command is the program and its action, such as `rush install`. Later arguments can hold secrets, so they
 * are never included. This reads files only, and never signals any process.
 * @beta
 */
export function findNativeLockHolder(
  lockFolder: string,
  ownPid: number = process.pid
): IDaemonNativeLockHolder {
  if (process.platform !== 'linux') return {};
  const holder: ILockFileCandidate | undefined = readLockFileCandidates(lockFolder, ownPid)
    .sort((a, b) => a.writtenMs - b.writtenMs)
    .find(isWrittenByLiveProcess);
  if (!holder) return {};
  const command: string | undefined = formatNativeLockCommand(readCommandLine(holder.pid));
  return command === undefined ? { pid: holder.pid } : { pid: holder.pid, command };
}

/**
 * Shortens the command line of a Node.js process to its program and action, for example
 * `node /home/u/.rush/node_modules/@microsoft/rush/bin/rush install --bypass-policy` to `rush install`.
 * Returns `undefined` when the command line does not run a script, or its program name is unusual.
 * @beta
 */
export function formatNativeLockCommand(argv: readonly string[]): string | undefined {
  const [, script, ...args] = argv;
  if (!script || script.startsWith('-')) return undefined;
  const program: string = path.basename(script).replace(SCRIPT_EXTENSION_PATTERN, '');
  if (!PROGRAM_PATTERN.test(program)) return undefined;
  // Only the first argument that is not an option can be the action; what follows it is never shown.
  const action: string | undefined = args.find((arg) => !arg.startsWith('-'));
  return action !== undefined && ACTION_PATTERN.test(action) ? `${program} ${action}` : program;
}

/**
 * Describes the Rush process that holds the repository lock, for example
 * `another Rush process (PID 12345: rush install)`, naming only what is known.
 * @beta
 */
export function formatNativeLockHolder(holder: IDaemonNativeLockHolder | undefined): string {
  const pid: string | undefined = holder?.pid === undefined ? undefined : `PID ${holder.pid}`;
  const details: string = [pid, holder?.command].filter((detail) => detail !== undefined).join(': ');
  return details ? `${HOLDER_DESCRIPTION} (${details})` : HOLDER_DESCRIPTION;
}

function readLockFileCandidates(lockFolder: string, ownPid: number): ILockFileCandidate[] {
  let names: string[];
  try {
    names = fs.readdirSync(lockFolder);
  } catch {
    return [];
  }
  const candidates: ILockFileCandidate[] = [];
  for (const name of names) {
    const pid: number = Number(LOCK_FILE_PATTERN.exec(name)?.[1]);
    if (!Number.isSafeInteger(pid) || pid === ownPid) continue;
    const candidate: ILockFileCandidate | undefined = tryReadCandidate(path.join(lockFolder, name), pid);
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

function tryReadCandidate(filePath: string, pid: number): ILockFileCandidate | undefined {
  try {
    const stats: fs.Stats = fs.statSync(filePath);
    // A process writes its start time into its lock file right after creating it, and before it can hold the lock.
    return stats.size > 0 ? { pid, writtenMs: stats.mtimeMs } : undefined;
  } catch {
    // The process released the lock and deleted its lock file.
    return undefined;
  }
}

function isWrittenByLiveProcess({ pid, writtenMs }: ILockFileCandidate): boolean {
  const startMs: number | undefined = tryGetProcessStartTimeMs(pid);
  return startMs !== undefined && startMs <= writtenMs + PID_REUSE_MARGIN_MS;
}

function readCommandLine(pid: number): string[] {
  try {
    return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0$/, '').split('\0');
  } catch {
    return [];
  }
}
