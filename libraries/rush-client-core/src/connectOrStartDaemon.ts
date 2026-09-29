// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { DAEMON_LIFECYCLE_PROTOCOL_MINOR } from '@rushstack/rush-daemon-protocol';
import {
  DaemonTransportError,
  DaemonTransportErrorCode,
  reclaimStaleDaemonAsync,
  readDaemonLockfile,
  type IDaemonLockfile,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';

import { DaemonClient, type IDaemonClientConnectOptions } from './DaemonClient';
import { DaemonClientError } from './DaemonClientError';
import { getDaemonLogFilePath } from './DaemonLogFile';
import {
  DAEMON_RESET_HINT,
  hasErrorCode,
  isDaemonOwnership,
  isOwnerProcessAlive,
  readDaemonOwnership,
  reclaimAbandonedOwnershipAsync,
  type DaemonOwnership
} from './DaemonOwnership';
import {
  assertDaemonRuntimeFolderIsPrivate,
  ensureDaemonRuntimeFolder,
  withDaemonRuntimeFolder
} from './DaemonRuntimeFolder';
import {
  getDaemonStartupFilePath,
  readDaemonStartupReservation,
  reserveDaemonStartup,
  type IDaemonStartupHelper,
  type IDaemonStartupOptions,
  type IDaemonStartupReservation
} from './DaemonStartup';
import {
  getStartupHelperState,
  getStartupRelaunchTime,
  resolveStartupReservationForReadyDaemon,
  tryResolveStartupReservationAsync,
  tryTakeOverAbandonedStartupReservationAsync,
  type DaemonStartupHelperState
} from './DaemonStartupReservation';
import { tryAcquireStartupLockAsync, type IStartupLock } from './StartupLock';

interface IStartupHelper {
  readonly child: ChildProcess;
  readonly closed: Promise<void>;
}

/**
 * The minimum time the detached helper waits for a live launcher to become ready. It is independent of the
 * requesting client's deadline: a slow first start (for example while Windows scans newly installed files)
 * would otherwise leave a retained reservation that keeps every later client from using the ready daemon.
 */
const STARTUP_HELPER_READINESS_TIMEOUT_MS: number = 120_000;

/** Matches the default of {@link DaemonClient.shutdownAsync}. */
const DEFAULT_SHUTDOWN_TIMEOUT_MS: number = 15000;

/** A version-selected launch command supplied by the embedding application, never guessed by the core. @beta */
export interface IDaemonStartCommand {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>>;
}

/** Detached startup options. @beta */
export interface IConnectOrStartDaemonOptions extends Omit<IDaemonClientConnectOptions, 'socketPath'> {
  readonly paths: IDaemonPaths;
  /** Omit (together with resolveStartCommandAsync) to connect without auto-start. */
  readonly startCommand?: IDaemonStartCommand;
  /**
   * Resolves the start command only when a daemon must be started or replaced, so a warm connect never
   * loads launcher code. Ignored when startCommand is provided.
   */
  readonly resolveStartCommandAsync?: () => Promise<IDaemonStartCommand>;
  /**
   * Ownership captured before acknowledged shutdown. Wait for this record to disappear, change owner,
   * or have a demonstrably dead owner before connecting or starting. A live/reused owner times out safely.
   */
  readonly previousDaemon?: Pick<IDaemonLockfile, 'pid' | 'startedAt'>;
  /** Total startup/retry deadline. Defaults to 15000 milliseconds. */
  readonly startupTimeoutMs?: number;
  /** Cancels waiting/startup, without stopping startup already handed off to the detached helper. */
  readonly abortSignal?: AbortSignal;
}

/**
 * Connects or serializes first-start with a process-identity-aware mutex, then waits for actual protocol readiness.
 * @remarks Uses existing transport reclaim checks. Never kills a PID, reclaims a live owner, or retries a request.
 * The daemon is detached and its stdout/stderr are appended to `<lockfilePath>.log`.
 * @beta
 */
export async function connectOrStartDaemonAsync(
  options: IConnectOrStartDaemonOptions
): Promise<DaemonClient> {
  return await connectOrStartAsync(options, false);
}

/**
 * Like {@link connectOrStartDaemonAsync}, after `previousDaemon` answered a request with `retryAfterRestart`.
 * @remarks That daemon releases its ownership and then launches the successor it selected, and its process exits
 * only once that launch settles. A client that started a daemon meanwhile would race that launch, and if it won,
 * the successor would have this client's environment rather than the one the restart was for. So while the
 * previous process lives, this only connects; after it exits without a ready successor, this may start one.
 */
export async function connectToPlannedSuccessorAsync(
  options: IConnectOrStartDaemonOptions & { readonly previousDaemon: DaemonOwnership }
): Promise<DaemonClient> {
  return await connectOrStartAsync(options, true);
}

async function connectOrStartAsync(
  options: IConnectOrStartDaemonOptions,
  previousStartsSuccessor: boolean
): Promise<DaemonClient> {
  const timeoutMs: number = options.startupTimeoutMs ?? 15000;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 0x7fffffff) {
    throw new RangeError('startupTimeoutMs must be an integer between 1 and 2147483647.');
  }
  const deadline: number = Date.now() + timeoutMs;
  options.abortSignal?.throwIfAborted();
  assertDaemonRuntimeFolderIsPrivate(options.paths);
  await waitForPreviousDaemonAsync(options.paths, options.previousDaemon, deadline, options.abortSignal);
  const initial: DaemonClient | undefined = await tryConnectAsync(options, deadline);
  if (initial) return initial;
  if (previousStartsSuccessor && options.previousDaemon) {
    const successor: DaemonClient | undefined = await waitForPlannedSuccessorAsync(
      options,
      options.previousDaemon,
      deadline
    );
    if (successor) return successor;
  }
  const startCommand: IDaemonStartCommand | undefined =
    options.startCommand ?? (await options.resolveStartCommandAsync?.());
  if (!startCommand) {
    if (options.previousDaemon) {
      while (Date.now() < deadline) {
        await delayAsync(Math.min(100, Math.max(1, deadline - Date.now())), undefined, {
          signal: options.abortSignal
        });
        const successor: DaemonClient | undefined = await tryConnectAsync(options, deadline);
        if (successor) return successor;
      }
    }
    throw new DaemonClientError(
      'startupFailed',
      `No ready daemon at ${options.paths.socketPath}; auto-start is disabled.`
    );
  }
  return await startDaemonAsync({ ...options, startCommand, resolveStartCommandAsync: undefined }, deadline);
}

