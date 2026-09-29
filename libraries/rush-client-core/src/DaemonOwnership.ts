// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import {
  DaemonTransportError,
  DaemonTransportErrorCode,
  reapReusedOwnerOperationGroupsAsync,
  reclaimStaleDaemonAsync,
  type IDaemonLockfile,
  type IDaemonPaths,
  type IDaemonReclaimOptions
} from '@rushstack/rush-daemon-transport';

import { DaemonClientError } from './DaemonClientError';
import {
  createUnresponsiveOwnerError,
  describeRecordOwner,
  describeUnresponsiveOwner,
  diagnoseDaemonOwner,
  getDaemonOwnerHint,
  LiveDaemonOwnerError,
  type DaemonOwnerHintPurpose,
  type IDaemonOwnerDiagnosis
} from './DaemonOwnerDiagnosis';
import { getDaemonStartupFilePath } from './DaemonStartup';
import { isProcessStartedAfter } from './ProcessStartTime';
import { clearReclaimedDaemonReport } from './ReclaimedDaemonLog';
import { tryAcquireStartupLockAsync, type IStartupLock } from './StartupLock';

const PROBE_TIMEOUT_MS: number = 1000;
const RESET_RETRY_MS: number = 100;

/** Printed wherever automatic recovery fails closed. */
export const DAEMON_RESET_HINT: string =
  'If "rush-client daemon status" cannot connect, run "rush-client daemon stop --force" to remove this workspace\'s stale daemon files.';

export type DaemonOwnership = Pick<IDaemonLockfile, 'pid' | 'startedAt'>;

type OwnershipState =
  | { readonly kind: 'absent' }
  | { readonly kind: 'corrupt'; readonly raw: string }
  | { readonly kind: 'owned'; readonly raw: string; readonly owner: DaemonOwnership };

