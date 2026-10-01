// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import type { DaemonClient } from './DaemonClient';
import { DaemonClientError } from './DaemonClientError';
import { LiveDaemonOwnerError, type IStoppedProcess } from './DaemonOwnerDiagnosis';
import { DAEMON_RESET_HINT, findUnreachableDaemon, isEndpointUnboundAsync } from './DaemonOwnership';
import { readDaemonStartupReservation, type IDaemonStartupReservation } from './DaemonStartup';
import { getStartupHelperState } from './DaemonStartupReservation';
import {
  connectOrStartDaemonAsync,
  tryConnectEndpointAsync,
  type IConnectOrStartDaemonOptions
} from './connectOrStartDaemon';
import { isStartupLockFilePresent, tryAcquireStartupLockAsync, type IStartupLock } from './StartupLock';
import { isDaemonOwnerStillStopped } from './StoppedDaemonOwner';

/** A live process that can still make this workspace's daemon ready. */
interface ILiveStartupOwner {
  /** A listener at the endpoint, a startup helper that still waits for its daemon, or a start mutex holder. */
  readonly kind: 'listener' | 'helper' | 'starter';
  /** For example "Its startup helper (PID 123) is still waiting for the daemon". */
  readonly description: string;
}

/** Matches the default of {@link IConnectOrStartDaemonOptions.startupTimeoutMs}. */
const DEFAULT_STARTUP_TIMEOUT_MS: number = 15000;
/** Keeps a retry that fails at once from spinning until the deadline. */
const RETRY_DELAY_MS: number = 100;
const NOT_RUN_IN_PROCESS: string =
  'Rush was not run in-process, where it would compete with that daemon for the repository.';

/**
 * Daemon startup did not finish in time, but a live process can still make the daemon ready, or this workspace's
 * daemon still runs where no client can reach it. Unlike a {@link DaemonClientError}, this does not mean that
 * running Rush in-process is safe: it would compete with that daemon for the repository.
 * @beta
 */
export class DaemonStartupPendingError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DaemonStartupPendingError';
  }
}

/**
 * Options for {@link connectOrAwaitDaemonStartupAsync}.
 * @beta
 */
export interface IConnectOrAwaitDaemonStartupOptions extends IConnectOrStartDaemonOptions {
  /**
   * Called at most once, when startup did not finish in time but a live process can still make the daemon
   * ready, just before this waits up to `waitMs` more for it. `owner` describes that process, for example
   * "Its startup helper (PID 123) is still waiting for the daemon". A caller can say why it is still waiting.
   */
  onAwaitStartup?: (owner: string, waitMs: number) => void;
}

/**
 * {@link connectOrStartDaemonAsync} for a caller that runs Rush in-process when the daemon is unavailable.
 * @remarks When startup fails while a live process can still make the daemon ready (a listener at the endpoint,
 * a startup helper that still waits for its daemon, or another client that holds the start mutex), this retries
 * for one more startup deadline. If the daemon is still not ready, it rejects with a
 * {@link DaemonStartupPendingError}. It rejects with a {@link DaemonClientError} only when no such process
 * remains, so that the caller can run Rush in-process without competing with a daemon for the repository.
 * When none remains but this workspace's daemon still runs where no client can reach it, for example after its
 * socket file was deleted (on Linux: the process that the ownership record names is rushd and has that record
 * open, as a daemon does for as long as it owns it), it rejects at once with a {@link DaemonStartupPendingError}
 * that says what that daemon does. When the recorded owner has that record open, and a signal or a tracer kept it
 * stopped while the last attempt sampled it (on Linux), it rejects with a {@link DaemonStartupPendingError}
 * without waiting.
 * @beta
 */
export async function connectOrAwaitDaemonStartupAsync(
  options: IConnectOrAwaitDaemonStartupOptions
): Promise<DaemonClient> {
  try {
    return await connectOrStartDaemonAsync(options);
  } catch (error) {
    if (!isStartupFailure(error)) throw error;
    return await awaitLiveStartupAsync(options, error);
  }
}

async function awaitLiveStartupAsync(
  options: IConnectOrAwaitDaemonStartupOptions,
  firstError: DaemonClientError
): Promise<DaemonClient> {
  const deadline: number = Date.now() + (options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS);
  let lastError: DaemonClientError = firstError;
  for (let attempt: number = 0; ; attempt++) {
    const owner: ILiveStartupOwner | undefined = await findLiveStartupOwnerAsync(options.paths);
    if (owner === undefined) {
      // This workspace's daemon can still run where no client reaches it, for example after its socket file was
      // deleted. It cannot become ready there, but in-process Rush would still compete with it.
      const unreachable: LiveDaemonOwnerError | undefined = findUnreachableDaemon(options.paths);
      if (unreachable)
        throw new DaemonStartupPendingError(describeLiveOwner(unreachable), { cause: lastError });
      throw lastError;
    }
    if (Date.now() >= deadline || isStoppedListener(options.paths, lastError, owner)) {
      throw new DaemonStartupPendingError(describePendingStartup(lastError, owner), { cause: lastError });
    }
    if (attempt === 0) {
      options.onAwaitStartup?.(owner.description, deadline - Date.now());
    } else {
      await delayAsync(Math.min(RETRY_DELAY_MS, Math.max(1, deadline - Date.now())), undefined, {
        signal: options.abortSignal
      });
    }
    try {
      return await connectOrStartDaemonAsync({
        ...options,
        startupTimeoutMs: Math.max(1, deadline - Date.now())
      });
    } catch (error) {
      if (!isStartupFailure(error)) throw error;
      lastError = error;
    }
  }
}

/**
 * Whether the last attempt found the recorded owner stopped while it had the ownership record open, as the daemon
 * that wrote it does, and it still is: until something resumes it, it cannot answer, so waiting would only delay the
 * same error.
 */
