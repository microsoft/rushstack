// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Readable } from 'node:stream';

import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';
import {
  formatOperationGroupLeftRunning,
  isDaemonProcessAlive,
  writeDaemonLockfile,
  type DaemonOperationGroupLeftRunningReason,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';

import { getDaemonLogFilePath } from '../DaemonLogFile';
import { isProcessDefunct } from '../ProcessStartTime';

/** An operation process that a stand-in daemon starts; it exits by itself after a minute. */
export const OPERATION_SCRIPT: string = 'setTimeout(()=>{},60000)';
// A stand-in daemon: like a phased operation, which is spawned without `detached`, its operation process
// inherits the daemon's process group. It prints that process's PID.
const FAKE_DAEMON_SCRIPT: string =
  "const c=require('node:child_process')" +
  `.spawn(process.execPath,['-e','${OPERATION_SCRIPT}'],{stdio:'ignore'});` +
  "process.stdout.write(String(c.pid)+'\\n');setInterval(()=>{},1000);";

/** A stand-in daemon that this test process started, and the operation process that it started. */
export interface IStandInDaemon {
  readonly daemon: ChildProcess;
  readonly operationPid: number;
}

/**
 * Starts a stand-in daemon in its own process group, and waits for its operation process. The operation's PID
 * is added to `operationPids` first, so that {@link stopOperationIfRunning} can clean it up. POSIX only.
 */
export async function startStandInDaemonAsync(operationPids: number[]): Promise<IStandInDaemon> {
  const daemon: ChildProcess = spawn(process.execPath, ['-e', FAKE_DAEMON_SCRIPT], {
    detached: true,
    stdio: ['ignore', 'pipe', 'ignore']
  });
  const stdout: Readable = daemon.stdout!;
  const [chunk] = (await once(stdout, 'data')) as [Buffer];
  stdout.destroy();
  const operationPid: number = Number(chunk.toString().trim());
  operationPids.push(operationPid);
  return { daemon, operationPid };
}

/** Starts a stand-in daemon and SIGKILLs only it, so its operation process keeps running. POSIX only. */
export async function startOrphanedOperationAsync(
  operationPids: number[]
): Promise<{ daemonPid: number; operationPid: number }> {
  const { daemon, operationPid } = await startStandInDaemonAsync(operationPids);
  daemon.kill('SIGKILL');
  await once(daemon, 'exit');
  if (!isRunning(operationPid)) throw new Error(`The orphaned operation ${operationPid} is not running.`);
  return { daemonPid: daemon.pid!, operationPid };
}

/**
 * Starts an operation process that leads its own process group and session, as Rush starts an operation. Its PID
 * is added to `operationPids` first, so that {@link stopOperationIfRunning} can clean it up. POSIX only.
 */
export async function startDetachedOperationAsync(operationPids: number[]): Promise<number> {
  const operation: ChildProcess = spawn(process.execPath, ['-e', OPERATION_SCRIPT], {
    detached: true,
    stdio: 'ignore'
  });
  await once(operation, 'spawn');
  operationPids.push(operation.pid!);
  return operation.pid!;
}

/** Starts a process and waits until it has exited and was reaped, so that its PID names no process. */
export async function startExitedProcessAsync(): Promise<number> {
  const child: ChildProcess = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  await once(child, 'exit');
  return child.pid!;
}

// Fields after the ")" that ends the command name in /proc/<pid>/stat; starttime is field 22 of the record.
const START_TIME_INDEX: number = 20;

/** The start time that a daemon records for an operation process group (clock ticks after boot). Linux only. */
export function readProcessStartTime(pid: number): string {
  const stat: string = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  // The command name may contain spaces and ")".
  return stat.slice(stat.lastIndexOf(')')).split(' ')[START_TIME_INDEX];
}

/**
 * Records the operation process group `groupId` of daemon `daemonPid` as the daemon does: an empty file named
 * `<groupId>-<startTime>` in the folder `<lockfile>.groups-<daemonPid>`.
 */
export function recordOperationGroup(
  lockfilePath: string,
  daemonPid: number,
  groupId: number,
  startTime: string
): void {
  const folder: string = `${lockfilePath}.groups-${daemonPid}`;
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(folder, `${groupId}-${startTime}`), '', { mode: 0o600 });
}

/** Writes the ownership record that a daemon with this PID would write. */
export function recordDaemonOwner(
  paths: IDaemonPaths,
  pid: number,
  startedAt: string = new Date().toISOString()
): void {
  writeDaemonLockfile(paths.lockfilePath, {
    pid,
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    startedAt,
    socketPath: paths.socketPath
  });
}

/** True while the process exists and has not exited. */
export function isRunning(pid: number): boolean {
  return isDaemonProcessAlive(pid) && !isProcessDefunct(pid);
}

/** SIGKILLs an operation process that a stand-in daemon started, unless it has exited. Linux only. */
export function stopOperationIfRunning(pid: number): void {
  try {
    // Only the operation process that this test started, not a process that reused its PID.
    if (fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes(OPERATION_SCRIPT)) {
      process.kill(pid, 'SIGKILL');
    }
  } catch {
    // It has exited.
  }
}

// A line that a client appends to the launcher log.
const CLIENT_LOG_LINE: RegExp = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z rush-client \(PID (\d+)\): (.*)$/;

/** The texts of the lines that this process appended to the launcher log, in order. */
export function readClientLogTexts(paths: IDaemonPaths): string[] {
  const logFilePath: string = getDaemonLogFilePath(paths);
  const lines: string[] = fs.existsSync(logFilePath) ? fs.readFileSync(logFilePath, 'utf8').split('\n') : [];
  return lines.flatMap((line: string) => {
    const match: RegExpExecArray | null = CLIENT_LOG_LINE.exec(line);
    return match && Number(match[1]) === process.pid ? [match[2]] : [];
  });
}

/** The text of the line that a client appends for a recorded group that its reclaim left running. */
export function describeGroupLeftRunning(
  daemonPid: number,
  processGroupId: number,
  reason: DaemonOperationGroupLeftRunningReason
): string {
  return `${formatOperationGroupLeftRunning({ daemonPid, processGroupId, reason })}.`;
}
