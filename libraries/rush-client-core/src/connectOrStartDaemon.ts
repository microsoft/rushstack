// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { LockFile } from '@rushstack/node-core-library';
import { DAEMON_LIFECYCLE_PROTOCOL_MINOR } from '@rushstack/rush-daemon-protocol';
import {
  DaemonTransportError,
  DaemonTransportErrorCode,
  ensureDaemonRuntimeDir,
  reclaimStaleDaemonAsync,
  readDaemonLockfile,
  type IDaemonLockfile,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';

import { DaemonClient, type IDaemonClientConnectOptions } from './DaemonClient';
import { DaemonClientError } from './DaemonClientError';
import { getDaemonLogFilePath } from './DaemonLogFile';
import {
  getDaemonStartupFilePath,
  reserveDaemonStartup,
  releaseDaemonStartup,
  type IDaemonStartupOptions
} from './DaemonStartup';

interface IStartupHelper {
  readonly child: ChildProcess;
  readonly closed: Promise<void>;
}

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
  const timeoutMs: number = options.startupTimeoutMs ?? 15000;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 0x7fffffff) {
    throw new RangeError('startupTimeoutMs must be an integer between 1 and 2147483647.');
  }
  const deadline: number = Date.now() + timeoutMs;
  options.abortSignal?.throwIfAborted();
  await waitForPreviousDaemonAsync(options.paths, options.previousDaemon, deadline, options.abortSignal);
  const initial: DaemonClient | undefined = await tryConnectAsync(options, deadline);
  if (initial) return initial;
  if (!options.startCommand) {
    if (options.previousDaemon) {
      while (Date.now() < deadline) {
        await delayAsync(Math.min(100, Math.max(1, deadline - Date.now())), undefined, { signal: options.abortSignal });
        const successor: DaemonClient | undefined = await tryConnectAsync(options, deadline);
        if (successor) return successor;
      }
    }
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
    options.abortSignal?.throwIfAborted();
    lock = LockFile.tryAcquire(folder, resource);
    if (lock) break;
    await delayAsync(Math.min(backoffMs, Math.max(1, deadline - Date.now())), undefined, { signal: options.abortSignal });
    backoffMs = Math.min(500, backoffMs * 2);
    const ready: DaemonClient | undefined = await tryConnectAsync(options, deadline);
    if (ready) return ready;
  }
  if (!lock) throw startupError(options, 'timed out waiting for another starting client');
  try {
    while (fs.lstatSync(getDaemonStartupFilePath(options.paths), { throwIfNoEntry: false })) {
      const ready: DaemonClient | undefined = await tryConnectAsync(options, deadline);
      if (ready) return ready;
      if (Date.now() >= deadline) {
        throw startupError(
          options,
          `has an unresolved startup handoff at ${getDaemonStartupFilePath(options.paths)}; refusing another launch`
        );
      }
      await delayAsync(Math.min(100, Math.max(1, deadline - Date.now())), undefined, {
        signal: options.abortSignal
      });
    }
    const ready: DaemonClient | undefined = await tryConnectAsync(options, deadline);
    if (ready) return ready;
    const replacement: DaemonClient | undefined = await replaceMismatchedDaemonAsync(options, deadline);
    if (replacement) return replacement;
    const handoff: DaemonClient | undefined = await waitForHandoffAsync(options, deadline);
    if (handoff) return handoff;
    if (Date.now() >= deadline) throw startupError(options, 'exceeded its deadline before reclaim');
    assertNoLiveOwner(options.paths);
    await reclaimStaleDaemonAsync(options.paths);
    if (Date.now() >= deadline) throw startupError(options, 'exceeded its deadline before spawn');
    options.abortSignal?.throwIfAborted();
    const helper: IStartupHelper = await spawnDetachedAsync(options, deadline);
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
      await delayAsync(Math.min(backoffMs, Math.max(1, deadline - Date.now())), undefined, { signal: options.abortSignal });
      backoffMs = Math.min(500, backoffMs * 2);
    }
    throw startupError(options, 'timed out awaiting hello/ping readiness');
  } finally {
    lock.release();
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
  await client.shutdownAsync(timeoutMs);
  return previousDaemon;
}

