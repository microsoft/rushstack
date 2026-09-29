// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { setTimeout as delayAsync } from 'node:timers/promises';

import {
  assertDaemonRuntimeDirIsPrivate,
  readDaemonLockfile,
  reclaimStaleDaemonAsync,
  type IDaemonLockfile,
  type IDaemonPaths,
  type IDaemonReclaimOptions
} from '@rushstack/rush-daemon-transport';

import { isProcessAlive } from './DaemonOwnership';
import { readDaemonStartupReservation } from './DaemonStartup';
import { isProcessDefunct } from './ProcessStartTime';
import { logReclaimedDaemon } from './ReclaimedDaemonLog';
import { tryAcquireStartupLockAsync, type IStartupLock } from './StartupLock';

/**
 * How long to wait while another client reclaims the exited daemon. A reclaim sends SIGTERM to orphaned
 * operations, then SIGKILL to those still running 2 seconds later.
 */
const RECLAIM_WAIT_MS: number = 5000;
/**
 * How long to wait while the exited daemon's process is not reaped yet. Its parent, usually init or a subreaper,
 * reaps it at once. A parent that has not reaped it within a second may never do so, for example PID 1 in a
 * container that does not reap the processes it adopts, and each command that runs Rush in-process until then
 * would wait all of it.
 */
const REAP_WAIT_MS: number = 1000;
const RECLAIM_POLL_INTERVAL_MS: number = 50;

/** A daemon process that has exited, and the workspace files that may still name it. */
export interface IExitedDaemon {
  readonly pid: number;
  /** The ownership record's start time when known; a record with another start time names another process. */
  readonly startedAt: string | undefined;
  readonly paths: IDaemonPaths;
}

/**
 * Reclaims the workspace's daemon when its ownership record names a process that no longer runs, such as a
 * daemon that crashed or was killed while it ran a command. This stops the operations that the daemon left
 * running, so that they cannot overwrite the outputs of a command that then runs without the daemon.
 *
 * @remarks
 * Call it before Rush runs in-process. Like the next daemon start, it terminates the daemon's orphaned
 * operation process groups and removes the ownership record and socket. Each set of groups that it stops is
 * reported to `options.onOrphansReaped`, or else as a `RUSH_DAEMON_ORPHANS_REAPED` process warning. It does so
 * only under the start mutex and when no startup is reserved. It waits up to 5 seconds while another client
 * holds the mutex, and up to 1 second while the exited process is not reaped yet. It does nothing when there is
 * no record, when a process with the recorded PID runs, or when the runtime folder is not private, and it never
 * throws.
 *
 * A reclaim appends a line that names the daemon to the launcher log, so that `rush-client daemon status` can
 * still say that it exited without shutting down once its ownership record is gone.
 *
 * @beta
 */
export async function reclaimCrashedDaemonAsync(
  paths: IDaemonPaths,
  options?: IDaemonReclaimOptions
): Promise<void> {
  let owner: IDaemonLockfile | undefined;
  try {
    // Every daemon command checks the folder before it trusts the records in it.
    assertDaemonRuntimeDirIsPrivate(paths);
    owner = readDaemonLockfile(paths.lockfilePath);
    // The reclaim refuses a PID that still exists, except that an exited process may not be reaped yet.
    if (!owner || (isProcessAlive(owner.pid) && !isProcessDefunct(owner.pid))) return;
  } catch {
    // For example EPERM: the PID exists but cannot be inspected.
    return;
  }
  await reclaimExitedDaemonAsync({ pid: owner.pid, startedAt: owner.startedAt, paths }, options);
}

/**
 * Stops the operations that an exited daemon left running, and removes its ownership record and socket, as
 * the next daemon start would (`options.onOrphansReaped` or `RUSH_DAEMON_ORPHANS_REAPED` warnings say what was
 * stopped). Best effort: it acts only while the ownership record names that daemon, under the start mutex, and
 * when no startup is reserved. While another client holds the mutex, for example to reclaim the same daemon,
 * it waits up to 5 seconds, and it waits up to 1 second for the exited process to be reaped. A reclaim is
 * logged ({@link logReclaimedDaemon}).
 */
export async function reclaimExitedDaemonAsync(
  daemon: IExitedDaemon,
  options?: IDaemonReclaimOptions
): Promise<void> {
  const startedAt: number = Date.now();
  try {
    while (isRecordedOwner(daemon)) {
      // The reclaim refuses a PID that still exists, which includes an exited process that is not reaped yet.
      const isDefunct: boolean = isProcessDefunct(daemon.pid);
      if (!isDefunct) {
        const lock: IStartupLock | undefined = await tryAcquireStartupLockAsync(daemon.paths);
        if (lock) {
          try {
            if (isRecordedOwner(daemon) && !readDaemonStartupReservation(daemon.paths)) {
              await reclaimStaleDaemonAsync(daemon.paths, options);
              logReclaimedDaemon(daemon.paths, daemon.pid);
            }
          } finally {
            await lock.releaseAsync();
          }
          return;
        }
      }
      if (Date.now() - startedAt >= (isDefunct ? REAP_WAIT_MS : RECLAIM_WAIT_MS)) return;
      await delayAsync(RECLAIM_POLL_INTERVAL_MS);
    }
  } catch {
    // For example, the PID was reused, or another process holds the reclaim's mutex; the next start retries.
  }
}

function isRecordedOwner(daemon: IExitedDaemon): boolean {
  const owner: IDaemonLockfile | undefined = readDaemonLockfile(daemon.paths.lockfilePath);
  return (
    owner?.pid === daemon.pid && (daemon.startedAt === undefined || owner.startedAt === daemon.startedAt)
  );
}
