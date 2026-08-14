// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { connectDaemonAsync } from './DaemonConnector';
import type { DaemonFrameConnection } from './DaemonFrameConnection';
import {
  type IDaemonLockfile,
  isDaemonProcessAlive,
  readDaemonLockfile,
  removeDaemonArtifacts
} from './DaemonLockfile';
import type { IDaemonPaths } from './DaemonPaths';
import { DaemonTransportError, DaemonTransportErrorCode } from './DaemonTransportError';

/**
 * Reclaims the socket/pipe path when it is held by a dead daemon (stale
 * socket file whose lockfile PID is gone and which refuses connections).
 *
 * @remarks
 * Stale detection is deliberately two-factor: the lockfile PID must be dead
 * *and* a connect probe must fail, so a daemon that is alive but momentarily
 * unresponsive (for example mid-startup) is never reclaimed underneath itself.
 *
 * @throws {@link DaemonTransportError} with code `daemonAlreadyRunning` when a
 * live (or plausibly live) daemon owns the path.
 *
 * @beta
 */
export async function reclaimStaleDaemonAsync(paths: IDaemonPaths): Promise<void> {
  const lockfile: IDaemonLockfile | undefined = readDaemonLockfile(paths.lockfilePath);
  if (isLockfilePidAlive(lockfile)) {
    throwAlreadyRunning(paths, 'its lockfile PID is alive');
  }
  const probeFailed: boolean = await probeConnectionFailsAsync(paths.socketPath);
  if (!probeFailed) {
    throwAlreadyRunning(paths, 'it answers a connect probe');
  }
  removeDaemonArtifacts(paths.lockfilePath, paths.socketPath);
}

function isLockfilePidAlive(lockfile: IDaemonLockfile | undefined): boolean {
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
