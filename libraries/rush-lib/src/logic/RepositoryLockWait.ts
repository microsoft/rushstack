// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { Async, FileSystem, type FileSystemStats, LockFile } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import { EnvironmentVariableNames } from '../api/EnvironmentConfiguration';

/** The resource name of Rush's repository lock, which Rush takes in the common temp folder. */
const REPOSITORY_LOCK_NAME: string = 'rush';
/** The name of each lock file of the repository lock on Linux and macOS. On Windows, `rush.lock` names no process. */
const LOCK_FILE_NAME_REGEXP: RegExp = /^rush#(\d+)\.lock$/;
/** How often a command that waits tries again to take the lock, as `LockFile.acquireAsync` does. */
const RETRY_INTERVAL_MS: number = 100;
const WHOLE_NUMBER_REGEXP: RegExp = /^\d{1,15}$/;

/**
 * A wait for the repository lock that `rush-client` asks for when it runs Rush in-process after it tried the daemon.
 */
export interface IRepositoryLockWait {
  /** The time, in milliseconds since the Unix epoch, until which the command waits for the lock. */
  readonly deadlineMs: number;
  /** The process ID of the Rush daemon that handed the command back. */
  readonly daemonPid?: number;
}

/**
 * Reads the wait for the repository lock that `rush-client` asked for, and removes its variables from `environment`,
 * so that neither the command's operations nor any Rush process that they start inherit it.
 *
 * @returns undefined if `rush-client` asked for no wait, or if its deadline is not a whole number.
 */
export function consumeRepositoryLockWait(
  environment: NodeJS.ProcessEnv = process.env
): IRepositoryLockWait | undefined {
  const deadline: string | undefined = environment[EnvironmentVariableNames._RUSH_LOCK_WAIT_DEADLINE];
  const daemonPid: string | undefined = environment[EnvironmentVariableNames._RUSH_LOCK_WAIT_DAEMON_PID];
  delete environment[EnvironmentVariableNames._RUSH_LOCK_WAIT_DEADLINE];
  delete environment[EnvironmentVariableNames._RUSH_LOCK_WAIT_DAEMON_PID];
  const deadlineMs: number | undefined = parseWholeNumber(deadline);
  if (deadlineMs === undefined) {
    return undefined;
  }
  const pid: number | undefined = parseWholeNumber(daemonPid);
  return pid ? { deadlineMs, daemonPid: pid } : { deadlineMs };
}

/**
 * Describes the process that holds Rush's repository lock in `lockFolder`: "the Rush daemon (PID 4242)" if it is
 * `daemonPid`, "another Rush process (PID 17)", or "another Rush process" if no lock file names it.
 *
 * @remarks
 * On Linux and macOS, a process that tries to take the lock writes `rush#<pid>.lock`, and deletes it again if it
 * fails, so at rest only the process that holds the lock has a lock file with content. If several do, the oldest
 * one is named. On Windows, the lock file names no process. This only reads files.
 */
export function describeRepositoryLockHolder(
  lockFolder: string,
  daemonPid: number | undefined,
  ownPid: number = process.pid
): string {
  const pid: number | undefined = findRepositoryLockHolderPid(lockFolder, ownPid);
  if (pid === undefined) {
    return 'another Rush process';
  }
  return pid === daemonPid ? `the Rush daemon (PID ${pid})` : `another Rush process (PID ${pid})`;
}

/** The outcome of {@link acquireRepositoryLockAsync}. */
export interface IRepositoryLockResult {
  /** The lock, if this process took it. */
  readonly lock: LockFile | undefined;
  /**
   * If this process did not take the lock, and `rush-client` asked for a wait, the sentence that names the process
   * that holds it, for example "The Rush daemon (PID 4242) still holds this repository's lock."
   */
  readonly holderSentence?: string;
}