async function startDaemonAsync(
  options: IConnectOrStartDaemonOptions & { readonly startCommand: IDaemonStartCommand },
  deadline: number
): Promise<DaemonClient> {
  ensureDaemonRuntimeFolder(options.paths);
  let lock: IStartupLock | undefined;
  let backoffMs: number = 50;
  while (Date.now() < deadline) {
    options.abortSignal?.throwIfAborted();
    lock = await tryAcquireStartupLockAsync(options.paths);
    if (lock) break;
    await delayAsync(Math.min(backoffMs, Math.max(1, deadline - Date.now())), undefined, {
      signal: options.abortSignal
    });
    backoffMs = Math.min(500, backoffMs * 2);
    const ready: DaemonClient | undefined = await tryConnectAsync(options, deadline);
    if (ready) return ready;
  }
  if (!lock) throw startupError(options, 'timed out waiting for another starting client');
  try {
    const abandonedHelper: IDaemonStartupHelper | undefined = await waitForStartupReservationAsync(
      options,
      deadline
    );
    const ready: DaemonClient | undefined = await tryConnectAsync(options, deadline);
    if (ready) return ready;
    const replacement: DaemonClient | undefined = await replaceMismatchedDaemonAsync(options, deadline);
    if (replacement) return replacement;
    const handoff: DaemonClient | undefined = await waitForHandoffAsync(options, deadline);
    if (handoff) return handoff;
    if (Date.now() >= deadline) throw startupError(options, 'exceeded its deadline before reclaim');
    await reclaimAbandonedOwnershipAsync(options.paths);
    await reclaimStaleDaemonAsync(options.paths);
    if (Date.now() >= deadline) throw startupError(options, 'exceeded its deadline before spawn');
    options.abortSignal?.throwIfAborted();
    const helper: IStartupHelper = await spawnDetachedAsync(options, deadline, abandonedHelper);
    const { child } = helper;
    backoffMs = 50;
    while (Date.now() < deadline) {
      options.abortSignal?.throwIfAborted();
      const client: DaemonClient | undefined = await tryConnectAsync(options, deadline);
      if (client) {
        try {
          await waitForHelperExitAsync(helper, options, deadline);
          options.abortSignal?.throwIfAborted();
          return client;
        } catch (error) {
          await client.closeAsync();
          throw error;
        }
      }
      if ((child.exitCode !== null && child.exitCode !== 0) || child.signalCode !== null) {
        await waitForHelperExitAsync(helper, options, deadline);
        throw startupError(
          options,
          `failed: Unable to start ${options.startCommand.command}; helper exited (${child.exitCode ?? child.signalCode}) before readiness`
        );
      }
      await delayAsync(Math.min(backoffMs, Math.max(1, deadline - Date.now())), undefined, {
        signal: options.abortSignal
      });
      backoffMs = Math.min(500, backoffMs * 2);
    }
    throw startupError(options, 'timed out awaiting hello/ping readiness');
  } finally {
    await lock.releaseAsync();
  }
}

