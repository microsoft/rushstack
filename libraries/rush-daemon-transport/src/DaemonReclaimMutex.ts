// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import type { IDaemonPaths } from './DaemonPaths';
import { tryAcquireReclaimLock } from './DaemonReclaimLock';
import type { DaemonReclaimLockOutcome } from './DaemonReclaimLock';
import { assertDaemonRuntimeDirIsPrivate } from './DaemonRuntimeDir';
import { DaemonTransportError, DaemonTransportErrorCode } from './DaemonTransportError';

function reclaimLockPath(paths: IDaemonPaths): string {
  return `${paths.lockfilePath}.reclaim`;
}

/** Throws {@link DaemonTransportErrorCode.daemonAlreadyRunning} for the endpoint of `paths`. */
export function throwAlreadyRunning(paths: IDaemonPaths, reason: string): never {
  throw new DaemonTransportError(
    DaemonTransportErrorCode.daemonAlreadyRunning,
    `A live daemon already listens at ${paths.socketPath} (${reason}).`
  );
}

/**
 * Runs `action` while holding the reclaim mutex of `paths`, in a runtime directory that is private to this
 * user. Throws `daemonAlreadyRunning` when another starter holds the mutex, and `unsafeRuntimeDirectory` for an
 * unsafe runtime directory.
 */
export async function runUnderReclaimMutexAsync(
  paths: IDaemonPaths,
  action: () => Promise<void>
): Promise<void> {
  assertDaemonRuntimeDirIsPrivate(paths);
  // The mutex lives beside the lockfile (never the same file): the lockfile
  // records the *running* daemon's live PID, while the mutex only ever records
  // a reclaimer's pid. So a live daemon is "locked" (its PID alive), while a
  // dead daemon's stale record is safe to steal.
  const lock: DaemonReclaimLockOutcome = tryAcquireReclaimLock(reclaimLockPath(paths));
  if (!lock.acquired) {
    throwAlreadyRunning(paths, 'another starter holds the reclaim lock');
  }
  try {
    await action();
  } finally {
    try {
      fs.unlinkSync(reclaimLockPath(paths));
    } catch {
      // Another starter may have already cleared it; release is best-effort.
    }
  }
}
