// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import { setTimeout as delayAsync } from 'node:timers/promises';

/** Only for PIDs captured from this test's own spawned fixtures, never for daemon ownership reclamation. */
export async function waitForTestProcessExitAsync(pid: number): Promise<void> {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) {
    throw new Error(`Invalid fixture process PID: ${pid}`);
  }
  const deadline: number = Date.now() + 5000;
  while (isRunning(pid)) {
    if (Date.now() >= deadline) throw new Error(`Fixture process ${pid} did not exit before cleanup.`);
    await delayAsync(10);
  }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    if (process.platform === 'linux') {
      const stat: string = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const separator: number = stat.lastIndexOf(') ');
      if (separator < 0) throw new Error(`Cannot inspect fixture process ${pid}.`);
      // Orphans may await reaping after their starter dies, but zombies have released their resources.
      return stat[separator + 2] !== 'Z';
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
