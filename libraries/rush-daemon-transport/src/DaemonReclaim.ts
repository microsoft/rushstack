// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { connectDaemonAsync } from './DaemonConnector';
import type { DaemonFrameConnection } from './DaemonFrameConnection';
import { isDaemonProcessAlive, readDaemonLockfile, removeDaemonArtifacts } from './DaemonLockfile';
import { reapOrphansOfDeadOwnerAsync } from './DaemonOrphanReaper';
import type { IDaemonPaths } from './DaemonPaths';
import { runUnderReclaimMutexAsync, throwAlreadyRunning } from './DaemonReclaimMutex';
import type { IDaemonReclaimOptions } from './DaemonReclaimOptions';

/**
 * Reclaims the socket/pipe path when it is held by a dead daemon.
 *
 * @remarks
 * Two-factor stale detection — the lockfile PID must be dead *and* a connect probe must fail — so a daemon
 * that is alive but momentarily unresponsive is never reclaimed underneath itself. Reclaims are serialized
 * through the lockfile mutex ({@link tryAcquireReclaimLock}): only the mutex holder may unlink the socket
 * path, so a concurrent starter cannot delete a socket that another process just bound. Operation processes
 * still running in the dead daemon's process group, or in the operation process groups that it recorded, are
 * terminated first on Linux, and so are the operation process groups recorded by other daemons that are gone
 * and that no lockfile names (see `DaemonOrphanReaper`). They are reported to `options.onOrphansReaped`. Nothing is
 * read, reaped or removed unless the runtime directory is a private directory of this user.
 *
 * @throws {@link DaemonTransportError} with code `daemonAlreadyRunning` when a
 * live (or plausibly live) daemon owns the path, or when another starter holds
 * the reclaim lock, with code `unsafeRuntimeDirectory` for an unsafe
 * runtime directory, and with code `socketPathTooLong` for a socket path that
 * no client could connect to.
 *
 * @beta
 */
export async function reclaimStaleDaemonAsync(
  paths: IDaemonPaths,
  options?: IDaemonReclaimOptions
): Promise<void> {
  await runUnderReclaimMutexAsync(paths, () => reclaimUnderLockAsync(paths, options));
}

async function reclaimUnderLockAsync(paths: IDaemonPaths, options?: IDaemonReclaimOptions): Promise<void> {
  const owner: ReturnType<typeof readDaemonLockfile> = readDaemonLockfile(paths.lockfilePath);
  if (isLockfilePidAlive(owner)) {
    throwAlreadyRunning(paths, 'its lockfile PID is alive');
  }
  const probeFailed: boolean = await probeConnectionFailsAsync(paths.socketPath);
  if (!probeFailed) {
    throwAlreadyRunning(paths, 'it answers a connect probe');
  }
  // A daemon that died uncleanly leaves its operations running; stop them before a successor re-runs them.
  await reapOrphansOfDeadOwnerAsync(paths.lockfilePath, owner, options);
  removeDaemonArtifacts(paths.lockfilePath, paths.socketPath);
}

function isLockfilePidAlive(lockfile: ReturnType<typeof readDaemonLockfile>): boolean {
  return lockfile !== undefined && isDaemonProcessAlive(lockfile.pid);
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