/**
 * Holding the start mutex, waits until no startup reservation remains. The helper releases its reservation once
 * the daemon completes hello/ping, and this client resolves it on the same evidence, so a daemon that became
 * ready after its helper stopped waiting is still used. Once the helper is provably gone, nothing else will
 * release the reservation: this client refuses another launch at once until the reservation's relaunch time, and
 * then takes the reservation over as soon as nothing listens at the endpoint. Otherwise another launch is refused
 * at the deadline.
 * @returns the helper of a reservation that this client took over, if any.
 */
async function waitForStartupReservationAsync(
  options: IConnectOrStartDaemonOptions,
  deadline: number
): Promise<IDaemonStartupHelper | undefined> {
  while (true) {
    options.abortSignal?.throwIfAborted();
    const reservation: IDaemonStartupReservation | undefined = readDaemonStartupReservation(options.paths);
    if (!reservation) return undefined;
    if (await tryResolveForReadyDaemonAsync(options, deadline)) continue;
    if (await tryTakeOverAbandonedStartupReservationAsync(options.paths, reservation))
      return reservation.helper;
    const helperState: DaemonStartupHelperState = getStartupHelperState(reservation);
    const now: number = Date.now();
    const relaunchTime: number | undefined =
      helperState === 'exited' ? getStartupRelaunchTime(reservation.helper!) : undefined;
    const pendingRelaunchTime: number | undefined =
      relaunchTime !== undefined && now < relaunchTime ? relaunchTime : undefined;
    if (now >= deadline || pendingRelaunchTime !== undefined) {
      // The helper may have released its reservation just before it exited or before the deadline.
      const current: IDaemonStartupReservation | undefined = readDaemonStartupReservation(options.paths);
      if (!current || current.contents !== reservation.contents) continue;
      throw startupError(
        options,
        describeUnresolvedReservation(options.paths, reservation, helperState, pendingRelaunchTime)
      );
    }
    await delayAsync(Math.min(100, Math.max(1, deadline - Date.now())), undefined, {
      signal: options.abortSignal
    });
  }
}

/**
 * Resolves the startup reservation if a daemon of any version completes hello/ping at the endpoint, which is
 * the readiness the helper waits for; the normal flow then replaces a mismatched daemon. The caller holds the
 * start mutex.
 */
async function tryResolveForReadyDaemonAsync(
  options: IConnectOrStartDaemonOptions,
  deadline: number
): Promise<boolean> {
  let client: DaemonClient | undefined;
  try {
    client = await tryConnectEndpointAsync({ ...options, expectedDaemonVersion: undefined }, deadline);
  } catch (error) {
    // Nor would the helper treat a daemon with an incompatible protocol as ready.
    if (error instanceof DaemonClientError && error.code === 'versionMismatch') return false;
    throw error;
  }
  if (!client) return false;
  try {
    return resolveStartupReservationForReadyDaemon(options.paths, (await client.status).pid);
  } finally {
    await client.closeAsync();
  }
}

