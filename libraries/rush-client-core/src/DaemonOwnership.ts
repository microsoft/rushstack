// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import type { IDaemonLockfile, IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { DaemonClientError } from './DaemonClientError';
import { getDaemonStartupFilePath } from './DaemonStartup';
import { isProcessStartedAfter } from './ProcessStartTime';
import { tryAcquireStartupLockAsync, type IStartupLock } from './StartupLock';

const PROBE_TIMEOUT_MS: number = 1000;
const RESET_RETRY_MS: number = 100;

/** Printed wherever automatic recovery fails closed. */
export const DAEMON_RESET_HINT: string =
  'If no daemon is running for this workspace, run "rush-client daemon stop --force" to remove its stale files.';

export type DaemonOwnership = Pick<IDaemonLockfile, 'pid' | 'startedAt'>;

type OwnershipState =
  | { readonly kind: 'absent' }
  | { readonly kind: 'corrupt'; readonly raw: string }
  | { readonly kind: 'owned'; readonly raw: string; readonly owner: DaemonOwnership };

/** Options for {@link resetDaemonArtifactsAsync}. @beta */
export interface IDaemonArtifactResetOptions {
  /** How long to keep re-checking a bound listener, live owner, or held start mutex. Defaults to 0. */
  readonly waitTimeoutMs?: number;
}

/** The result of {@link resetDaemonArtifactsAsync}. @beta */
export interface IDaemonArtifactResetResult {
  /** The stale files that were removed; empty when nothing was left behind. */
  readonly removedPaths: ReadonlyArray<string>;
}

export function isDaemonOwnership(record: unknown): record is DaemonOwnership {
  return (
    typeof record === 'object' &&
    record !== null &&
    'pid' in record &&
    typeof record.pid === 'number' &&
    Number.isSafeInteger(record.pid) &&
    record.pid > 0 &&
    'startedAt' in record &&
    typeof record.startedAt === 'string' &&
    Number.isFinite(Date.parse(record.startedAt))
  );
}

export function readDaemonOwnership(lockfilePath: string): DaemonOwnership | undefined {
  let record: unknown;
  try {
    record = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return undefined;
    throw new DaemonClientError(
      'startupFailed',
      `Cannot safely read ${lockfilePath}; refusing automatic reclaim. ${DAEMON_RESET_HINT}`,
      { cause: error }
    );
  }
  if (!isDaemonOwnership(record)) {
    throw new DaemonClientError(
      'startupFailed',
      `Invalid daemon ownership record in ${lockfilePath}; refusing automatic reclaim. ${DAEMON_RESET_HINT}`
    );
  }
  return { pid: record.pid, startedAt: record.startedAt };
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (hasErrorCode(error, 'ESRCH')) return false;
    throw error;
  }
}

/**
 * True unless the recorded owner is demonstrably gone: its PID does not exist, or the process now using
 * that PID started after the record was written (PID reuse).
 */
export function isOwnerProcessAlive(owner: { readonly pid: number; readonly startedAt?: unknown }): boolean {
  if (!isProcessAlive(owner.pid)) return false;
  return !(typeof owner.startedAt === 'string' && isProcessStartedAfter(owner.pid, owner.startedAt));
}

/**
 * Makes stale ownership reclaimable when that is provably safe. The caller must hold the start mutex and
 * have observed no startup reservation, so no legitimate daemon can be between bind and record publication;
 * a refused connection then proves no listener exists.
 */
export async function reclaimAbandonedOwnershipAsync(paths: IDaemonPaths): Promise<void> {
  const state: OwnershipState = inspectOwnership(paths.lockfilePath);
  if (state.kind === 'owned' && !isProcessAlive(state.owner.pid)) return;
  if (state.kind === 'owned' && !isProcessStartedAfter(state.owner.pid, state.owner.startedAt)) {
    throw new DaemonClientError(
      'startupFailed',
      `PID ${state.owner.pid} still exists but the daemon is not ready. It may be a daemon that is still shutting down, or a reused PID; refusing to kill it or remove ${paths.lockfilePath}. ${DAEMON_RESET_HINT}`
    );
  }
  if (state.kind === 'absent' && (process.platform === 'win32' || !fs.existsSync(paths.socketPath))) return;
  if (!(await isEndpointUnboundAsync(paths.socketPath))) {
    throw new DaemonClientError(
      'startupFailed',
      `${describeOwnership(state, paths)}, but ${paths.socketPath} did not refuse a connection; refusing automatic reclaim. ${DAEMON_RESET_HINT}`
    );
  }
  // The transport reclaim then removes the unbound socket under its own two-factor checks.
  if (state.kind !== 'absent') removeIfUnchanged(paths.lockfilePath, state.raw);
}

