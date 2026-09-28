// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  readDaemonLockfile,
  type IDaemonLockfile,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';

import type { DaemonClient } from './DaemonClient';
import { isDaemonOwnership, isOwnerProcessAlive } from './DaemonOwnership';
import {
  getDaemonStartupFilePath,
  readDaemonStartupReservation,
  removeDaemonStartupIfUnchanged,
  type IDaemonStartupHelper,
  type IDaemonStartupReservation
} from './DaemonStartup';
import { tryAcquireStartupLockAsync, type IStartupLock } from './StartupLock';

/**
 * What a startup reservation's recorded helper can still do. `running`: it may still release the reservation.
 * `exited`: it is provably gone, so only a client that finds the daemon ready, or
 * `resetDaemonArtifactsAsync()`, removes the reservation. `unknown`: the reservation records no helper,
 * for example because an older client wrote it.
 * @beta
 */
export type DaemonStartupHelperState = 'running' | 'exited' | 'unknown';

/** A daemon startup reservation (`<lockfilePath>.starting`), as reported by diagnostics. @beta */
export interface IDaemonStartupReservationInfo {
  /** The reservation file. */
  readonly path: string;
  /** The detached startup helper that releases the reservation once the daemon is ready, when recorded. */
  readonly helperPid?: number;
  /** Whether the helper can still release the reservation. */
  readonly helperState: DaemonStartupHelperState;
}

/**
 * Reads this workspace's startup reservation without changing it.
 * @returns `undefined` when no reservation exists.
 * @beta
 */
export function inspectDaemonStartupReservation(
  paths: IDaemonPaths
): IDaemonStartupReservationInfo | undefined {
  const reservation: IDaemonStartupReservation | undefined = readDaemonStartupReservation(paths);
  if (!reservation) return undefined;
  const { helper } = reservation;
  return {
    path: getDaemonStartupFilePath(paths),
    ...(helper ? { helperPid: helper.pid } : {}),
    helperState: getStartupHelperState(reservation)
  };
}

export function getStartupHelperState(reservation: IDaemonStartupReservation): DaemonStartupHelperState {
  if (!reservation.helper) return 'unknown';
  return isStartupHelperAlive(reservation.helper) ? 'running' : 'exited';
}

function isStartupHelperAlive(helper: IDaemonStartupHelper): boolean {
  try {
    return isOwnerProcessAlive(helper);
  } catch {
    // For example EPERM: the PID exists but belongs to another user, so the helper cannot be shown to be gone.
    return true;
  }
}

/**
 * Removes a retained startup reservation on the evidence that its helper waits for: a daemon that completed
 * hello/ping at this endpoint. This also requires `pid` to be the live owner in the ownership record, so the
 * endpoint cannot be handed to a second launch. The caller must hold the start mutex; a reservation made
 * after this check is never removed.
 * @returns true when no reservation remains.
 */
export function resolveStartupReservationForReadyDaemon(
  paths: IDaemonPaths,
  pid: number | undefined
): boolean {
  const reservation: IDaemonStartupReservation | undefined = readDaemonStartupReservation(paths);
  if (!reservation) return true;
  if (pid === undefined || !isAttestedDaemonOwner(paths, pid)) return false;
  return removeDaemonStartupIfUnchanged(paths, reservation);
}

/**
 * {@link resolveStartupReservationForReadyDaemon} for a connected client, taking the start mutex without waiting.
 * Returns false, keeping the reservation, while another client or this process holds the mutex.
 */
export async function tryResolveStartupReservationAsync(
  client: DaemonClient,
  paths: IDaemonPaths
): Promise<boolean> {
  const lock: IStartupLock | undefined = await tryAcquireStartupLockAsync(paths);
  if (!lock) return false;
  try {
    return resolveStartupReservationForReadyDaemon(paths, (await client.status).pid);
  } finally {
    await lock.releaseAsync();
  }
}

function isAttestedDaemonOwner(paths: IDaemonPaths, pid: number): boolean {
  const owner: IDaemonLockfile | undefined = readDaemonLockfile(paths.lockfilePath);
  if (!isDaemonOwnership(owner) || owner.pid !== pid || owner.socketPath !== paths.socketPath) return false;
  try {
    return isOwnerProcessAlive(owner);
  } catch {
    return false;
  }
}