/** `pendingRelaunchTime` is the relaunch time of a helper that exited, while that time has not passed yet. */
function describeUnresolvedReservation(
  paths: IDaemonPaths,
  reservation: IDaemonStartupReservation,
  helperState: DaemonStartupHelperState,
  pendingRelaunchTime: number | undefined
): string {
  const prefix: string = `has an unresolved startup handoff at ${getDaemonStartupFilePath(paths)}`;
  const helperPid: number | undefined = reservation.helper?.pid;
  switch (helperState) {
    case 'exited':
      return pendingRelaunchTime !== undefined
        ? `${prefix}: its startup helper (PID ${helperPid}) exited before the daemon became ready; refusing another launch until ${new Date(pendingRelaunchTime).toISOString()}, so that a daemon that cannot start is not launched by every command.`
        : `${prefix}: its startup helper (PID ${helperPid}) exited before the daemon became ready, but a process still accepts connections at ${paths.socketPath}; refusing another launch. ${DAEMON_RESET_HINT}`;
    case 'running':
      return `${prefix}: its startup helper (PID ${helperPid}) is still waiting for the daemon to become ready; refusing another launch`;
    default:
      return `${prefix}; refusing another launch. ${DAEMON_RESET_HINT}`;
  }
}

/**
 * Captures attested ownership and requests shutdown without claiming that cleanup has finished.
 * Pass the returned identity as previousDaemon to connectOrStartDaemonAsync before replacement.
 * @beta
 */
export async function requestDaemonShutdownAsync(
  client: DaemonClient,
  paths: IDaemonPaths,
  timeoutMs?: number
): Promise<Pick<IDaemonLockfile, 'pid' | 'startedAt'>> {
  if (client.protocolVersion.minor < DAEMON_LIFECYCLE_PROTOCOL_MINOR) {
    throw new DaemonClientError('versionMismatch', 'Daemon restart requires protocol 0.6 or newer.');
  }
  const { pid } = await client.status;
  const owner: IDaemonLockfile | undefined = readDaemonLockfile(paths.lockfilePath);
  if (!isDaemonOwnership(owner) || owner.pid !== pid || owner.socketPath !== paths.socketPath) {
    throw new DaemonClientError(
      'startupFailed',
      'The daemon ownership record is missing, unreadable, or changed; shutdown was not sent.'
    );
  }
  const previousDaemon: Pick<IDaemonLockfile, 'pid' | 'startedAt'> = {
    pid: owner.pid,
    startedAt: owner.startedAt
  };
  await resolveReservationBeforeShutdownAsync(paths, pid, timeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS);
  await client.shutdownAsync(timeoutMs);
  return previousDaemon;
}

/**
 * A retained startup reservation would refuse the successor's launch, so it is resolved first; `pid` answered
 * hello/ping and is attested as the owner. Waits for the start mutex, since another client may be resolving it.
 */
async function resolveReservationBeforeShutdownAsync(
  paths: IDaemonPaths,
  pid: number,
  timeoutMs: number
): Promise<void> {
  if (!readDaemonStartupReservation(paths)) return;
  const lock: IStartupLock | undefined = await waitForStartupLockAsync(paths, timeoutMs);
  if (!lock) {
    throw new DaemonClientError(
      'startupFailed',
      `Another client is starting the daemon for ${paths.lockfilePath}; shutdown was not sent.`
    );
  }
  try {
    if (!resolveStartupReservationForReadyDaemon(paths, pid)) {
      throw new DaemonClientError(
        'startupFailed',
        `The daemon startup reservation at ${getDaemonStartupFilePath(paths)} could not be resolved for PID ${pid}; shutdown was not sent.`
      );
    }
  } finally {
    await lock.releaseAsync();
  }
}

/**
 * Resolves a startup reservation that remains next to a connected, ready daemon before that daemon is stopped.
 * Afterwards no ready daemon would prove the reservation stale, so it would refuse every automatic start. The
 * daemon must be the live owner in the ownership record for the endpoint, and the reservation is removed only
 * if unchanged. Waits for the start mutex for up to `timeoutMs` (15000 milliseconds by default), since another
 * client may be resolving it.
 * @returns true when no reservation remains; false when one is kept.
 * @beta
 */
export async function resolveDaemonStartupReservationAsync(
  client: DaemonClient,
  paths: IDaemonPaths,
  timeoutMs: number = DEFAULT_SHUTDOWN_TIMEOUT_MS
): Promise<boolean> {
  if (!readDaemonStartupReservation(paths)) return true;
  const { pid } = await client.status;
  const lock: IStartupLock | undefined = await waitForStartupLockAsync(paths, timeoutMs);
  if (!lock) return false;
  try {
    return resolveStartupReservationForReadyDaemon(paths, pid);
  } finally {
    await lock.releaseAsync();
  }
}

