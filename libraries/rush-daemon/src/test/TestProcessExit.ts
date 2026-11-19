// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import { setTimeout as delayAsync } from 'node:timers/promises';

/** Call after resource joins. Windows sharing retries wait at most 1.5 seconds in total; other errors fail. */
export async function removeTestFolderAsync(folder: string, force: boolean = false): Promise<void> {
  for (let attempt: number = 0; ; attempt++) {
    try {
      await fs.promises.rm(folder, { recursive: true, force });
      return;
    } catch (error) {
      if (
        process.platform !== 'win32' ||
        attempt >= 5 ||
        typeof error !== 'object' ||
        error === null ||
        !('code' in error) ||
        (error.code !== 'EPERM' && error.code !== 'EBUSY' && error.code !== 'ENOTEMPTY')
      )
        throw error;
    }
    await delayAsync((attempt + 1) * 100);
  }
}

export interface ITestProcessIdentity {
  readonly pid: number;
  readonly linuxStartTime?: string;
}

/** Captures kernel identity before an owned Linux process can exit and its PID can be reused. */
export function captureTestProcessIdentity(pid: number): ITestProcessIdentity {
  validatePid(pid);
  return Object.freeze({
    pid,
    linuxStartTime: process.platform === 'linux' ? readLinuxStat(pid).startTime : undefined
  });
}

/** Only for captured fixture processes, never for daemon ownership reclamation. */
export async function waitForTestProcessExitAsync(
  processIdentity: number | ITestProcessIdentity,
  timeoutMs: number = 5000
): Promise<void> {
  const pid: number = typeof processIdentity === 'number' ? processIdentity : processIdentity.pid;
  validatePid(pid);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 0x7fffffff) {
    throw new RangeError('Expected a bounded nonnegative fixture exit timeout.');
  }
  const deadline: number = Date.now() + timeoutMs;
  while (isTestProcessRunning(processIdentity)) {
    const remaining: number = deadline - Date.now();
    if (remaining <= 0) throw new Error(`Fixture process ${pid} did not exit before cleanup.`);
    await delayAsync(Math.min(10, remaining));
  }
}

function validatePid(pid: number): void {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) {
    throw new Error(`Invalid fixture process PID: ${pid}`);
  }
}

/** A replaced PID or a zombie with no descriptor table no longer owns the fixture's executable work. */
export function isTestProcessRunning(processIdentity: number | ITestProcessIdentity): boolean {
  const identity: ITestProcessIdentity =
    typeof processIdentity === 'number' ? { pid: processIdentity } : processIdentity;
  const { pid, linuxStartTime } = identity;
  validatePid(pid);
  try {
    process.kill(pid, 0);
    if (process.platform === 'linux') {
      const stat = readLinuxStat(pid);
      if (linuxStartTime !== undefined && stat.startTime !== linuxStartTime) return false;
      if (stat.state !== 'Z') return true;
      const status: string = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
      const fdSize: RegExpExecArray | null = /^FDSize:\s*(\d+)\s*$/m.exec(status);
      if (!fdSize) throw new Error(`Cannot inspect fixture process ${pid} descriptors.`);
      return fdSize[1] !== '0';
    }
    return true;
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error.code === 'ESRCH' || (process.platform === 'linux' && error.code === 'ENOENT'))
    )
      return false;
    throw error;
  }
}

function readLinuxStat(pid: number): { state: string; startTime: string } {
  const stat: string = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  const separator: number = stat.lastIndexOf(') ');
  const fields: string[] = stat
    .slice(separator + 2)
    .trim()
    .split(/\s+/);
  if (separator < 0 || !/^\d+$/.test(fields[19] ?? '')) {
    throw new Error(`Cannot inspect fixture process ${pid}.`);
  }
  return { state: fields[0], startTime: fields[19] };
}
