// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  readDaemonLockfile,
  type IDaemonLockfile,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';

import type { DaemonClient } from './DaemonClient';
import { isDaemonOwnership, isEndpointUnboundAsync, isOwnerProcessAlive } from './DaemonOwnership';
import {
  getDaemonStartupFilePath,
  readDaemonStartupReservation,
  removeDaemonStartupIfUnchanged,
  type IDaemonStartupHelper,
  type IDaemonStartupReservation
} from './DaemonStartup';
import { isProcessDefunct } from './ProcessStartTime';
import { tryAcquireStartupLockAsync, type IStartupLock } from './StartupLock';

/**
 * How long after a launch a client that starts the daemon may take over its reservation once the helper exited.
 * It matches the default startup timeout. A daemon that fails to start the same way each time, for example
 * because of a configuration error, is then launched at most once per interval however many clients start it;
 * the others are refused at once and can run without it.
 */
const ABANDONED_STARTUP_RELAUNCH_DELAY_MS: number = 15000;
/** Older reservations did not record their deadline; this matches the helper's minimum readiness timeout. */
const LEGACY_STARTUP_HELPER_READINESS_TIMEOUT_MS: number = 120_000;
/** A helper whose readiness deadline passed this long ago is treated as exited even if its PID is alive. */
const STARTUP_HELPER_READINESS_DEADLINE_GRACE_MS: number = 60_000;

/**
 * What a startup reservation's recorded helper can still do. `running`: it may still release the reservation.
 * `exited`: it is provably gone, so it never will. A client that finds the daemon ready removes the reservation,
 * and so does a client that starts the daemon after `relaunchAfter` while nothing listens at the endpoint (it
 * takes the reservation over). `unknown`: the reservation records no helper, for example because an older client
 * wrote it.
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
  /**
   * When the helper exited: the time (ISO 8601) after which a client that starts the daemon takes the reservation
   * over and launches the daemon again, provided that nothing listens at the endpoint then.
   */
  readonly relaunchAfter?: string;
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
  const helperState: DaemonStartupHelperState = getStartupHelperState(reservation);
  return {
    path: getDaemonStartupFilePath(paths),
    ...(helper ? { helperPid: helper.pid } : {}),
    helperState,
    ...(helper && helperState === 'exited'
      ? { relaunchAfter: new Date(getStartupRelaunchTime(helper)).toISOString() }
      : {})
  };
}

export function getStartupHelperState(reservation: IDaemonStartupReservation): DaemonStartupHelperState {
  if (!reservation.helper) return 'unknown';
  return isStartupHelperAlive(reservation.helper) ? 'running' : 'exited';
}

/**
 * The time (milliseconds since the epoch) after which a client that starts the daemon may take over a reservation
 * of `helper` once that helper exited. The helper was recorded when it was launched.
 */
export function getStartupRelaunchTime(helper: IDaemonStartupHelper): number {
  return Date.parse(helper.startedAt) + ABANDONED_STARTUP_RELAUNCH_DELAY_MS;
}

function isStartupHelperAlive(helper: IDaemonStartupHelper): boolean {
  if (Date.now() >= getStartupHelperReadinessExpirationTime(helper)) return false;
  if (isProcessDefunct(helper.pid)) return false;
  try {
    return isOwnerProcessAlive(helper);
  } catch {
    // For example EPERM: the PID exists but belongs to another user, so the helper cannot be shown to be gone.
    return true;
  }
}

function getStartupHelperReadinessExpirationTime(helper: IDaemonStartupHelper): number {
  const deadline: number = helper.readinessDeadline
    ? Date.parse(helper.readinessDeadline)
    : Date.parse(helper.startedAt) + LEGACY_STARTUP_HELPER_READINESS_TIMEOUT_MS;
  return deadline + STARTUP_HELPER_READINESS_DEADLINE_GRACE_MS;
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
 * Removes a reservation whose helper is provably gone, once its relaunch time has passed and while nothing listens
 * at the endpoint, so that the caller can launch the daemon again. Only the helper releases a reservation, so this
 * one would otherwise refuse every automatic start. The caller must hold the start mutex, which keeps other clients
 * from taking it over or from reserving startup at the same time.
 * @remarks A daemon that the gone helper launched may still be starting. Launching another is still safe: a daemon
 * publishes the endpoint only with link(2), or as the first instance of a named pipe, and only after it listens,
 * and it reclaims the endpoint only from an owner that is dead and does not accept a connection. So whichever
 * daemon publishes second finds the other and exits, and a helper releases its reservation once either daemon
 * completes hello/ping.
 * @returns true when this call removed `reservation`.
 */
export async function tryTakeOverAbandonedStartupReservationAsync(
  paths: IDaemonPaths,
  reservation: IDaemonStartupReservation
): Promise<boolean> {
  const { helper } = reservation;
  if (!helper || getStartupHelperState(reservation) !== 'exited') return false;
  if (Date.now() < getStartupRelaunchTime(helper)) return false;
  if (!(await isEndpointUnboundAsync(paths.socketPath))) return false;
  // The helper may have released its reservation just before it exited.
  const current: IDaemonStartupReservation | undefined = readDaemonStartupReservation(paths);
  if (!current || current.contents !== reservation.contents) return false;
  return removeDaemonStartupIfUnchanged(paths, current);
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
