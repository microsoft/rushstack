// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import { connectDaemonAsync } from './DaemonConnector';
import type { DaemonFrameConnection } from './DaemonFrameConnection';
import {
  isDaemonProcessAlive,
  readDaemonLockfile,
  removeDaemonArtifacts
} from './DaemonLockfile';
import type { IDaemonPaths } from './DaemonPaths';
import { tryAcquireReclaimLock } from './DaemonReclaimLock';
import type { DaemonReclaimLockOutcome } from './DaemonReclaimLock';
import { DaemonTransportError, DaemonTransportErrorCode } from './DaemonTransportError';

/**
 * Reclaims the socket/pipe path when it is held by a dead daemon.
 *
 * @remarks
 * Two-factor stale detection — the lockfile PID must be dead *and* a connect
 * probe must fail — so a daemon that is alive but momentarily unresponsive is
 * never reclaimed underneath itself. Reclaims are serialized through the
 * lockfile mutex ({@link tryAcquireReclaimLock}): only the mutex holder may
 * unlink the socket path, so a concurrent starter cannot delete a socket that
 * another process just bound.
 *
 * @throws {@link DaemonTransportError} with code `daemonAlreadyRunning` when a
 * live (or plausibly live) daemon owns the path, or when another starter holds
 * the reclaim lock.
 *
 * @beta
 */
export async function reclaimStaleDaemonAsync(paths: IDaemonPaths): Promise<void> {
  // The mutex lives beside the lockfile (never the same file): the lockfile
  // records the *running* daemon's live PID, while the mutex only ever records
  // a reclaimer's pid. So a live daemon is "locked" (its PID alive), while a
  // dead daemon's stale record is safe to steal.
  const lock: DaemonReclaimLockOutcome = tryAcquireReclaimLock(reclaimLockPath(paths));
  if (!lock.acquired) {
    throwAlreadyRunning(paths, 'another starter holds the reclaim lock');
  }
  try {
    await reclaimUnderLockAsync(paths);
  } finally {
    try {
      fs.unlinkSync(reclaimLockPath(paths));
    } catch {
      // Another starter may have already cleared it; release is best-effort.
    }
  }
}

function reclaimLockPath(paths: IDaemonPaths): string {
  return `${paths.lockfilePath}.reclaim`;
}

async function reclaimUnderLockAsync(paths: IDaemonPaths): Promise<void> {
  if (isLockfilePidAlive(readDaemonLockfile(paths.lockfilePath))) {
    throwAlreadyRunning(paths, 'its lockfile PID is alive');
  }
  const probeFailed: boolean = await probeConnectionFailsAsync(paths.socketPath);
  if (!probeFailed) {
    throwAlreadyRunning(paths, 'it answers a connect probe');
  }
  removeDaemonArtifacts(paths.lockfilePath, paths.socketPath);
}

function isLockfilePidAlive(lockfile: ReturnType<typeof readDaemonLockfile>): boolean {
  return lockfile !== undefined && isDaemonProcessAlive(lockfile.pid);
}

function throwAlreadyRunning(paths: IDaemonPaths, reason: string): never {
  throw new DaemonTransportError(
    DaemonTransportErrorCode.daemonAlreadyRunning,
    `A live daemon already listens at ${paths.socketPath} (${reason}).`
  );
}

async function probeConnectionFailsAsync(socketPath: string): Promise<boolean> {
  try {
    const probe: DaemonFrameConnection = await connectDaemonAsync(socketPath);
    await probe.closeAsync();
    return false;
  } catch {
    return true;
  }
}
