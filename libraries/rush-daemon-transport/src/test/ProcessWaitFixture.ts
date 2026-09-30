// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { setTimeout as delayAsync } from 'node:timers/promises';

import { readProcessStat } from '../DaemonProcessStat';
import type { IProcessStat } from '../DaemonProcessStat';

const NO_SUCH_PROCESS: string = 'ESRCH';
const FIRST_ATTEMPT: number = 0;
const POLL_ATTEMPTS: number = 250;
const POLL_INTERVAL_MS: number = 20;

/** `true` while `pid` runs; a zombie that has exited does not count. */
export function isAlive(pid: number): boolean {
  const stat: IProcessStat | undefined = readProcessStat(pid);
  return stat !== undefined && !stat.exited;
}

/** `true` once `pid` has exited and been reaped, so `/proc` has no record of it. */
export function isGone(pid: number): boolean {
  return readProcessStat(pid) === undefined;
}

/** Polls `condition` for up to 5 s. */
export async function waitUntilAsync(condition: () => boolean): Promise<boolean> {
  for (let attempt: number = FIRST_ATTEMPT; attempt < POLL_ATTEMPTS; attempt++) {
    if (condition()) return true;
    await delayAsync(POLL_INTERVAL_MS);
  }
  return condition();
}

/** A process a test started, identified by pid and start time so that a reused pid is never signaled. */
export interface IStartedProcess {
  readonly pid: number;
  readonly startTime: string | undefined;
}

/** Identifies processes a test has just started. */
export function identifyStarted(pids: readonly number[]): IStartedProcess[] {
  return pids.map((pid: number) => ({ pid, startTime: readProcessStat(pid)?.startTime }));
}

function isStillRunning({ pid, startTime }: IStartedProcess): boolean {
  return startTime !== undefined && readProcessStat(pid)?.startTime === startTime;
}

function killIfPresent(pid: number): void {
  try {
    process.kill(pid, 'SIGKILL');
  } catch (error) {
    // Killing one process can end another first: an operation that reads the fake daemon's pipe exits with it.
    if ((error as NodeJS.ErrnoException).code !== NO_SUCH_PROCESS) throw error;
  }
}

/** SIGKILLs the started processes that are still the same processes; for test cleanup only. */
export function killStillRunning(started: readonly IStartedProcess[]): void {
  for (const { pid } of started.filter(isStillRunning)) {
    killIfPresent(pid);
  }
}
