// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { execFile } from 'node:child_process';
import { setTimeout as delayAsync } from 'node:timers/promises';

const DEFAULT_EXIT_TIMEOUT_MS: number = 5_000;
const EXIT_POLL_INTERVAL_MS: number = 10;
const MAX_TIMEOUT_MS: number = 0x7fffffff;

/** Waits for a captured detached Linux group/session to disappear or contain only zombies. */
export async function waitForLinuxProcessGroupExitAsync(
  groupId: number,
  timeoutMs: number = DEFAULT_EXIT_TIMEOUT_MS
): Promise<void> {
  if (!Number.isSafeInteger(groupId) || groupId <= 0 || groupId === process.pid) {
    throw new RangeError('Expected an owned child process group ID.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new RangeError('Expected a positive bounded process group exit timeout.');
  }
  const deadline: number = Date.now() + timeoutMs;
  while (processGroupExists(groupId)) {
    const remaining: number = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`Owned Linux process group ${groupId} did not exit within ${timeoutMs}ms.`);
    }
    const states: string[] = await readSessionStatesAsync(groupId, remaining);
    if (states.length > 0 && states.every((state) => state.startsWith('Z'))) return;
    await delayAsync(Math.min(EXIT_POLL_INTERVAL_MS, remaining));
  }
}

function processGroupExists(groupId: number): boolean {
  try {
    // Probe only. Never signal a potentially reused group while waiting for cleanup.
    process.kill(-groupId, 0);
    return true;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH') {
      return false;
    }
    throw error;
  }
}

function readSessionStatesAsync(groupId: number, timeoutMs: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    // detached=true creates a new process group and session with the child's PID.
    execFile(
      'ps',
      ['--sid', String(groupId), '-o', 'stat='],
      {
        encoding: 'utf8',
        timeout: timeoutMs
      },
      (error, stdout, stderr) => {
        if (error && !(error.code === 1 && !stdout.trim() && !stderr.trim())) {
          reject(error);
        } else if (stderr.trim()) {
          reject(new Error(`Cannot inspect owned Linux process group ${groupId}: ${stderr.trim()}`));
        } else {
          resolve(stdout.trim() ? stdout.trim().split(/\s+/) : []);
        }
      }
    );
  });
}
