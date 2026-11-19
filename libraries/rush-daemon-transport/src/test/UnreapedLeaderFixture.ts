// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import type { Readable } from 'node:stream';

import { readProcessStat } from '../DaemonProcessStat';

import { identifyStarted, killStillRunning, waitUntilAsync } from './ProcessWaitFixture';
import type { IStartedProcess } from './ProcessWaitFixture';

// sh without job control keeps a background job in the shell's process group, so the job leads no group
// and setsid(1) calls setsid() itself instead of forking. The shell then becomes a sleep, which never reaps
// the job.
const UNREAPED_LEADER_SCRIPT: string =
  'setsid sleep 600 </dev/null >/dev/null 2>&1 & echo $!; exec sleep 600';
const FIRST_INDEX: number = 0;

const started: IStartedProcess[] = [];

/**
 * Starts a process that leads its own session and process group, like a detached operation, and whose parent
 * never reaps it: once it exits, it stays a zombie. Returns its pid.
 */
export async function startUnreapedLeaderAsync(): Promise<number> {
  const parent: ChildProcess = spawn('/bin/sh', ['-c', UNREAPED_LEADER_SCRIPT], {
    stdio: ['ignore', 'pipe', 'ignore']
  });
  const [chunk] = (await once(parent.stdout as Readable, 'data')) as [Buffer];
  (parent.stdout as Readable).destroy();
  const pid: number = Number(chunk.toString().trim());
  started.push(...identifyStarted([Number(parent.pid), pid]));
  await waitUntilAsync(() => readProcessStat(pid)?.sessionId === pid);
  return pid;
}

/** `true` once `pid` has exited but is not reaped. */
export function isZombie(pid: number): boolean {
  return readProcessStat(pid)?.exited === true;
}

/** Kills the parents and leaders that are still the processes started; a parent's exit lets its zombie go. */
export function killUnreapedLeaders(): void {
  killStillRunning(started.splice(FIRST_INDEX));
}
