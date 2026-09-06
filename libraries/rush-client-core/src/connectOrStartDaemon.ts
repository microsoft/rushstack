// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { LockFile } from '@rushstack/node-core-library';
import {
  DaemonTransportError,
  DaemonTransportErrorCode,
  ensureDaemonRuntimeDir,
  reclaimStaleDaemonAsync,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';

import { DaemonClient, type IDaemonClientConnectOptions } from './DaemonClient';
import { DaemonClientError } from './DaemonClientError';

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
  /** Omit to connect without auto-start. */
  readonly startCommand?: IDaemonStartCommand;
  /** Total startup/retry deadline. Defaults to 15000 milliseconds. */
  readonly startupTimeoutMs?: number;
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
  const timeoutMs: number = options.startupTimeoutMs ?? 15000;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 0x7fffffff) {
    throw new RangeError('startupTimeoutMs must be an integer between 1 and 2147483647.');
  }
  const deadline: number = Date.now() + timeoutMs;
  const initial: DaemonClient | undefined = await tryConnectAsync(options, deadline);
  if (initial) return initial;
  if (!options.startCommand) {
    throw new DaemonClientError(
      'startupFailed',
      `No ready daemon at ${options.paths.socketPath}; auto-start is disabled.`
    );
  }
  ensureDaemonRuntimeDir(options.paths);
  const folder: string = path.dirname(options.paths.lockfilePath);
  const resource: string = `${path.basename(options.paths.lockfilePath)}-start`;
  let lock: LockFile | undefined;
  let backoffMs: number = 50;
  while (Date.now() < deadline) {
    lock = LockFile.tryAcquire(folder, resource);
    if (lock) break;
    await delayAsync(Math.min(backoffMs, Math.max(1, deadline - Date.now())));
    backoffMs = Math.min(500, backoffMs * 2);
    const ready: DaemonClient | undefined = await tryConnectAsync(options, deadline);
    if (ready) return ready;
  }
  if (!lock) throw startupError(options, 'timed out waiting for another starting client');
  try {
    const ready: DaemonClient | undefined = await tryConnectAsync(options, deadline);
    if (ready) return ready;
    assertNoLiveOwner(options.paths);
    await reclaimStaleDaemonAsync(options.paths);
    const child: ChildProcess = await spawnDetachedAsync(options);
    backoffMs = 50;
    while (Date.now() < deadline) {
      const client: DaemonClient | undefined = await tryConnectAsync(options, deadline);
      if (client) return client;
      if (child.exitCode !== null || child.signalCode !== null) {
        throw startupError(options, `child exited (${child.exitCode ?? child.signalCode}) before readiness`);
      }
      await delayAsync(Math.min(backoffMs, Math.max(1, deadline - Date.now())));
      backoffMs = Math.min(500, backoffMs * 2);
    }
    throw startupError(options, 'timed out awaiting hello/ping readiness');
  } finally {
    lock.release();
  }
}

async function tryConnectAsync(
  options: IConnectOrStartDaemonOptions,
  deadline: number
): Promise<DaemonClient | undefined> {
  try {
    return await DaemonClient.connectAsync({
      ...options,
      socketPath: options.paths.socketPath,
      timeoutMs: Math.min(options.timeoutMs ?? 1000, Math.max(1, deadline - Date.now()))
    });
  } catch (error) {
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
    throw error;
  }
}

function assertNoLiveOwner(paths: IDaemonPaths): void {
  let record: unknown;
  try {
    record = JSON.parse(fs.readFileSync(paths.lockfilePath, 'utf8'));
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      if (process.platform !== 'win32' && fs.existsSync(paths.socketPath)) {
        throw new DaemonClientError(
          'startupFailed',
          `Socket ${paths.socketPath} has no ownership record; refusing automatic reclaim.`
        );
      }
      return;
    }
    throw new DaemonClientError(
      'startupFailed',
      `Cannot safely read ${paths.lockfilePath}; refusing automatic reclaim.`,
      { cause: error }
    );
  }
  if (
    typeof record !== 'object' ||
    record === null ||
    !('pid' in record) ||
    typeof record.pid !== 'number' ||
    !Number.isSafeInteger(record.pid) ||
    record.pid <= 0
  ) {
    throw new DaemonClientError(
      'startupFailed',
      `Invalid daemon PID in ${paths.lockfilePath}; refusing automatic reclaim.`
    );
  }
  try {
    process.kill(record.pid, 0);
  } catch (error) {
    if (hasErrorCode(error, 'ESRCH')) return;
    throw error;
  }
  throw new DaemonClientError(
    'startupFailed',
    `PID ${record.pid} still exists but the daemon is not ready. It may be a reused PID; refusing to kill it or remove ${paths.lockfilePath}.`
  );
}

async function spawnDetachedAsync(options: IConnectOrStartDaemonOptions): Promise<ChildProcess> {
  const start: IDaemonStartCommand = options.startCommand!;
  const logFd: number = fs.openSync(`${options.paths.lockfilePath}.log`, 'a', 0o600);
  try {
    const child: ChildProcess = spawn(start.command, [...start.args], {
      cwd: start.cwd,
      env: start.environment,
      detached: true,
      stdio: ['ignore', logFd, logFd],
      windowsHide: true
    });
    try {
      await once(child, 'spawn');
    } catch (error) {
      throw new DaemonClientError(
        'startupFailed',
        `Unable to start ${start.command}; inspect ${options.paths.lockfilePath}.log.`,
        { cause: error }
      );
    }
    child.unref();
    return child;
  } finally {
    fs.closeSync(logFd);
  }
}

function startupError(options: IConnectOrStartDaemonOptions, reason: string): DaemonClientError {
  return new DaemonClientError(
    'startupFailed',
    `Daemon startup ${reason}. Inspect ${options.paths.lockfilePath}.log and retry, or use --no-daemon.`
  );
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