/** Returns undefined when another client still holds the start mutex after `timeoutMs`. */
async function waitForStartupLockAsync(
  paths: IDaemonPaths,
  timeoutMs: number
): Promise<IStartupLock | undefined> {
  const deadline: number = Date.now() + timeoutMs;
  let lock: IStartupLock | undefined;
  while (!(lock = await tryAcquireStartupLockAsync(paths))) {
    if (Date.now() >= deadline) return undefined;
    await delayAsync(Math.min(100, Math.max(1, deadline - Date.now())));
  }
  return lock;
}

async function replaceMismatchedDaemonAsync(
  options: IConnectOrStartDaemonOptions,
  deadline: number
): Promise<DaemonClient | undefined> {
  if (options.expectedDaemonVersion === undefined) return undefined;
  const current: DaemonClient | undefined = await tryConnectAsync(
    {
      ...options,
      expectedDaemonVersion: undefined,
      startCommand: undefined
    },
    deadline
  );
  if (!current) return undefined;
  if ((await current.status).daemonVersion === options.expectedDaemonVersion) return current;
  try {
    const previousDaemon: Pick<IDaemonLockfile, 'pid' | 'startedAt'> = await requestDaemonShutdownAsync(
      current,
      options.paths,
      Math.max(1, deadline - Date.now())
    );
    await waitForPreviousDaemonAsync(options.paths, previousDaemon, deadline, options.abortSignal);
  } finally {
    await current.closeAsync();
  }
  return await tryConnectAsync(options, deadline);
}

async function tryConnectAsync(
  options: IConnectOrStartDaemonOptions,
  deadline: number
): Promise<DaemonClient | undefined> {
  const client: DaemonClient | undefined = await tryConnectEndpointAsync(options, deadline);
  if (!client) return undefined;
  // Do not expose a just-started daemon to shutdown/restart until its startup reservation is resolved:
  // by the helper, or here once the daemon is ready. This never waits for the start mutex, and a client
  // holding it (including this process) resolves the reservation itself.
  let usable: boolean = false;
  try {
    options.abortSignal?.throwIfAborted();
    usable =
      !readDaemonStartupReservation(options.paths) ||
      (await tryResolveStartupReservationAsync(client, options.paths));
  } finally {
    if (!usable) await client.closeAsync();
  }
  return usable ? client : undefined;
}

/** Connects and completes hello/ping, whether or not a startup reservation remains. */
async function tryConnectEndpointAsync(
  options: IConnectOrStartDaemonOptions,
  deadline: number
): Promise<DaemonClient | undefined> {
  options.abortSignal?.throwIfAborted();
  try {
    return await DaemonClient.connectAsync({
      ...options,
      socketPath: options.paths.socketPath,
      timeoutMs: Math.min(options.timeoutMs ?? 1000, Math.max(1, deadline - Date.now()))
    });
  } catch (error) {
    options.abortSignal?.throwIfAborted();
    if (
      error instanceof DaemonTransportError &&
      (error.code === DaemonTransportErrorCode.connectionRefused ||
        error.code === DaemonTransportErrorCode.connectionTimeout)
    ) {
      return undefined;
    }
    if (error instanceof DaemonClientError && (error.code === 'timeout' || error.code === 'disconnected')) {
      return undefined;
    }
    // A closing owner can refuse the handshake while retaining its listener through resource cleanup.
    // No request has been sent by connectAsync(), so this does not authorize replay of executed work.
    if (hasErrorCode(error, 'ECONNRESET') || hasErrorCode(error, 'EPIPE')) return undefined;
    if (
      error instanceof DaemonClientError &&
      error.code === 'versionMismatch' &&
      (options.startCommand || options.resolveStartCommandAsync) &&
      options.expectedDaemonVersion !== undefined
    ) {
      return undefined;
    }
    throw error;
  }
}

/** Connects to a successor while the previous daemon process lives; undefined once it has exited without one. */
async function waitForPlannedSuccessorAsync(
  options: IConnectOrStartDaemonOptions,
  previous: DaemonOwnership,
  deadline: number
): Promise<DaemonClient | undefined> {
  while (isOwnerProcessAlive(previous)) {
    if (Date.now() >= deadline) {
      throw startupError(
        options,
        `timed out waiting for the successor that the previous daemon (PID ${previous.pid}) is starting`
      );
    }
    await delayAsync(Math.min(100, Math.max(1, deadline - Date.now())), undefined, {
      signal: options.abortSignal
    });
    const successor: DaemonClient | undefined = await tryConnectAsync(options, deadline);
    if (successor) return successor;
  }
  return undefined;
}