/** The options of {@link acquireRepositoryLockAsync}. */
export interface IAcquireRepositoryLockOptions {
  /** The folder of the lock, which is the common temp folder. */
  readonly lockFolder: string;
  /** The wait that `rush-client` asked for. Without one, this tries once to take the lock, as Rush always has. */
  readonly wait: IRepositoryLockWait | undefined;
  /** Receives, as a warning, the line that says what the command waits for. */
  readonly terminal: ITerminal;
  /** Tries once to take the lock. Defaults to `LockFile.tryAcquire`. */
  readonly tryAcquire?: (lockFolder: string) => LockFile | undefined;
  /** Returns the current time in milliseconds since the Unix epoch. Defaults to `Date.now`. */
  readonly now?: () => number;
  /** Waits before the next attempt. Defaults to `Async.sleepAsync`. */
  readonly sleepAsync?: (ms: number) => Promise<void>;
  /** This process's ID, whose own lock file never names the holder. Defaults to `process.pid`. */
  readonly ownPid?: number;
}

/**
 * Takes Rush's repository lock. Without a wait, this tries once. With a wait whose deadline has not passed, it writes
 * a line that names the process that holds the lock, then tries again every 100 ms until it takes the lock or the
 * deadline passes. Errors other than a held lock are thrown, as `LockFile.tryAcquire` throws them.
 */
export async function acquireRepositoryLockAsync(
  options: IAcquireRepositoryLockOptions
): Promise<IRepositoryLockResult> {
  const {
    lockFolder,
    wait,
    terminal,
    tryAcquire = tryAcquireRepositoryLock,
    now = Date.now,
    sleepAsync = Async.sleepAsync,
    ownPid = process.pid
  } = options;
  let lock: LockFile | undefined = tryAcquire(lockFolder);
  if (lock || !wait) {
    return { lock };
  }
  let remainingMs: number = wait.deadlineMs - now();
  const waits: boolean = remainingMs > 0;
  if (waits) {
    const holder: string = describeRepositoryLockHolder(lockFolder, wait.daemonPid, ownPid);
    terminal.writeWarningLine(
      `Waiting up to ${Math.ceil(remainingMs / 1000)} s for ${holder} to release this repository's lock.`
    );
  }
  while (remainingMs > 0) {
    await sleepAsync(Math.min(RETRY_INTERVAL_MS, remainingMs));
    lock = tryAcquire(lockFolder);
    if (lock) {
      return { lock };
    }
    remainingMs = wait.deadlineMs - now();
  }
  const holder: string = describeRepositoryLockHolder(lockFolder, wait.daemonPid, ownPid);
  const holds: string = waits ? 'still holds' : 'holds';
  return { lock, holderSentence: `${capitalize(holder)} ${holds} this repository's lock.` };
}

function tryAcquireRepositoryLock(lockFolder: string): LockFile | undefined {
  return LockFile.tryAcquire(lockFolder, REPOSITORY_LOCK_NAME);
}

function findRepositoryLockHolderPid(lockFolder: string, ownPid: number): number | undefined {
  let names: string[];
  try {
    names = FileSystem.readFolderItemNames(lockFolder);
  } catch {
    return undefined;
  }
  let holderPid: number | undefined;
  let holderWrittenMs: number = Infinity;
  for (const name of names) {
    const pid: number = Number(LOCK_FILE_NAME_REGEXP.exec(name)?.[1]);
    if (!Number.isSafeInteger(pid) || pid === ownPid) {
      continue;
    }
    let stats: FileSystemStats;
    try {
      stats = FileSystem.getStatistics(path.join(lockFolder, name));
    } catch {
      // The process released the lock and deleted its lock file.
      continue;
    }
    // An empty lock file belongs to a process that has only begun to try to take the lock.
    if (stats.size > 0 && stats.mtimeMs < holderWrittenMs) {
      holderPid = pid;
      holderWrittenMs = stats.mtimeMs;
    }
  }
  return holderPid;
}

function parseWholeNumber(value: string | undefined): number | undefined {
  return value !== undefined && WHOLE_NUMBER_REGEXP.test(value) ? Number(value) : undefined;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
