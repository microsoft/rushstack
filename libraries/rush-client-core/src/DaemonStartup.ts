// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import * as fs from 'node:fs';
import { setTimeout as delayAsync } from 'node:timers/promises';

import {
  DaemonTransportError,
  DaemonTransportErrorCode,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';

import type { IDaemonStartCommand } from './connectOrStartDaemon';
import { DaemonClient } from './DaemonClient';
import { DaemonClientError } from './DaemonClientError';

export interface IDaemonStartupOptions {
  readonly paths: IDaemonPaths;
  readonly startCommand: IDaemonStartCommand;
  readonly token: string;
  readonly timeoutMs: number;
}

/**
 * The detached startup helper recorded in a reservation. Only this process releases the reservation after
 * readiness, so once it is provably gone, waiting for it cannot help.
 */
export interface IDaemonStartupHelper {
  readonly pid: number;
  /** Recorded after the helper was spawned, so a later process that reuses the PID is detectable. */
  readonly startedAt: string;
}

/** A startup reservation as found on disk. */
export interface IDaemonStartupReservation {
  /** The exact contents, compared before removal; undefined when the entry cannot be read as a file. */
  readonly contents: string | undefined;
  /** Undefined for a reservation that does not record a helper, for example one written by an older client. */
  readonly helper: IDaemonStartupHelper | undefined;
}

interface IDaemonStartupRecord {
  readonly token: string;
  readonly helperPid: number;
  readonly helperStartedAt: string;
}

export function getDaemonStartupFilePath(paths: IDaemonPaths): string {
  return `${paths.lockfilePath}.starting`;
}

/**
 * Reserves startup for a spawned helper that has not yet received its options, so the reservation names
 * the helper before any launcher can start.
 */
export function reserveDaemonStartup(paths: IDaemonPaths, helper: IDaemonStartupHelper): string {
  const token: string = randomUUID();
  const record: IDaemonStartupRecord = { token, helperPid: helper.pid, helperStartedAt: helper.startedAt };
  fs.writeFileSync(getDaemonStartupFilePath(paths), JSON.stringify(record), { flag: 'wx', mode: 0o600 });
  return token;
}

export function readDaemonStartupReservation(paths: IDaemonPaths): IDaemonStartupReservation | undefined {
  const filePath: string = getDaemonStartupFilePath(paths);
  let contents: string;
  try {
    contents = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    // Any other entry (for example a directory or a dangling link) still refuses another launch.
    return isNotFound(error) && !fs.lstatSync(filePath, { throwIfNoEntry: false })
      ? undefined
      : { contents: undefined, helper: undefined };
  }
  const record: IDaemonStartupRecord | undefined = parseStartupRecord(contents);
  return {
    contents,
    helper: record && { pid: record.helperPid, startedAt: record.helperStartedAt }
  };
}

/**
 * Removes `reservation` unless it changed since it was read, and reports whether it is gone.
 * The caller must hold the start mutex, so the only concurrent change is the helper's own release.
 */
export function removeDaemonStartupIfUnchanged(
  paths: IDaemonPaths,
  reservation: IDaemonStartupReservation
): boolean {
  const current: IDaemonStartupReservation | undefined = readDaemonStartupReservation(paths);
  if (!current) return true;
  if (reservation.contents === undefined || current.contents !== reservation.contents) return false;
  unlinkIfPresent(getDaemonStartupFilePath(paths));
  return true;
}

function assertReservation(paths: IDaemonPaths, token: string): void {
  const contents: string = fs.readFileSync(getDaemonStartupFilePath(paths), 'utf8');
  if (parseStartupRecord(contents)?.token !== token) {
    throw new DaemonClientError('startupFailed', 'The daemon startup reservation changed ownership.');
  }
}

/**
 * Releases the helper's own reservation. A missing reservation is already resolved: clients remove one only
 * under the start mutex, after the same readiness evidence the helper waits for.
 */
export function releaseDaemonStartup(paths: IDaemonPaths, token: string): void {
  try {
    assertReservation(paths, token);
  } catch (error) {
    if (isNotFound(error)) return;
    throw error;
  }
  unlinkIfPresent(getDaemonStartupFilePath(paths));
}

function parseStartupRecord(contents: string): IDaemonStartupRecord | undefined {
  let record: unknown;
  try {
    record = JSON.parse(contents);
  } catch {
    return undefined;
  }
  if (typeof record !== 'object' || record === null) return undefined;
  const { token, helperPid, helperStartedAt } = record as Partial<
    Record<keyof IDaemonStartupRecord, unknown>
  >;
  return typeof token === 'string' &&
    typeof helperPid === 'number' &&
    Number.isSafeInteger(helperPid) &&
    helperPid > 0 &&
    typeof helperStartedAt === 'string' &&
    Number.isFinite(Date.parse(helperStartedAt))
    ? { token, helperPid, helperStartedAt }
    : undefined;
}

function unlinkIfPresent(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/**
 * The startup helper's wait between readiness attempts. Until the daemon publishes its endpoint, an attempt
 * fails at once, so a short fixed wait costs little. The helper then releases the reservation within about this
 * long of readiness, instead of up to a doubled backoff step later.
 */
const READINESS_POLL_INTERVAL_MS: number = 50;

/**
 * Runs independently of the requesting client. Once spawn succeeds, only protocol readiness releases
 * the reservation: an arbitrary launcher may outlive its parent or spawn descendants.
 * Failure before readiness deliberately leaves the reservation instead of guessing that a PID is safe.
 * The reservation records this helper, so once it exits, the next client that starts the daemon takes the
 * reservation over instead of waiting for a release that cannot happen.
 */
export async function runDaemonStartupAsync(options: IDaemonStartupOptions): Promise<void> {
  const { paths, startCommand: start, token, timeoutMs } = options;
  assertReservation(paths, token);
  let child: ChildProcess;
  let closed: Promise<void> | undefined;
  try {
    child = spawn(start.command, [...start.args], {
      cwd: start.cwd,
      env: start.environment,
      detached: true,
      stdio: ['ignore', 1, 2],
      windowsHide: true
    });
    closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
    await once(child, 'spawn');
  } catch (error) {
    // No executable was started, so this helper can safely release its own reservation.
    if (closed) await closed;
    releaseDaemonStartup(paths, token);
    throw error;
  }
  child.unref();

  const deadline: number = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // Sampled before connecting: a launcher can exit because another daemon published this endpoint first (for
    // example one that an abandoned reservation's helper launched before a client took the reservation over).
    // That daemon already listens by then, so the attempt below finds it.
    const launcherExited: boolean = child.exitCode !== null || child.signalCode !== null;
    let client: DaemonClient | undefined;
    try {
      client = await DaemonClient.connectAsync({
        socketPath: paths.socketPath,
        timeoutMs: Math.min(1000, Math.max(1, deadline - Date.now()))
      });
    } catch (error) {
      if (
        !(
          (error instanceof DaemonTransportError &&
            (error.code === DaemonTransportErrorCode.connectionRefused ||
              error.code === DaemonTransportErrorCode.connectionTimeout)) ||
          (error instanceof DaemonClientError && (error.code === 'timeout' || error.code === 'disconnected'))
        )
      ) {
        throw error;
      }
    }
    if (client) {
      try {
        releaseDaemonStartup(paths, token);
      } finally {
        await client.closeAsync();
      }
      return;
    }
    if (launcherExited) {
      await closed;
      throw new DaemonClientError(
        'startupFailed',
        `Launcher ${describeExit(child)} before protocol readiness; startup reservation retained.`
      );
    }
    await delayAsync(Math.min(READINESS_POLL_INTERVAL_MS, Math.max(1, deadline - Date.now())));
  }
  throw new DaemonClientError(
    'startupFailed',
    `Timed out awaiting daemon readiness; startup reservation retained at ${getDaemonStartupFilePath(paths)}.`
  );
}

/** Describes how a child process ended, for example "exited (1)" or "was terminated (SIGKILL)". */
export function describeExit(child: ChildProcess): string {
  return child.signalCode ? `was terminated (${child.signalCode})` : `exited (${child.exitCode})`;
}
