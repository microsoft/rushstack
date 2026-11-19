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

import { isProcessAlive, reclaimAbandonedOwnershipAsync } from './DaemonOwnership';
import { readDaemonStartupReservation } from './DaemonStartup';
import { isProcessDefunct, isProcessStartedAfter } from './ProcessStartTime';
import { getClientReclaimOptions, logReclaimedDaemon } from './ReclaimedDaemonLog';
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
 * daemon that crashed or was killed while it ran a command, including when another process has its PID now.
 * This stops the operations that the daemon left running, so that they cannot overwrite the outputs of a
 * command that then runs without the daemon.
 *
 * @remarks
 * Call it before Rush runs in-process. Like the next daemon start, it terminates the daemon's orphaned
 * operation process groups and removes the ownership record and socket. Each set of groups that it stops is
 * reported to `options.onOrphansReaped`, or else as a `RUSH_DAEMON_ORPHANS_REAPED` process warning. Each
 * recorded group that it leaves running, because it cannot prove that the group still runs an operation of the
 * daemon, goes to `options.onOperationGroupLeftRunning`, or else to a line in the launcher log. It does so
 * only under the start mutex and when no startup is reserved. It waits up to 5 seconds while another client
 * holds the mutex, and up to 1 second while the exited process is not reaped yet. It does nothing when there is
 * no record or the runtime folder is not private. When a process with the recorded PID runs, it acts only when
 * that process started after the record was written and the daemon's endpoint refuses a connection, as the next
 * daemon start requires: after the wall clock jumps forward, a running daemon can seem to have started later,
 * but it still accepts connections. It never throws.
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
    if (!owner) return;
    if (isProcessAlive(owner.pid) && !isProcessDefunct(owner.pid)) {
      if (!isProcessStartedAfter(owner.pid, owner.startedAt)) return;
      await reclaimReusedDaemonAsync({ pid: owner.pid, startedAt: owner.startedAt, paths }, options);
      return;
    }
  } catch {
    // For example EPERM: the PID exists but cannot be inspected.
    return;
  }
  await reclaimExitedDaemonAsync({ pid: owner.pid, startedAt: owner.startedAt, paths }, options);
}

async function reclaimReusedDaemonAsync(
  daemon: IExitedDaemon,
  options?: IDaemonReclaimOptions
): Promise<void> {
  const startedAt: number = Date.now();
  try {
    while (isRecordedOwner(daemon)) {
      const lock: IStartupLock | undefined = await tryAcquireStartupLockAsync(daemon.paths);
      if (lock) {
        try {
          if (isRecordedOwner(daemon) && !readDaemonStartupReservation(daemon.paths)) {
            // The same reclaim as the next daemon start's, which throws unless the endpoint refuses a connection.
            await reclaimAbandonedOwnershipAsync(daemon.paths, options);
            await reclaimStaleDaemonAsync(daemon.paths, getClientReclaimOptions(daemon.paths, options));
            logReclaimedDaemon(daemon.paths, daemon.pid);
          }
        } finally {
          await lock.releaseAsync();
        }
        return;
      }
      if (Date.now() - startedAt >= RECLAIM_WAIT_MS) return;
      await delayAsync(RECLAIM_POLL_INTERVAL_MS);
    }
  } catch {
    // For example, the endpoint accepted a connection, or a process group could not be stopped.
  }
}

/**
 * Stops the operations that an exited daemon left running, and removes its ownership record and socket, as
 * the next daemon start would (`options.onOrphansReaped` or `RUSH_DAEMON_ORPHANS_REAPED` warnings say what was
 * stopped, and `options.onOperationGroupLeftRunning` or the launcher log what was left running). Best effort:
 * it acts only while the ownership record names that daemon, under the start mutex, and when no startup is
 * reserved. While another client holds the mutex, for example to reclaim the same daemon, it waits up to 5
 * seconds, and it waits up to 1 second for the exited process to be reaped. A reclaim is logged
 * ({@link logReclaimedDaemon}).
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
              await reclaimStaleDaemonAsync(daemon.paths, getClientReclaimOptions(daemon.paths, options));
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
