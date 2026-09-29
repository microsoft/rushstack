// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import type { Readable } from 'node:stream';

import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';
import {
  isDaemonProcessAlive,
  writeDaemonLockfile,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';

import { isProcessDefunct } from '../ProcessStartTime';

// An operation process that a stand-in daemon starts; it exits by itself after a minute.
const OPERATION_SCRIPT: string = 'setTimeout(()=>{},60000)';
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