/**
 * Removes this workspace's leftover daemon files (ownership record, socket, and startup reservation)
 * after verifying that no listener is bound and that the recorded owner, if any, is gone.
 * @remarks Never kills a process. Fails when another client holds the start mutex, a listener is bound,
 * or the recorded owner is alive; with `waitTimeoutMs`, those conditions are re-checked until the deadline
 * (for example, while a daemon that just acknowledged shutdown finishes its cleanup).
 * @beta
 */
export async function resetDaemonArtifactsAsync(
  paths: IDaemonPaths,
  options?: IDaemonArtifactResetOptions
): Promise<IDaemonArtifactResetResult> {
  const deadline: number = Date.now() + (options?.waitTimeoutMs ?? 0);
  while (true) {
    const outcome: IDaemonArtifactResetResult | DaemonClientError = await tryResetDaemonArtifactsAsync(paths);
    if (!(outcome instanceof DaemonClientError)) return outcome;
    if (Date.now() >= deadline) throw outcome;
    await delayAsync(Math.min(RESET_RETRY_MS, Math.max(1, deadline - Date.now())));
  }
}

/** Returns a (not thrown) error for conditions that may clear on their own. */
async function tryResetDaemonArtifactsAsync(
  paths: IDaemonPaths
): Promise<IDaemonArtifactResetResult | DaemonClientError> {
  if (!fs.existsSync(path.dirname(paths.lockfilePath))) return { removedPaths: [] };
  const lock: IStartupLock | undefined = await tryAcquireStartupLockAsync(paths);
  if (!lock) {
    return new DaemonClientError(
      'startupFailed',
      `Another client is starting the daemon for ${paths.lockfilePath}; retry after it finishes.`
    );
  }
  try {
    if (!(await isEndpointUnboundAsync(paths.socketPath))) {
      return new DaemonClientError(
        'startupFailed',
        `A process is still listening at ${paths.socketPath}; use "rush-client daemon stop" to stop it.`
      );
    }
    const state: OwnershipState = inspectOwnership(paths.lockfilePath);
    if (state.kind === 'owned' && isOwnerProcessAlive(state.owner)) {
      return new DaemonClientError(
        'startupFailed',
        `PID ${state.owner.pid} still owns ${paths.lockfilePath}; it may be a daemon that is shutting down. Wait for it to exit (or stop that process yourself), then retry. No process was killed.`
      );
    }
    const removedPaths: string[] = [];
    if (state.kind !== 'absent' && removeIfUnchanged(paths.lockfilePath, state.raw)) {
      removedPaths.push(paths.lockfilePath);
    }
    const others: string[] = [getDaemonStartupFilePath(paths)];
    if (process.platform !== 'win32') others.push(paths.socketPath);
    for (const filePath of others) {
      if (tryUnlink(filePath)) removedPaths.push(filePath);
    }
    return { removedPaths };
  } finally {
    await lock.releaseAsync();
  }
}

/** Resolves true only when a connection attempt proves that nothing listens at the endpoint. */
export function isEndpointUnboundAsync(socketPath: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket: net.Socket = net.createConnection(socketPath);
    const settle = (unbound: boolean): void => {
      socket.destroy();
      resolve(unbound);
    };
    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once('connect', () => settle(false));
    socket.once('timeout', () => settle(false));
    socket.once('error', (error) => settle(hasErrorCode(error, 'ECONNREFUSED') || hasErrorCode(error, 'ENOENT')));
  });
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function inspectOwnership(lockfilePath: string): OwnershipState {
  let raw: string;
  try {
    raw = fs.readFileSync(lockfilePath, 'utf8');
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return { kind: 'absent' };
    throw new DaemonClientError(
      'startupFailed',
      `Cannot safely read ${lockfilePath}; refusing automatic reclaim. ${DAEMON_RESET_HINT}`,
      { cause: error }
    );
  }
  let record: unknown;
  try {
    record = JSON.parse(raw);
  } catch {
    return { kind: 'corrupt', raw };
  }
  return isDaemonOwnership(record)
    ? { kind: 'owned', raw, owner: { pid: record.pid, startedAt: record.startedAt } }
    : { kind: 'corrupt', raw };
}

function describeOwnership(state: OwnershipState, paths: IDaemonPaths): string {
  switch (state.kind) {
    case 'absent':
      return `Socket ${paths.socketPath} has no ownership record`;
    case 'corrupt':
      return `Invalid daemon ownership record in ${paths.lockfilePath}`;
    default:
      return `PID ${state.owner.pid} was reused by a process that started after ${paths.lockfilePath} was written`;
  }
}

function removeIfUnchanged(filePath: string, expected: string): boolean {
  let current: string;
  try {
    current = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return false;
    throw error;
  }
  if (current !== expected) {
    throw new DaemonClientError('startupFailed', `${filePath} changed during reclaim; refusing to remove it.`);
  }
  return tryUnlink(filePath);
}

function tryUnlink(filePath: string): boolean {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return false;
    throw error;
  }
}