async function waitForHandoffAsync(
  options: IConnectOrStartDaemonOptions,
  deadline: number
): Promise<DaemonClient | undefined> {
  let backoffMs: number = 50;
  while (Date.now() < deadline) {
    const owner: IDaemonLockfile | undefined = readDaemonLockfile(options.paths.lockfilePath);
    // Only wait on a fully published endpoint; malformed or ambiguous ownership is resolved by reclaim.
    if (
      !owner ||
      !isDaemonOwnership(owner) ||
      owner.socketPath !== options.paths.socketPath ||
      !isOwnerProcessAlive(owner)
    )
      return undefined;
    await delayAsync(Math.min(backoffMs, Math.max(1, deadline - Date.now())), undefined, {
      signal: options.abortSignal
    });
    const client: DaemonClient | undefined = await tryConnectAsync(options, deadline);
    if (client) return client;
    backoffMs = Math.min(500, backoffMs * 2);
  }
  assertNoLiveOwner(options.paths);
  return undefined;
}

function assertNoLiveOwner(paths: IDaemonPaths): void {
  const owner: DaemonOwnership | undefined = readDaemonOwnership(paths.lockfilePath);
  if (!owner || !isOwnerProcessAlive(owner)) return;
  throw new DaemonClientError(
    'startupFailed',
    `PID ${owner.pid} still exists but the daemon is not ready. It may be a daemon that is still shutting down, or a reused PID; refusing to kill it or remove ${paths.lockfilePath}. ${DAEMON_RESET_HINT}`
  );
}

async function readHandoffOwnershipAsync(
  lockfilePath: string,
  deadline: number,
  abortSignal?: AbortSignal
): Promise<Pick<IDaemonLockfile, 'pid' | 'startedAt'> | undefined> {
  let backoffMs: number = 20;
  while (true) {
    abortSignal?.throwIfAborted();
    try {
      return readDaemonOwnership(lockfilePath);
    } catch (error) {
      if (
        process.platform !== 'win32' ||
        !(error instanceof DaemonClientError) ||
        !(hasErrorCode(error.cause, 'EPERM') || hasErrorCode(error.cause, 'EBUSY')) ||
        Date.now() >= deadline
      ) {
        throw error;
      }
    }
    // A sharing-denied record is unknown, not released. Retry only within the existing handoff deadline.
    await delayAsync(Math.min(backoffMs, Math.max(1, deadline - Date.now())), undefined, {
      signal: abortSignal
    });
    backoffMs = Math.min(100, backoffMs * 2);
  }
}

async function waitForPreviousDaemonAsync(
  paths: IDaemonPaths,
  previous: IConnectOrStartDaemonOptions['previousDaemon'],
  deadline: number,
  abortSignal?: AbortSignal
): Promise<void> {
  if (previous === undefined) return;
  if (!isDaemonOwnership(previous)) {
    throw new RangeError(
      'previousDaemon must contain a positive safe-integer pid and valid startedAt timestamp.'
    );
  }
  const { pid, startedAt } = previous;
  let backoffMs: number = 50;
  while (true) {
    abortSignal?.throwIfAborted();
    const owner: Pick<IDaemonLockfile, 'pid' | 'startedAt'> | undefined = await readHandoffOwnershipAsync(
      paths.lockfilePath,
      deadline,
      abortSignal
    );
    if (!owner || owner.pid !== pid || owner.startedAt !== startedAt || !isOwnerProcessAlive(owner)) return;
    if (Date.now() >= deadline) {
      throw new DaemonClientError(
        'timeout',
        `The previous daemon still owns ${paths.lockfilePath} (PID ${pid}); cleanup is incomplete or failed. No PID was killed and no ownership record was reclaimed.`
      );
    }
    await delayAsync(Math.min(backoffMs, Math.max(1, deadline - Date.now())), undefined, {
      signal: abortSignal
    });
    backoffMs = Math.min(500, backoffMs * 2);
  }
}

