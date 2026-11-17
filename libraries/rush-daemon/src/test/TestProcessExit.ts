// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
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
  readonly windowsStartTime?: string;
  readonly exited?: true;
}

/** Captures kernel identity before an owned process can exit and its PID can be reused. */
export function captureTestProcessIdentity(pid: number): ITestProcessIdentity {
  validatePid(pid);
  if (process.platform === 'win32') {
    const windowsStartTime: string | undefined = readWindowsStartTime(pid);
    return Object.freeze(windowsStartTime === undefined ? { pid, exited: true } : { pid, windowsStartTime });
  }
  let linuxStartTime: string | undefined;
  if (process.platform === 'linux') {
    try {
      linuxStartTime = readLinuxStat(pid).startTime;
    } catch (error) {
      if (!isMissingProcess(error)) throw error;
      return Object.freeze({ pid, exited: true });
    }
  }
  return Object.freeze({
    pid,
    linuxStartTime
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
  const { pid, linuxStartTime, windowsStartTime } = identity;
  validatePid(pid);
  if (identity.exited) return false;
  try {
    process.kill(pid, 0);
    if (windowsStartTime !== undefined) return readWindowsStartTime(pid) === windowsStartTime;
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
    if (isMissingProcess(error)) return false;
    throw error;
  }
}

function isMissingProcess(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ESRCH' || (process.platform === 'linux' && error.code === 'ENOENT'))
  );
}

function readWindowsStartTime(pid: number): string | undefined {
  const startTime: string = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$ErrorActionPreference='Stop'; ` +
        `try { $target=[Diagnostics.Process]::GetProcessById(${pid}) } ` +
        `catch [ArgumentException] { exit 0 }; ` +
        `try { ` +
        // Hold the original process handle while reading its creation time, even if it exits meanwhile.
        `$null=$target.Handle; ` +
        `[Console]::Write($target.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture)) ` +
        `} catch [InvalidOperationException] { if (!$target.HasExited) { throw } } ` +
        `finally { $target.Dispose() }`
    ],
    { encoding: 'utf8', windowsHide: true, timeout: 5000 }
  ).trim();
  if (!startTime) return undefined;
  if (!/^\d+$/.test(startTime)) throw new Error(`Cannot inspect fixture process ${pid} creation time.`);
  return startTime;
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
