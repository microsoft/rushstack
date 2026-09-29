// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import { setTimeout as delayAsync } from 'node:timers/promises';

import type { IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';
import {
  DaemonTransportError,
  DaemonTransportErrorCode,
  readDaemonLockfile,
  type IDaemonLockfile,
  type IDaemonPaths,
  type IDaemonReclaimOptions
} from '@rushstack/rush-daemon-transport';

import type { DaemonClient } from './DaemonClient';
import { DAEMON_DISCONNECTED_MESSAGE, DaemonClientError } from './DaemonClientError';
import { getDaemonLogFilePath } from './DaemonLogFile';
import { isOwnerProcessAlive } from './DaemonOwnership';
import { reclaimExitedDaemonAsync } from './ExitedDaemonReclaim';
import { isProcessDefunct } from './ProcessStartTime';

/** A process closes its connections while it exits, so it can briefly outlive them. */
const EXIT_WAIT_MS: number = 1000;
const EXIT_POLL_INTERVAL_MS: number = 20;
/** A crash report is the last thing a daemon writes; a successor started since then writes little. */
const MAX_LOG_READ_BYTES: number = 64 * 1024;
const MAX_LOGGED_ERROR_LENGTH: number = 240;

const V8_FATAL_ERROR: RegExp = /^FATAL ERROR: \S/;
const NODE_REPORT_TRAILER: RegExp = /^Node\.js v\d+\.\d+\.\d+/;
const SOURCE_LOCATION: RegExp = /:\d+$/;
const SOURCE_ARROW: RegExp = /^\s*\^[\^~]*\s*$/;
const STACK_FRAME: RegExp = /^\s+at /;
const TRACE_UNCAUGHT_HINT: string = '(Use `node --trace-uncaught';
const CONTROL_CHARACTERS: RegExp = /\p{Cc}/gu;

/** The daemon process that serves a request, and the size of its launcher log when the request was sent. */
export interface IServingDaemon {
  readonly pid: number;
  /** The ownership record's start time when the record names this process; it detects a reused PID. */
  readonly startedAt: string | undefined;
  readonly logFilePath: string;
  readonly logOffset: number | undefined;
  /** The workspace's daemon files, which are reclaimed if the process exits. */
  readonly paths: IDaemonPaths;
}

/** Identifies the daemon behind a ready client, or returns undefined for a peer that does not report its PID. */
export async function observeServingDaemonAsync(
  client: DaemonClient,
  paths: IDaemonPaths
): Promise<IServingDaemon | undefined> {
  const { pid } = await client.status;
  if (pid === undefined) return undefined;
  const owner: IDaemonLockfile | undefined = readDaemonLockfile(paths.lockfilePath);
  const logFilePath: string = getDaemonLogFilePath(paths);
  return {
    pid,
    startedAt: owner?.pid === pid ? owner.startedAt : undefined,
    logFilePath,
    logOffset: tryGetFileSize(logFilePath),
    paths
  };
}

/**
 * Explains a connection lost before a request's result by what happened to the daemon process: whether it
 * exited, the fatal error its launcher log recorded, and how to recover. The request is never replayed.
 * Other errors are returned unchanged.
 * @remarks If the daemon exited, this first reclaims it as the next daemon start would, so that running the
 * command again, with or without the daemon, cannot race the operations the daemon left running.
 */
export async function explainLostConnectionAsync(
  error: unknown,
  daemon: IServingDaemon | undefined,
  request: IDaemonRequestEnvelope,
  reclaimOptions?: IDaemonReclaimOptions
): Promise<unknown> {
  if (!daemon || !isConnectionLoss(error)) return error;
  const exited: boolean | undefined = await waitForExitAsync(daemon);
  if (exited === undefined) return error;
  if (!exited) {
    return new DaemonClientError(
      'disconnected',
      `${DAEMON_DISCONNECTED_MESSAGE} The connection to rushd (PID ${daemon.pid}) closed, but the daemon is still running; run the command again.`,
      { cause: error }
    );
  }
  const loggedError: string | undefined = readLoggedFatalError(daemon);
  await reclaimExitedDaemonAsync(daemon, reclaimOptions);
  const client: string = request.invocationKind === 'rushx' ? 'rushx-client' : 'rush-client';
  const message: string =
    `${DAEMON_DISCONNECTED_MESSAGE} rushd (PID ${daemon.pid}) exited while it ran the command; ` +
    `"rush-client daemon logs" ${loggedError ? 'shows' : 'may show'} why. Run the command again; ` +
    `if the daemon exits again, run the command with "${client} --no-daemon".`;
  return new DaemonClientError(
    'disconnected',
    loggedError ? `${message}\nThe daemon log reports: ${loggedError}` : message,
    { cause: error }
  );
}

/**
 * Returns the first fatal error in launcher log lines: V8's `FATAL ERROR:` line, or the message of Node's report
 * of an uncaught exception (its location, source line and caret, the error with its stack, then the Node.js
 * version). Returns undefined when the first report does not have that shape.
 */
export function findLoggedFatalError(lines: ReadonlyArray<string>): string | undefined {
  for (let index: number = 0; index < lines.length; index++) {
    if (V8_FATAL_ERROR.test(lines[index])) return lines[index].trim();
    if (NODE_REPORT_TRAILER.test(lines[index])) return findUncaughtErrorMessage(lines, index);
  }
  return undefined;
}

function findUncaughtErrorMessage(lines: ReadonlyArray<string>, trailer: number): string | undefined {
  let arrow: number = trailer - 1;
  while (arrow >= 2 && !SOURCE_ARROW.test(lines[arrow])) arrow--;
  if (arrow < 2 || !SOURCE_LOCATION.test(lines[arrow - 2])) return undefined;
  const message: string[] = [];
  for (let index: number = arrow + 1; index < trailer && !STACK_FRAME.test(lines[index]); index++) {
    const line: string = lines[index].trim();
    if (line && !line.startsWith(TRACE_UNCAUGHT_HINT)) message.push(line);
  }
  return message.length ? message.join(' ') : undefined;
}

function isConnectionLoss(error: unknown): boolean {
  if (error instanceof DaemonClientError) return error.code === 'disconnected';
  if (error instanceof DaemonTransportError) return error.code === DaemonTransportErrorCode.transportClosed;
  const code: unknown =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return code === 'ECONNRESET' || code === 'EPIPE';
}

/** Resolves true once the process is gone, false if it still runs after the wait, or undefined if unknown. */
async function waitForExitAsync(daemon: IServingDaemon): Promise<boolean | undefined> {
  const deadline: number = Date.now() + EXIT_WAIT_MS;
  for (;;) {
    try {
      if (!isOwnerProcessAlive(daemon) || isProcessDefunct(daemon.pid)) return true;
    } catch {
      // For example EPERM: the PID exists but cannot be inspected.
      return undefined;
    }
    if (Date.now() >= deadline) return false;
    await delayAsync(EXIT_POLL_INTERVAL_MS);
  }
}

/** The fatal error that the launcher log gained since the request was sent, clipped to one printable line. */
function readLoggedFatalError(daemon: IServingDaemon): string | undefined {
  if (daemon.logOffset === undefined) return undefined;
  const text: string | undefined = readLogTail(daemon.logFilePath, daemon.logOffset);
  const loggedError: string | undefined = text && findLoggedFatalError(text.split(/\r?\n/));
  if (!loggedError) return undefined;
  const printable: string = loggedError.replace(CONTROL_CHARACTERS, '');
  return printable.length > MAX_LOGGED_ERROR_LENGTH
    ? `${printable.slice(0, MAX_LOGGED_ERROR_LENGTH - 1)}…`
    : printable;
}

/** Reads at most the last {@link MAX_LOG_READ_BYTES} after `offset`; undefined when the log cannot be read. */
function readLogTail(logFilePath: string, offset: number): string | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(
      logFilePath,
      // These distinct native flags have non-overlapping values.
      fs.constants.O_RDONLY +
        (process.platform === 'win32' ? 0 : fs.constants.O_NOFOLLOW + fs.constants.O_NONBLOCK)
    );
    // A bigint stat; see tryGetFileSize.
    const stats: fs.BigIntStats = fs.fstatSync(fd, { bigint: true });
    const size: number = Number(stats.size);
    if (!stats.isFile() || size < offset) return undefined;
    const start: number = Math.max(offset, size - MAX_LOG_READ_BYTES);
    const buffer: Buffer = Buffer.alloc(size - start);
    return buffer.toString('utf8', 0, fs.readSync(fd, buffer, 0, buffer.length, start));
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * A plain stat would leave the file's type in Node's shared stat array, which Node's cached realpath reads: after
 * a FIFO or socket, a later require() in this process, such as by Rush run in-process, would not resolve symlinks.
 * A bigint stat fills another array.
 */
function tryGetFileSize(filePath: string): number | undefined {
  try {
    const stats: fs.BigIntStats = fs.statSync(filePath, { bigint: true });
    return stats.isFile() ? Number(stats.size) : undefined;
  } catch {
    return undefined;
  }
}