async function spawnDetachedAsync(
  options: IConnectOrStartDaemonOptions,
  deadline: number,
  abandonedHelper: IDaemonStartupHelper | undefined
): Promise<IStartupHelper> {
  const start: IDaemonStartCommand = {
    ...options.startCommand!,
    cwd: path.resolve(options.startCommand!.cwd),
    environment: withDaemonRuntimeFolder(options.startCommand!.environment, options.paths)
  };
  const logFilePath: string = getDaemonLogFilePath(options.paths);
  // These distinct native flags have non-overlapping values.
  const flags: number =
    fs.constants.O_WRONLY +
    fs.constants.O_APPEND +
    fs.constants.O_CREAT +
    (process.platform === 'win32' ? 0 : fs.constants.O_NOFOLLOW + fs.constants.O_NONBLOCK);
  const logFd: number = fs.openSync(logFilePath, flags, 0o600);
  try {
    const stats: fs.Stats = fs.fstatSync(logFd);
    if (!stats.isFile() || stats.nlink !== 1) {
      throw new DaemonClientError(
        'startupFailed',
        `Launcher log must be a regular, unshared file: ${logFilePath}`
      );
    }
    if (process.platform !== 'win32') {
      if (stats.uid !== process.getuid?.()) {
        throw new DaemonClientError('startupFailed', `Launcher log is owned by another user: ${logFilePath}`);
      }
      fs.fchmodSync(logFd, 0o600);
    }
    if (abandonedHelper) {
      fs.writeSync(
        logFd,
        `${new Date().toISOString()} rush-client (PID ${process.pid}): took over the startup reservation of ` +
          `startup helper PID ${abandonedHelper.pid} (started ${abandonedHelper.startedAt}), which exited ` +
          'before the daemon became ready; starting the daemon again.\n'
      );
    }
    let helper: IStartupHelper | undefined;
    try {
      const child: ChildProcess = spawn(process.execPath, [path.join(__dirname, 'runDaemonStartup.js')], {
        cwd: __dirname,
        detached: true,
        stdio: ['ignore', logFd, logFd, 'ipc'],
        windowsHide: true
      });
      helper = {
        child,
        closed: new Promise<void>((resolve) => child.once('close', () => resolve()))
      };
      await once(child, 'spawn');
    } catch (error) {
      if (helper) await helper.closed;
      throw new DaemonClientError(
        'startupFailed',
        `Unable to start ${start.command}; inspect ${logFilePath}.`,
        { cause: error }
      );
    }
    const { child } = helper;
    let token: string;
    try {
      // The helper launches nothing until it receives its options, so the reservation can name it first.
      // Its start time is taken after the spawn, so the helper can never look like a later reuse of its PID.
      token = reserveDaemonStartup(options.paths, { pid: child.pid!, startedAt: new Date().toISOString() });
    } catch (error) {
      // Disconnected without options, the helper exits without launching.
      child.disconnect();
      await helper.closed;
      throw error;
    }
    child.unref();
    const startup: IDaemonStartupOptions = {
      paths: options.paths,
      startCommand: start,
      token,
      timeoutMs: Math.max(STARTUP_HELPER_READINESS_TIMEOUT_MS, deadline - Date.now())
    };
    let delivered: boolean = false;
    try {
      await new Promise<void>((resolve, reject) => {
        child.send(startup, (error) => (error ? reject(error) : resolve()));
      });
      delivered = true;
    } finally {
      if (!delivered && child.connected) child.disconnect();
      // On successful handoff, let exit close IPC naturally so ChildProcess emits its close event.
      child.channel?.unref();
    }
    return helper;
  } finally {
    fs.closeSync(logFd);
  }
}

async function waitForHelperExitAsync(
  helper: IStartupHelper,
  options: IConnectOrStartDaemonOptions,
  deadline: number
): Promise<void> {
  const timeout: AbortController = new AbortController();
  const signal: AbortSignal = options.abortSignal
    ? AbortSignal.any([options.abortSignal, timeout.signal])
    : timeout.signal;
  try {
    await Promise.race([
      helper.closed,
      delayAsync(Math.max(1, deadline - Date.now()), undefined, { signal }).then(() => {
        throw startupError(options, 'timed out awaiting startup helper exit');
      })
    ]);
  } catch (error) {
    options.abortSignal?.throwIfAborted();
    throw error;
  } finally {
    timeout.abort();
  }
}

function startupError(options: IConnectOrStartDaemonOptions, reason: string): DaemonClientError {
  const sentence: string = /[.!?]$/.test(reason) ? reason : `${reason}.`;
  return new DaemonClientError(
    'startupFailed',
    `Daemon startup ${sentence} Inspect ${getDaemonLogFilePath(options.paths)} and retry, or use --no-daemon.`
  );
}
