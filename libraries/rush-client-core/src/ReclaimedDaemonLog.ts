// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { getDaemonLogFilePath } from './DaemonLogFile';

/** Only the end of the log matters: once a daemon became ready after the reclaim, nothing is reported. */
const MAX_LOG_READ_BYTES: number = 64 * 1024;
const RECLAIM_LINE: RegExp =
  /^\S+ rush-client \(PID \d+\): rushd \(PID (\d+)\) exited without shutting down;/;
const RESET_LINE: RegExp = /^\S+ rush-client \(PID \d+\): reset the daemon's files;/;
/** Every daemon writes this line once it is ready, with or without a time and PID before and after it. */
const READY_LINE: RegExp = /\brushd ready at /;

/**
 * Appends a line to the workspace's launcher log that says that the daemon with this PID exited without shutting
 * down and that this client reclaimed it. The reclaim removed the ownership record that named the daemon, so this
 * line is what `rush-client daemon status` reads afterwards ({@link findReclaimedDaemonPid}). Best effort: it
 * writes only to a regular, unshared file of this user, as the launcher does, and it never throws.
 */
export function logReclaimedDaemon(paths: IDaemonPaths, pid: number): void {
  appendClientLine(
    paths,
    `rushd (PID ${pid}) exited without shutting down; stopped any operations it left running and removed ` +
      'its ownership record and socket.'
  );
}

/**
 * Clears the report of the daemon that a client last reclaimed, if one is reported ({@link findReclaimedDaemonPid}),
 * with a line in the launcher log, for a reset of the workspace's daemon files. Best effort; it never throws.
 */
export function clearReclaimedDaemonReport(paths: IDaemonPaths): void {
  const pid: number | undefined = findReclaimedDaemonPid(paths);
  if (pid !== undefined) {
    appendClientLine(
      paths,
      `reset the daemon's files; the report that rushd (PID ${pid}) exited without shutting down is cleared.`
    );
  }
}

/**
 * Returns the PID of the daemon that a client last reclaimed because it exited without shutting down, as the
 * workspace's launcher log records it, unless a daemon became ready after that or `resetDaemonArtifactsAsync()`
 * (`rush-client daemon stop --force`) cleared the report.
 *
 * @remarks
 * A client reclaims such a daemon after it lost the connection to it, or before Rush runs in-process; the reclaim
 * removes the daemon's ownership record and socket, and appends a line that names the daemon to the launcher log.
 * This reads at most the log's last 64 KiB. It returns undefined when the log cannot be read, and never throws.
 *
 * @beta
 */
export function findReclaimedDaemonPid(paths: IDaemonPaths): number | undefined {
  const lines: string[] | undefined = readLogTailLines(getDaemonLogFilePath(paths));
  if (!lines) return undefined;
  for (let index: number = lines.length - 1; index >= 0; index--) {
    if (READY_LINE.test(lines[index]) || RESET_LINE.test(lines[index])) return undefined;
    const match: RegExpExecArray | null = RECLAIM_LINE.exec(lines[index]);
    if (match) {
      const pid: number = Number(match[1]);
      return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined;
    }
  }
  return undefined;
}

interface IAppendableLog {
  readonly fd: number;
  /** Whether the log was also opened for reading. */
  readonly readable: boolean;
}

/**
 * Appends one line in the form of the launcher's own lines, under the launcher's checks of the log file. When
 * the log ends inside a line, for example after a daemon that was killed before it finished one, the line starts
 * on a line of its own, so that {@link findReclaimedDaemonPid} can read it; that needs a log this user may read.
 */
function appendClientLine(paths: IDaemonPaths, text: string): void {
  let log: IAppendableLog | undefined;
  try {
    log = openLogForAppend(getDaemonLogFilePath(paths));
    const stats: fs.BigIntStats = statOpenLog(log.fd);
    if (!stats.isFile() || stats.nlink !== 1n) return;
    if (process.platform !== 'win32') {
      if (Number(stats.uid) !== process.getuid?.()) return;
      fs.fchmodSync(log.fd, 0o600);
    }
    const separator: string = log.readable && endsInsideLine(log.fd, Number(stats.size)) ? '\n' : '';
    fs.writeSync(
      log.fd,
      `${separator}${new Date().toISOString()} rush-client (PID ${process.pid}): ${text}\n`
    );
  } catch {
    // Whatever the line reports is done; only the report of it is lost.
  } finally {
    if (log !== undefined) fs.closeSync(log.fd);
  }
}

/** Opens the log to read it too when this user may, and else, as the launcher does, only to write to it. */
function openLogForAppend(logFilePath: string): IAppendableLog {
  // These distinct native flags have non-overlapping values.
  const flags: number =
    fs.constants.O_APPEND +
    fs.constants.O_CREAT +
    (process.platform === 'win32' ? 0 : fs.constants.O_NOFOLLOW + fs.constants.O_NONBLOCK);
  try {
    return { fd: fs.openSync(logFilePath, fs.constants.O_RDWR + flags, 0o600), readable: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EACCES') throw error;
    return { fd: fs.openSync(logFilePath, fs.constants.O_WRONLY + flags, 0o600), readable: false };
  }
}

function endsInsideLine(fd: number, size: number): boolean {
  if (size === 0) return false;
  const lastByte: Buffer = Buffer.alloc(1);
  return fs.readSync(fd, lastByte, 0, 1, size - 1) === 1 && lastByte[0] !== 0x0a;
}

/**
 * Stats the open log. A plain stat would leave the log's file type in Node's shared stat array, and Node's cached
 * realpath reads that array: after a FIFO, the next require() in this process would not resolve symlinks, so a
 * package that pnpm installed could not find its dependencies. A bigint stat fills another array.
 */
function statOpenLog(fd: number): fs.BigIntStats {
  return fs.fstatSync(fd, { bigint: true });
}

function readLogTailLines(logFilePath: string): string[] | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(
      logFilePath,
      // These distinct native flags have non-overlapping values.
      fs.constants.O_RDONLY +
        (process.platform === 'win32' ? 0 : fs.constants.O_NOFOLLOW + fs.constants.O_NONBLOCK)
    );
    const stats: fs.BigIntStats = statOpenLog(fd);
    if (!stats.isFile()) return undefined;
    const size: number = Number(stats.size);
    const start: number = Math.max(0, size - MAX_LOG_READ_BYTES);
    const buffer: Buffer = Buffer.alloc(size - start);
    const lines: string[] = buffer
      .toString('utf8', 0, fs.readSync(fd, buffer, 0, buffer.length, start))
      .split(/\r?\n/);
    // A read that starts inside the log can start inside a line.
    if (start > 0) lines.shift();
    return lines;
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
