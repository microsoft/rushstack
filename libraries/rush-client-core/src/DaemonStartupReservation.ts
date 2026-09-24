// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';

import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { DaemonClientError } from './DaemonClientError';

/**
 * How long a reservation may outlive its own startup deadline while a recorded process is still alive.
 * This bounds PID reuse and a wedged launcher; the transport's bind-time ownership check still prevents
 * two daemons from serving one endpoint if the original launcher later resumes.
 */
export const DAEMON_STARTUP_RESERVATION_GRACE_MS: number = 60000;

/** The durable `<lockfile>.starting` record. */
export interface IDaemonStartupReservation {
  readonly token: string;
  readonly createdAt: string;
  readonly timeoutMs: number;
  /** The process responsible for releasing the reservation: the starting client, then the detached helper. */
  readonly ownerPid: number;
  readonly ownerStartedAt: string;
  /** The explicit launcher (typically the daemon itself) once the helper has spawned it. */
  readonly launcherPid?: number;
}

export function getDaemonStartupFilePath(paths: IDaemonPaths): string {
  return `${paths.lockfilePath}.starting`;
}

export function reserveDaemonStartup(paths: IDaemonPaths, timeoutMs: number): string {
  const now: string = new Date().toISOString();
  const reservation: IDaemonStartupReservation = {
    token: randomUUID(),
    createdAt: now,
    timeoutMs,
    ownerPid: process.pid,
    ownerStartedAt: new Date(Date.now() - process.uptime() * 1000).toISOString()
  };
  fs.writeFileSync(getDaemonStartupFilePath(paths), JSON.stringify(reservation), {
    flag: 'wx',
    mode: 0o600
  });
  return reservation.token;
}

/** Returns the parsed reservation, `undefined` if absent, or `null` if present but not a recognized record. */
export function readDaemonStartupReservation(
  paths: IDaemonPaths
): IDaemonStartupReservation | undefined | null {
  let text: string;
  try {
    text = fs.readFileSync(getDaemonStartupFilePath(paths), 'utf8');
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return undefined;
    throw error;
  }
  try {
    const record: unknown = JSON.parse(text);
    return isReservation(record) ? record : null;
  } catch {
    return null;
  }
}

function assertOwnedReservation(paths: IDaemonPaths, token: string): IDaemonStartupReservation {
  const reservation: IDaemonStartupReservation | undefined | null = readDaemonStartupReservation(paths);
  if (!reservation || reservation.token !== token) {
    throw new DaemonClientError('startupFailed', 'The daemon startup reservation changed ownership.');
  }
  return reservation;
}

export function assertDaemonStartupReservation(paths: IDaemonPaths, token: string): void {
  assertOwnedReservation(paths, token);
}

/** Atomically records a new owner or launcher PID, but only while the token still owns the reservation. */
export function updateDaemonStartupReservation(
  paths: IDaemonPaths,
  token: string,
  update: Partial<Pick<IDaemonStartupReservation, 'ownerPid' | 'ownerStartedAt' | 'launcherPid'>>
): void {
  const reservation: IDaemonStartupReservation = assertOwnedReservation(paths, token);
  const filePath: string = getDaemonStartupFilePath(paths);
  const temporaryPath: string = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify({ ...reservation, ...update }), {
    flag: 'wx',
    mode: 0o600
  });
  try {
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
}

export function releaseDaemonStartup(paths: IDaemonPaths, token: string): void {
  assertOwnedReservation(paths, token);
  fs.rmSync(getDaemonStartupFilePath(paths), { force: true });
}

/** True if the process responsible for releasing the reservation is gone. */
export function isDaemonStartupOwnerGone(reservation: IDaemonStartupReservation): boolean {
  return !isProcessAlive(reservation.ownerPid);
}

/**
 * A reservation is stale when neither its owner nor its launcher is alive, or when it has outlived its own
 * startup deadline by the grace period. Unrecognized (for example legacy token-only) records have no
 * verifiable owner, so only their age counts.
 */
export function isDaemonStartupReservationStale(paths: IDaemonPaths, timeoutMs: number): boolean {
  const reservation: IDaemonStartupReservation | undefined | null = readDaemonStartupReservation(paths);
  if (reservation === undefined) return false;
  if (reservation === null) {
    const stats: fs.Stats | undefined = fs.statSync(getDaemonStartupFilePath(paths), {
      throwIfNoEntry: false
    });
    return !!stats && Date.now() - stats.mtimeMs > timeoutMs + DAEMON_STARTUP_RESERVATION_GRACE_MS;
  }
  const expiresAt: number =
    Date.parse(reservation.createdAt) + reservation.timeoutMs + DAEMON_STARTUP_RESERVATION_GRACE_MS;
  const launcherGone: boolean =
    reservation.launcherPid === undefined || !isProcessAlive(reservation.launcherPid);
  return (isDaemonStartupOwnerGone(reservation) && launcherGone) || Date.now() > expiresAt;
}

/**
 * Removes the reservation file only if it still matches the observed record, so a concurrent new
 * reservation is never removed.
 */
export function removeDaemonStartupReservation(
  paths: IDaemonPaths,
  observed: IDaemonStartupReservation | null
): void {
  const current: IDaemonStartupReservation | undefined | null = readDaemonStartupReservation(paths);
  if (current === undefined) return;
  if (observed === null ? current !== null : current?.token !== observed.token) return;
  fs.rmSync(getDaemonStartupFilePath(paths), { force: true });
}

export function describeDaemonStartupReservation(paths: IDaemonPaths): string {
  const reservation: IDaemonStartupReservation | undefined | null = readDaemonStartupReservation(paths);
  if (!reservation) return 'unrecognized reservation record';
  const ageSeconds: number = Math.max(0, Math.round((Date.now() - Date.parse(reservation.createdAt)) / 1000));
  const launcher: string =
    reservation.launcherPid === undefined
      ? 'not spawned'
      : `PID ${reservation.launcherPid} ${isProcessAlive(reservation.launcherPid) ? 'alive' : 'exited'}`;
  return (
    `owner PID ${reservation.ownerPid} ${isProcessAlive(reservation.ownerPid) ? 'alive' : 'exited'}, ` +
    `launcher ${launcher}, age ${ageSeconds}s`
  );
}

function isReservation(record: unknown): record is IDaemonStartupReservation {
  if (typeof record !== 'object' || record === null) return false;
  const value: Partial<Record<keyof IDaemonStartupReservation, unknown>> = record as Partial<
    Record<keyof IDaemonStartupReservation, unknown>
  >;
  return (
    typeof value.token === 'string' &&
    typeof value.createdAt === 'string' &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    typeof value.timeoutMs === 'number' &&
    Number.isFinite(value.timeoutMs) &&
    isPid(value.ownerPid) &&
    typeof value.ownerStartedAt === 'string' &&
    (value.launcherPid === undefined || isPid(value.launcherPid))
  );
}

function isPid(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the PID exists but belongs to another user.
    return !hasErrorCode(error, 'ESRCH');
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