function isStoppedListener(
  paths: IDaemonPaths,
  lastError: DaemonClientError,
  owner: ILiveStartupOwner
): boolean {
  const stopped: IStoppedProcess | undefined =
    lastError instanceof LiveDaemonOwnerError ? lastError.stoppedProcess : undefined;
  return stopped !== undefined && owner.kind === 'listener' && isDaemonOwnerStillStopped(paths, stopped);
}

/**
 * When a live process owns the daemon's files, the message leads with what that process is doing and ends with
 * what to do about it. The line between says that Rush was not run in-process, and first names a startup helper or
 * a start mutex holder that it waited for, but not a listener at the endpoint: the first line already says that the
 * daemon did not answer there.
 */
function describePendingStartup(lastError: DaemonClientError, owner: ILiveStartupOwner): string {
  if (!(lastError instanceof LiveDaemonOwnerError)) {
    return `${lastError.message} ${owner.description}, so ${NOT_RUN_IN_PROCESS} "rush-client daemon status" reports when the daemon is ready. ${DAEMON_RESET_HINT}`;
  }
  return describeLiveOwner(lastError, owner.kind === 'listener' ? '' : `${owner.description}, so `);
}

/**
 * What the live owner is doing, that Rush was not run in-process, and what to do about it, each on a line of its
 * own, so that a caller that shortens long lines, as agent output does, still shows all three.
 */
function describeLiveOwner(error: LiveDaemonOwnerError, reason: string = ''): string {
  return `${error.description}\n${reason}${NOT_RUN_IN_PROCESS}\n${error.hint}`;
}

/**
 * Connects to the daemon at this workspace's endpoint without starting one. When none listens but a live process
 * can still make one ready there (a listener that has not completed hello/ping yet, a recorded startup helper
 * that still waits for its daemon, or another client that holds the start mutex), this waits for that daemon
 * and connects once it completes hello/ping, for up to `startupTimeoutMs` (15000 milliseconds by default).
 * @remarks A caller that must not leave a daemon running, such as `rush-client daemon stop`, uses this instead
 * of concluding from one refused connection that none runs: a daemon that is still starting becomes ready
 * afterwards. It connects to a daemon of any implementation version, and never uses `startCommand`. Before it
 * waits, it calls the optional `onAwaitStartup(owner, waitMs)` once.
 * @returns `undefined` when nothing listens and no live process can still make a daemon ready.
 * @throws {@link DaemonStartupPendingError} when such a process is still live at the deadline.
 * @beta
 */
export async function connectToStartingDaemonAsync(
  options: IConnectOrAwaitDaemonStartupOptions
): Promise<DaemonClient | undefined> {
  const timeoutMs: number = options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
  const deadline: number = Date.now() + timeoutMs;
  const endpoint: IConnectOrStartDaemonOptions = { ...options, expectedDaemonVersion: undefined };
  for (let attempt: number = 0; ; attempt++) {
    const client: DaemonClient | undefined = await tryConnectEndpointAsync(endpoint, deadline);
    if (client) return client;
    const owner: ILiveStartupOwner | undefined = await findLiveStartupOwnerAsync(options.paths);
    if (owner === undefined) {
      // A startup that finished between the two checks leaves a ready daemon.
      return await tryConnectEndpointAsync(endpoint, Math.max(deadline, Date.now() + 1000));
    }
    if (Date.now() >= deadline) {
      throw new DaemonStartupPendingError(
        `The daemon at ${options.paths.socketPath} is still starting after ${Math.round(timeoutMs / 1000)} s. ${owner.description}.`
      );
    }
    if (attempt === 0) options.onAwaitStartup?.(owner.description, deadline - Date.now());
    await delayAsync(Math.min(RETRY_DELAY_MS, Math.max(1, deadline - Date.now())), undefined, {
      signal: options.abortSignal
    });
  }
}

function isStartupFailure(error: unknown): error is DaemonClientError {
  return error instanceof DaemonClientError && (error.code === 'startupFailed' || error.code === 'timeout');
}

/**
 * Describes a live process that can still make this workspace's daemon ready, or returns `undefined`.
 * An ownership record alone is not such evidence: a daemon publishes it only after it binds, so a record
 * next to an unbound endpoint belongs to a daemon that is shutting down or to a reused PID.
 */
async function findLiveStartupOwnerAsync(paths: IDaemonPaths): Promise<ILiveStartupOwner | undefined> {
  if (!fs.existsSync(path.dirname(paths.lockfilePath))) return undefined;
  if (!(await isEndpointUnboundAsync(paths.socketPath))) {
    return {
      kind: 'listener',
      description: `A process listens at ${paths.socketPath} but was not ready in time`
    };
  }
  let reservation: IDaemonStartupReservation | undefined;
  try {
    reservation = readDaemonStartupReservation(paths);
  } catch {
    // An unreadable reservation is no evidence of a live helper.
  }
  if (reservation?.helper && getStartupHelperState(reservation) === 'running') {
    return {
      kind: 'helper',
      description: `Its startup helper (PID ${reservation.helper.pid}) is still waiting for the daemon`
    };
  }
  // Without a lock file nothing holds the start mutex, and an idle `daemon stop` needs no `ps` run to tell.
  if (!isStartupLockFilePresent(paths)) return undefined;
  let lock: IStartupLock | undefined;
  try {
    lock = await tryAcquireStartupLockAsync(paths);
  } catch {
    // A start mutex that cannot be checked is no evidence of a live starter.
    return undefined;
  }
  if (!lock) return { kind: 'starter', description: 'Another client is still starting the daemon' };
  await lock.releaseAsync();
  return undefined;
}
