// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { setTimeout as delayAsync } from 'node:timers/promises';

import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import {
  getDefaultOwnerProcessReaders,
  type IOwnerProcessReaders,
  type IStoppedProcess
} from './DaemonOwnerDiagnosis';
import { isOwnerProcessAlive, readDaemonOwnership, type DaemonOwnership } from './DaemonOwnership';
import type { IProcessState } from './ProcessStartTime';

/**
 * How long the recorded owner must stay stopped before a client stops waiting for it. A stop under job control
 * (Ctrl+Z, then `fg`), a STOP/CONT pair or a tracer that stops the process at each system call is shorter.
 */
export const STOPPED_OWNER_WINDOW_MS: number = 1500;
const STOPPED_OWNER_SAMPLE_INTERVAL_MS: number = 100;

/**
 * The daemon owner that the record at `paths.lockfilePath` names, when it has that record open, as the daemon that
 * wrote it does for as long as it owns it (also after its socket file was deleted), and every sample of its state
 * over {@link STOPPED_OWNER_WINDOW_MS} reads T or t, with the same start time. Until something resumes it, it
 * cannot answer, and while it lives, no client starts another daemon. On Linux only.
 * @returns `undefined` otherwise, including when a sample cannot be read, when the process resumed or its PID
 * now names another process, when less than that window remains before `deadline`, and once `signal` aborts.
 * The first sample ends the sampling for any other owner, or none.
 */
export async function findStoppedDaemonOwnerAsync(
  paths: IDaemonPaths,
  deadline: number,
  signal?: AbortSignal,
  readers: IOwnerProcessReaders = getDefaultOwnerProcessReaders()
): Promise<IStoppedProcess | undefined> {
  if (deadline - Date.now() < STOPPED_OWNER_WINDOW_MS) return undefined;
  const stopped: IStoppedProcess | undefined = readStoppedDaemonOwner(paths, readers);
  if (!stopped) return undefined;
  const end: number = Date.now() + STOPPED_OWNER_WINDOW_MS;
  while (Date.now() < end) {
    try {
      await delayAsync(Math.min(STOPPED_OWNER_SAMPLE_INTERVAL_MS, Math.max(1, end - Date.now())), undefined, {
        signal
      });
    } catch {
      // Aborted: the caller no longer waits for the answer.
      return undefined;
    }
    if (!isStillStopped(stopped, readers)) return undefined;
  }
  return stopped;
}

/**
 * Whether this workspace's daemon cannot exit or answer before something resumes it: on Linux, the process that
 * the ownership record at `paths.lockfilePath` names has that record open, as the daemon that wrote it does, and
 * every sample of its state over 1.5 seconds reads stopped, by a signal (T) or a tracer (t), with the same start
 * time. `rush-client daemon stop` uses it to stop waiting for such a daemon to exit.
 * @returns `false` otherwise, including outside Linux, and at once when less than 1.5 seconds remain before
 * `deadline`. The first sample ends the sampling for any other owner, or none.
 * @beta
 */
export async function isDaemonOwnerStoppedAsync(paths: IDaemonPaths, deadline: number): Promise<boolean> {
  return (await findStoppedDaemonOwnerAsync(paths, deadline)) !== undefined;
}

/**
 * Whether the record at `paths.lockfilePath` still names `stopped`, which still has that record open and is still
 * stopped (state T or t, with the same start time).
 */
export function isDaemonOwnerStillStopped(
  paths: IDaemonPaths,
  stopped: IStoppedProcess,
  readers: IOwnerProcessReaders = getDefaultOwnerProcessReaders()
): boolean {
  const current: IStoppedProcess | undefined = readStoppedDaemonOwner(paths, readers);
  return current?.pid === stopped.pid && current.startTicks === stopped.startTicks;
}

function readStoppedDaemonOwner(
  paths: IDaemonPaths,
  readers: IOwnerProcessReaders
): IStoppedProcess | undefined {
  let owner: DaemonOwnership | undefined;
  try {
    owner = readDaemonOwnership(paths.lockfilePath);
    if (!owner || !isOwnerProcessAlive(owner)) return undefined;
  } catch {
    // An unreadable record or a process of another user is no evidence of a stopped owner.
    return undefined;
  }
  const state: IProcessState | undefined = readers.readState(owner.pid);
  if (!state || !isStoppedState(state) || state.startTicks === undefined) return undefined;
  // Only the daemon that wrote the record has it open, which ties the record to that process rather than to a
  // reused PID.
  if (readers.hasFileOpen(owner.pid, paths.lockfilePath) !== true) return undefined;
  return { pid: owner.pid, startTicks: state.startTicks };
}

function isStillStopped(stopped: IStoppedProcess, readers: IOwnerProcessReaders): boolean {
  const state: IProcessState | undefined = readers.readState(stopped.pid);
  return state !== undefined && isStoppedState(state) && state.startTicks === stopped.startTicks;
}

function isStoppedState(state: IProcessState): boolean {
  return state.code === 'T' || state.code === 't';
}