/** Options for {@link resetDaemonArtifactsAsync}. @beta */
export interface IDaemonArtifactResetOptions extends IDaemonReclaimOptions {
  /**
   * How long to keep re-checking a bound listener, a live owner, a held start mutex, or another process that
   * reclaims the files of an owner that exited. Defaults to 0.
   */
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
 * Describes the live process that this workspace's daemon ownership record names, for a command that could not
 * use or stop the daemon: on the first line, what that process is doing (on Linux, for example that a signal
 * stopped it), and on the second, what to do about it. It never signals that process.
 * @returns `undefined` when there is no record, it cannot be read, or the process that it names is gone.
 * @beta
 */
export function describeLiveDaemonOwner(
  paths: IDaemonPaths,
  purpose: DaemonOwnerHintPurpose
): string | undefined {
  const owner: DaemonOwnership | undefined = tryReadLiveOwner(paths);
  if (!owner) return undefined;
  const diagnosis: IDaemonOwnerDiagnosis = diagnoseDaemonOwner(owner.pid, paths);
  const description: string = describeRecordOwner(diagnosis, paths.lockfilePath);
  return `${description}\n${getDaemonOwnerHint(diagnosis, paths.lockfilePath, purpose)}`;
}

/**
 * The error for this workspace's daemon when it still runs but no client can reach it at the endpoint, for
 * example because its socket file was deleted: the process that the ownership record names is rushd, and it has
 * that record open, as a daemon does for as long as it owns it (which only Linux shows). Otherwise `undefined`.
 */
export function findUnreachableDaemon(paths: IDaemonPaths): LiveDaemonOwnerError | undefined {
  const owner: DaemonOwnership | undefined = tryReadLiveOwner(paths);
  if (!owner) return undefined;
  const diagnosis: IDaemonOwnerDiagnosis = diagnoseDaemonOwner(owner.pid, paths);
  if (!diagnosis.isWorkspaceDaemon) return undefined;
  return new LiveDaemonOwnerError(
    describeUnresponsiveOwner(diagnosis),
    getDaemonOwnerHint(diagnosis, paths.lockfilePath, 'use')
  );
}

/**
 * The recorded owner, or `undefined` when there is no readable record or the process that it names is gone.
 */
function tryReadLiveOwner(paths: IDaemonPaths): DaemonOwnership | undefined {
  try {
    const owner: DaemonOwnership | undefined = readDaemonOwnership(paths.lockfilePath);
    return owner && isOwnerProcessAlive(owner) ? owner : undefined;
  } catch {
    // For example EPERM: a process that another user runs is no evidence about this workspace's daemon.
    return undefined;
  }
}

/**
 * Makes stale ownership reclaimable when that is provably safe. The caller must hold the start mutex and have
 * observed no startup reservation, or taken over one whose helper is gone. A daemon publishes its endpoint only
 * after it listens, so a refused connection then proves no listener exists. A daemon that a gone helper
 * launched may still publish later; of two daemons that publish, the second finds the first and exits.
 * When a process that started after the record was written now has the recorded PID, the owner exited without
 * shutting down, and once its record is gone no reclaim finds the operations that it recorded. So they are
 * stopped first, with the proof that `reclaimStaleDaemonAsync` requires of each group but never the group of
 * that process, and reported to `options.onOrphansReaped` (or else as `RUSH_DAEMON_ORPHANS_REAPED` warnings).
 * If they cannot be stopped, it throws and removes nothing.
 */
export async function reclaimAbandonedOwnershipAsync(
  paths: IDaemonPaths,
  options?: IDaemonReclaimOptions
): Promise<void> {
  const state: OwnershipState = inspectOwnership(paths.lockfilePath);
  if (state.kind === 'owned' && !isProcessAlive(state.owner.pid)) return;
  if (state.kind === 'owned' && !isProcessStartedAfter(state.owner.pid, state.owner.startedAt)) {
    throw createUnresponsiveOwnerError(state.owner.pid, paths);
  }
  if (state.kind === 'absent' && (process.platform === 'win32' || !fs.existsSync(paths.socketPath))) return;
  if (!(await isEndpointUnboundAsync(paths.socketPath))) {
    throw new DaemonClientError(
      'startupFailed',
      `${describeOwnership(state, paths)}, but ${paths.socketPath} did not refuse a connection; refusing automatic reclaim. ${DAEMON_RESET_HINT}`
    );
  }
  if (state.kind === 'owned') await reapReusedOwnerOperationGroupsAsync(paths, state.owner.pid, options);
  // The transport reclaim then removes the unbound socket under its own two-factor checks.
  if (state.kind !== 'absent') removeIfUnchanged(paths.lockfilePath, state.raw);
}

/**
 * Removes this workspace's leftover daemon files (ownership record, socket, and startup reservation)
 * after verifying that no listener is bound and that the recorded owner, if any, is gone.
 * @remarks When the recorded PID no longer exists, or a process that started after the record was written has
 * it now, the owner exited without shutting down and may have left operations running, which only its records
 * name. So the reset first stops them, as the next daemon start would (`reclaimStaleDaemonAsync`), but never
 * the process group of a process that has the recorded PID now, and reports each set of process groups that it
 * stops to `options.onOrphansReaped`, or else as a `RUSH_DAEMON_ORPHANS_REAPED` process warning. When they
 * cannot be stopped, it throws and removes nothing. Otherwise it never signals a process. Fails when another
 * client holds the start mutex, a listener is bound, the recorded owner is alive, or another process reclaims
 * the files of the owner that exited; with `waitTimeoutMs`, those conditions are re-checked until the deadline
 * (for example, while a daemon that just acknowledged shutdown finishes its cleanup). A reset also clears the
 * report of a daemon that a client reclaimed after it exited without shutting down
 * ({@link findReclaimedDaemonPid}).
 * @beta
 */
export async function resetDaemonArtifactsAsync(
  paths: IDaemonPaths,
  options?: IDaemonArtifactResetOptions
): Promise<IDaemonArtifactResetResult> {
  const deadline: number = Date.now() + (options?.waitTimeoutMs ?? 0);
  while (true) {
    const outcome: IDaemonArtifactResetResult | DaemonClientError = await tryResetDaemonArtifactsAsync(
      paths,
      options
    );
    if (!(outcome instanceof DaemonClientError)) return outcome;
    if (Date.now() >= deadline) throw outcome;
    await delayAsync(Math.min(RESET_RETRY_MS, Math.max(1, deadline - Date.now())));
  }
}

/** Returns a (not thrown) error for conditions that may clear on their own. */
async function tryResetDaemonArtifactsAsync(
  paths: IDaemonPaths,
  options: IDaemonReclaimOptions | undefined
): Promise<IDaemonArtifactResetResult | DaemonClientError> {
  if (!fs.existsSync(path.dirname(paths.lockfilePath))) return { removedPaths: [] };
  const lock: IStartupLock | undefined = await tryAcquireStartupLockAsync(paths);
  if (!lock) {
    return new DaemonClientError(
      'startupFailed',
      `Another client is starting or resetting the daemon for ${paths.lockfilePath}; retry after it finishes.`
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
      const diagnosis: IDaemonOwnerDiagnosis = diagnoseDaemonOwner(state.owner.pid, paths);
      return new LiveDaemonOwnerError(
        `${describeRecordOwner(diagnosis, paths.lockfilePath)} No process was killed.`,
        getDaemonOwnerHint(diagnosis, paths.lockfilePath, 'stop')
      );
    }
    // A reclaim removes the record and the socket itself, right after its own checks.
    const reclaimed: ReadonlySet<string> | DaemonClientError | undefined = await stopOwnerLeftoversAsync(
      paths,
      state,
      options
    );
    if (reclaimed instanceof DaemonClientError) return reclaimed;
    const removedPaths: string[] = [];
    if (
      reclaimed
        ? reclaimed.has(paths.lockfilePath)
        : state.kind !== 'absent' && removeIfUnchanged(paths.lockfilePath, state.raw)
    ) {
      removedPaths.push(paths.lockfilePath);
    }
    const startupFilePath: string = getDaemonStartupFilePath(paths);
    if (tryUnlink(startupFilePath)) removedPaths.push(startupFilePath);
    if (
      process.platform !== 'win32' &&
      (reclaimed ? reclaimed.has(paths.socketPath) : tryUnlink(paths.socketPath))
    ) {
      removedPaths.push(paths.socketPath);
    }
    clearReclaimedDaemonReport(paths);
    return { removedPaths };
  } finally {
    await lock.releaseAsync();
  }
}

/**
 * Stops what an owner that exited without shutting down left running, before its record is removed. When its PID
 * no longer exists, that is a reclaim ({@link reclaimExitedOwnerAsync}), which returns the files that it
 * removed. When a process that started after the record was written has its PID (the caller has ruled out a
 * live owner), only the operation groups that the owner recorded are stopped, never that process, and the
 * caller removes the record. Returns a (not thrown) error while another process reclaims the owner's files.
 */
async function stopOwnerLeftoversAsync(
  paths: IDaemonPaths,
  state: OwnershipState,
  options: IDaemonReclaimOptions | undefined
): Promise<ReadonlySet<string> | DaemonClientError | undefined> {
  if (state.kind !== 'owned') return undefined;
  const ownerPid: number = state.owner.pid;
  if (!isProcessAlive(ownerPid)) return await reclaimExitedOwnerAsync(paths, ownerPid, options);
  return await tryReclaimOwnerAsync(paths, ownerPid, () =>
    reapReusedOwnerOperationGroupsAsync(paths, ownerPid, { onOrphansReaped: options?.onOrphansReaped })
  );
}

/**
 * Stops the operations that an owner that exited left running, and removes its record and socket, as the next
 * daemon start would. Returns the files that it removed, or a (not thrown) error while another process
 * reclaims them. Removing the record without this would strand those operations: nothing else names them.
 */
async function reclaimExitedOwnerAsync(
  paths: IDaemonPaths,
  ownerPid: number,
  options: IDaemonReclaimOptions | undefined
): Promise<ReadonlySet<string> | DaemonClientError> {
  const files: string[] =
    process.platform === 'win32' ? [paths.lockfilePath] : [paths.lockfilePath, paths.socketPath];
  const present: string[] = files.filter((filePath) => isPresent(filePath));
  const failure: DaemonClientError | undefined = await tryReclaimOwnerAsync(paths, ownerPid, () =>
    reclaimStaleDaemonAsync(paths, { onOrphansReaped: options?.onOrphansReaped })
  );
  return failure ?? new Set(present.filter((filePath) => !isPresent(filePath)));
}

/**
 * Runs `reclaimAsync` for the files of owner `ownerPid`, which exited without shutting down. Returns a (not
 * thrown) error while another process reclaims them, and throws when the operations that the owner left running
 * cannot be stopped.
 */
async function tryReclaimOwnerAsync(
  paths: IDaemonPaths,
  ownerPid: number,
  reclaimAsync: () => Promise<void>
): Promise<DaemonClientError | undefined> {
  try {
    await reclaimAsync();
    return undefined;
  } catch (error) {
    // Another process holds the reclaim lock, or a daemon started since the checks above.
    if (
      error instanceof DaemonTransportError &&
      error.code === DaemonTransportErrorCode.daemonAlreadyRunning
    ) {
      return new DaemonClientError(
        'startupFailed',
        `Another process is reclaiming the files of rushd (PID ${ownerPid}), which exited without shutting down, or a daemon is starting at ${paths.socketPath}; retry after it finishes.`,
        { cause: error }
      );
    }
    const reason: string = error instanceof Error ? error.message : String(error);
    throw new DaemonClientError(
      'startupFailed',
      `rushd (PID ${ownerPid}) exited without shutting down, and stopping the operations that it left running failed, so no file was removed: ${reason}`,
      { cause: error }
    );
  }
}

function isPresent(filePath: string): boolean {
  return fs.lstatSync(filePath, { throwIfNoEntry: false }) !== undefined;
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
    socket.once('error', (error) =>
      settle(hasErrorCode(error, 'ECONNREFUSED') || hasErrorCode(error, 'ENOENT'))
    );
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
    throw new DaemonClientError(
      'startupFailed',
      `${filePath} changed during reclaim; refusing to remove it.`
    );
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
