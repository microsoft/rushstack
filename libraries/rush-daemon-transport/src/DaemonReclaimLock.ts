// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import { isDaemonProcessAlive } from './DaemonLockfile';

const UTF8: BufferEncoding = 'utf8';
const FILE_MODE: number = 0o600;

/**
 * The outcome of attempting to take the reclaim mutex on a lockfile.
 *
 * @beta
 */
export type DaemonReclaimLockOutcome =
  | { readonly acquired: true }
  | { readonly acquired: false; readonly reason: 'alreadyHeld' };

function readMutexPid(lockfilePath: string): number | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(lockfilePath, UTF8));
  } catch {
    return undefined;
  }
  return extractMutexPid(parsed);
}

function extractMutexPid(parsed: unknown): number | undefined {
  const pid: unknown = isPlainRecord(parsed) ? parsed.mutexPid : undefined;
  return typeof pid === 'number' ? pid : undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stealFromDeadHolder(lockfilePath: string): DaemonReclaimLockOutcome {
  const holderPid: number | undefined = readMutexPid(lockfilePath);
  const holderAlive: boolean = holderPid !== undefined && isDaemonProcessAlive(holderPid);
  if (holderAlive) {
    return { acquired: false, reason: 'alreadyHeld' };
  }
  return rewriteMutexEntry(lockfilePath);
}

function rewriteMutexEntry(lockfilePath: string): DaemonReclaimLockOutcome {
  // The holder is dead (or the record is a corrupt/bare mutex record): steal by
  // unlinking the stale record and re-creating the mutex entry atomically.
  try {
    fs.unlinkSync(lockfilePath);
    fs.writeFileSync(lockfilePath, JSON.stringify({ mutexPid: process.pid }), {
      encoding: UTF8,
      flag: 'wx',
      mode: FILE_MODE
    });
    return { acquired: true };
  } catch {
    // Lost the steal race to another starter; they now hold the mutex.
    return { acquired: false, reason: 'alreadyHeld' };
  }
}

/**
 * Attempts to take an exclusive reclaim mutex on `lockfilePath` by creating it
 * with the `wx` flag. A lockfile left by a dead process is stale-safe to steal
 * (the holder can no longer be binding the socket); one held by a live process
 * means another starter is reclaiming or running.
 *
 * @beta
 */
export function tryAcquireReclaimLock(lockfilePath: string): DaemonReclaimLockOutcome {
  try {
    fs.writeFileSync(lockfilePath, JSON.stringify({ mutexPid: process.pid }), {
      encoding: UTF8,
      flag: 'wx',
      mode: FILE_MODE
    });
    return { acquired: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
    return stealFromDeadHolder(lockfilePath);
  }
}
