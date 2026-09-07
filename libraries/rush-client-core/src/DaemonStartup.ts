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

export function getDaemonStartupFilePath(paths: IDaemonPaths): string {
  return `${paths.lockfilePath}.starting`;
}

export function reserveDaemonStartup(paths: IDaemonPaths): string {
  const token: string = randomUUID();
  fs.writeFileSync(getDaemonStartupFilePath(paths), token, { flag: 'wx', mode: 0o600 });
  return token;
}

function assertReservation(paths: IDaemonPaths, token: string): void {
  if (fs.readFileSync(getDaemonStartupFilePath(paths), 'utf8') !== token) {
    throw new DaemonClientError('startupFailed', 'The daemon startup reservation changed ownership.');
  }
}

export function releaseDaemonStartup(paths: IDaemonPaths, token: string): void {
  assertReservation(paths, token);
  fs.unlinkSync(getDaemonStartupFilePath(paths));
}

/**
 * Runs independently of the requesting client. Once spawn succeeds, only protocol readiness releases
 * the reservation: an arbitrary launcher may outlive its parent or spawn descendants.
 * Failure before readiness deliberately leaves a durable reservation instead of guessing that a PID is safe.
 */
export async function runDaemonStartupAsync(options: IDaemonStartupOptions): Promise<void> {
  const { paths, startCommand: start, token, timeoutMs } = options;
  assertReservation(paths, token);
  let child: ChildProcess;
  try {
    child = spawn(start.command, [...start.args], {
      cwd: start.cwd,
      env: start.environment,
      detached: true,
      stdio: ['ignore', 1, 2],
      windowsHide: true
    });
    await once(child, 'spawn');
  } catch (error) {
    // No executable was started, so this helper can safely release its own reservation.
    releaseDaemonStartup(paths, token);
    throw error;
  }
  child.unref();

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
      throw new DaemonClientError(
        'startupFailed',
        `Launcher exited (${child.exitCode ?? child.signalCode}) before protocol readiness; startup reservation retained.`
      );
    }
    await delayAsync(Math.min(backoffMs, Math.max(1, deadline - Date.now())));
    backoffMs = Math.min(500, backoffMs * 2);
  }
  throw new DaemonClientError(
    'startupFailed',
    `Timed out awaiting daemon readiness; startup reservation retained at ${getDaemonStartupFilePath(paths)}.`
  );
}
