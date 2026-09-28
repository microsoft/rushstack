// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import type { DaemonClient } from './DaemonClient';
import { DaemonClientError } from './DaemonClientError';
import { isEndpointUnboundAsync } from './DaemonOwnership';
import { readDaemonStartupReservation, type IDaemonStartupReservation } from './DaemonStartup';
import { getStartupHelperState } from './DaemonStartupReservation';
import { connectOrStartDaemonAsync, type IConnectOrStartDaemonOptions } from './connectOrStartDaemon';
import { tryAcquireStartupLockAsync, type IStartupLock } from './StartupLock';

/** Matches the default of {@link IConnectOrStartDaemonOptions.startupTimeoutMs}. */
const DEFAULT_STARTUP_TIMEOUT_MS: number = 15000;
/** Keeps a retry that fails at once from spinning until the deadline. */
const RETRY_DELAY_MS: number = 100;

/**
 * Daemon startup did not finish in time, but a live process can still make the daemon ready. Unlike a
 * {@link DaemonClientError}, this does not mean that running Rush in-process is safe: it would compete with
 * that daemon for the repository.
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
    const owner: string | undefined = await findLiveStartupOwnerAsync(options.paths);
    if (owner === undefined) throw lastError;
    if (Date.now() >= deadline) {
      throw new DaemonStartupPendingError(
        `${lastError.message} ${owner}, so Rush was not run in-process, where it would compete with that daemon for the repository. "rush-client daemon status" reports when the daemon is ready.`,
        { cause: lastError }
      );
    }
    if (attempt === 0) {
      options.onAwaitStartup?.(owner, deadline - Date.now());
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

function isStartupFailure(error: unknown): error is DaemonClientError {
  return error instanceof DaemonClientError && (error.code === 'startupFailed' || error.code === 'timeout');
}

/**
 * Describes a live process that can still make this workspace's daemon ready, or returns `undefined`.
 * An ownership record alone is not such evidence: a daemon publishes it only after it binds, so a record
 * next to an unbound endpoint belongs to a daemon that is shutting down or to a reused PID.
 */
async function findLiveStartupOwnerAsync(paths: IDaemonPaths): Promise<string | undefined> {
  if (!fs.existsSync(path.dirname(paths.lockfilePath))) return undefined;
  if (!(await isEndpointUnboundAsync(paths.socketPath))) {
    return `A process listens at ${paths.socketPath} but was not ready in time`;
  }
  let reservation: IDaemonStartupReservation | undefined;
  try {
    reservation = readDaemonStartupReservation(paths);
  } catch {
    // An unreadable reservation is no evidence of a live helper.
  }
  if (reservation?.helper && getStartupHelperState(reservation) === 'running') {
    return `Its startup helper (PID ${reservation.helper.pid}) is still waiting for the daemon`;
  }
  let lock: IStartupLock | undefined;
  try {
    lock = await tryAcquireStartupLockAsync(paths);
  } catch {
    // A start mutex that cannot be checked is no evidence of a live starter.
    return undefined;
  }
  if (!lock) return 'Another client is still starting the daemon';
  await lock.releaseAsync();
  return undefined;
}
