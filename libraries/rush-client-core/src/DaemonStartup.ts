// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delayAsync } from 'node:timers/promises';

import {
  DaemonTransportError,
  DaemonTransportErrorCode,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';

import type { IDaemonStartCommand } from './connectOrStartDaemon';
import { DaemonClient } from './DaemonClient';
import { DaemonClientError } from './DaemonClientError';
import {
  assertDaemonStartupReservation,
  getDaemonStartupFilePath,
  releaseDaemonStartup,
  updateDaemonStartupReservation
} from './DaemonStartupReservation';

export {
  getDaemonStartupFilePath,
  releaseDaemonStartup,
  reserveDaemonStartup
} from './DaemonStartupReservation';

export interface IDaemonStartupOptions {
  readonly paths: IDaemonPaths;
  readonly startCommand: IDaemonStartCommand;
  readonly token: string;
  readonly timeoutMs: number;
}

/**
 * Runs independently of the requesting client. The reservation records this helper and its launcher PID,
 * so later starters can verify whether the startup can still make progress. Protocol readiness releases
 * the reservation; so does a launcher that exits without publishing an endpoint. A deadline miss while the
 * launcher is still alive keeps the reservation, which later becomes stale when both processes are gone or
 * the bounded grace period elapses.
 */
export async function runDaemonStartupAsync(options: IDaemonStartupOptions): Promise<void> {
  const { paths, startCommand: start, token, timeoutMs } = options;
  assertDaemonStartupReservation(paths, token);
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
  if (child.pid !== undefined) updateDaemonStartupReservation(paths, token, { launcherPid: child.pid });

  const deadline: number = Date.now() + timeoutMs;
  let backoffMs: number = 50;
  while (Date.now() < deadline) {
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
    if (child.exitCode !== null || child.signalCode !== null) {
      await closed;
      // The launcher this helper started is gone without publishing an endpoint. If it left a descendant
      // that binds later, the transport's bind-time ownership check still rejects a second daemon.
      releaseDaemonStartup(paths, token);
      throw new DaemonClientError(
        'startupFailed',
        `Daemon launcher ${describeExit(child)} before protocol readiness; startup reservation released.`
      );
    }
    await delayAsync(Math.min(backoffMs, Math.max(1, deadline - Date.now())));
    backoffMs = Math.min(500, backoffMs * 2);
  }
  throw new DaemonClientError(
    'startupFailed',
    `Timed out awaiting daemon readiness; the startup reservation at ${getDaemonStartupFilePath(paths)} ` +
      `is kept while launcher PID ${child.pid} is alive and becomes stale when it exits.`
  );
}

export function describeExit(child: ChildProcess): string {
  return child.signalCode ? `was terminated (${child.signalCode})` : `exited (${child.exitCode})`;
}