async function replaceMismatchedDaemonAsync(
  options: IConnectOrStartDaemonOptions,
  deadline: number
): Promise<DaemonClient | undefined> {
  if (options.expectedDaemonVersion === undefined) return undefined;
  const current: DaemonClient | undefined = await tryConnectAsync({
    ...options, expectedDaemonVersion: undefined, startCommand: undefined
  }, deadline);
  if (!current) return undefined;
  if ((await current.status).daemonVersion === options.expectedDaemonVersion) return current;
  try {
    const previousDaemon: Pick<IDaemonLockfile, 'pid' | 'startedAt'> = await requestDaemonShutdownAsync(
      current, options.paths, Math.max(1, deadline - Date.now())
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
  options.abortSignal?.throwIfAborted();
  try {
    const client: DaemonClient = await DaemonClient.connectAsync({
      ...options,
      socketPath: options.paths.socketPath,
      timeoutMs: Math.min(options.timeoutMs ?? 1000, Math.max(1, deadline - Date.now()))
    });
    // Do not expose a just-started daemon to shutdown/restart until the helper finishes the handoff.
    let pendingStartup: boolean = true;
    try {
      options.abortSignal?.throwIfAborted();
      pendingStartup = !!fs.lstatSync(getDaemonStartupFilePath(options.paths), { throwIfNoEntry: false });
    } finally {
      if (pendingStartup) await client.closeAsync();
    }
    return pendingStartup ? undefined : client;
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
    if (
      error instanceof DaemonClientError &&
      error.code === 'versionMismatch' &&
      options.startCommand &&
      options.expectedDaemonVersion !== undefined
    ) {
      return undefined;
    }
    throw error;
  }
}

async function waitForHandoffAsync(
  options: IConnectOrStartDaemonOptions,
  deadline: number
): Promise<DaemonClient | undefined> {
  let backoffMs: number = 50;
  while (Date.now() < deadline) {
    const owner: IDaemonLockfile | undefined = readDaemonLockfile(options.paths.lockfilePath);
    // Only wait on a fully published endpoint; malformed or ambiguous ownership still fails closed.
    if (!owner || owner.socketPath !== options.paths.socketPath || !isProcessAlive(owner.pid)) return undefined;
    await delayAsync(Math.min(backoffMs, Math.max(1, deadline - Date.now())), undefined, { signal: options.abortSignal });
    const client: DaemonClient | undefined = await tryConnectAsync(options, deadline);
    if (client) return client;
    backoffMs = Math.min(500, backoffMs * 2);
  }
  assertNoLiveOwner(options.paths);
  return undefined;
}

function assertNoLiveOwner(paths: IDaemonPaths): void {
  const owner: Pick<IDaemonLockfile, 'pid' | 'startedAt'> | undefined = readDaemonOwnership(
    paths.lockfilePath
  );
  if (!owner) {
    if (process.platform !== 'win32' && fs.existsSync(paths.socketPath)) {
      throw new DaemonClientError(
        'startupFailed',
        `Socket ${paths.socketPath} has no ownership record; refusing automatic reclaim.`
      );
    }
    return;
  }
  if (!isProcessAlive(owner.pid)) return;
  throw new DaemonClientError(
    'startupFailed',
    `PID ${owner.pid} still exists but the daemon is not ready. It may be a reused PID; refusing to kill it or remove ${paths.lockfilePath}.`
  );
}

function readDaemonOwnership(lockfilePath: string): Pick<IDaemonLockfile, 'pid' | 'startedAt'> | undefined {
  let record: unknown;
  try {
    record = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return undefined;
    throw new DaemonClientError(
      'startupFailed',
      `Cannot safely read ${lockfilePath}; refusing automatic reclaim.`,
      { cause: error }
    );
  }
  if (!isDaemonOwnership(record)) {
    throw new DaemonClientError(
      'startupFailed',
      `Invalid daemon ownership record in ${lockfilePath}; refusing automatic reclaim.`
    );
  }
  return { pid: record.pid, startedAt: record.startedAt };
}

function isDaemonOwnership(record: unknown): record is Pick<IDaemonLockfile, 'pid' | 'startedAt'> {
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
    const owner: Pick<IDaemonLockfile, 'pid' | 'startedAt'> | undefined = readDaemonOwnership(
      paths.lockfilePath
    );
    if (!owner || owner.pid !== pid || owner.startedAt !== startedAt || !isProcessAlive(owner.pid)) return;
    if (Date.now() >= deadline) {
      throw new DaemonClientError(
        'timeout',
        `The previous daemon still owns ${paths.lockfilePath} (PID ${pid}); cleanup is incomplete or failed. No PID was killed and no ownership record was reclaimed.`
      );
    }
    await delayAsync(Math.min(backoffMs, Math.max(1, deadline - Date.now())), undefined, { signal: abortSignal });
    backoffMs = Math.min(500, backoffMs * 2);
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (hasErrorCode(error, 'ESRCH')) return false;
    throw error;
  }
}

async function spawnDetachedAsync(
  options: IConnectOrStartDaemonOptions,
  deadline: number
): Promise<IStartupHelper> {
  const start: IDaemonStartCommand = options.startCommand!;
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
    const token: string = reserveDaemonStartup(options.paths);
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
      releaseDaemonStartup(options.paths, token);
      throw new DaemonClientError(
        'startupFailed',
        `Unable to start ${start.command}; inspect ${logFilePath}.`,
        { cause: error }
      );
    }
    const { child } = helper;
    child.unref();
    const startup: IDaemonStartupOptions = {
      paths: options.paths,
      startCommand: start,
      token,
      timeoutMs: Math.max(1, deadline - Date.now())
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
  return new DaemonClientError(
    'startupFailed',
    `Daemon startup ${reason}. Inspect ${getDaemonLogFilePath(options.paths)} and retry, or use --no-daemon.`
  );
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
