// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';

/**
 * Runs `callbackAsync` with the PID of a process that exits after 200 ms but stays unreaped, because its parent
 * never waits for it, and the parent's PID. POSIX only.
 */
export async function withUnreapedChildAsync(
  callbackAsync: (pid: number, parentPid: number) => Promise<void>
): Promise<void> {
  // The shell starts a short-lived child, then becomes a process that never reaps it.
  const parent: ChildProcess = spawn('/bin/sh', ['-c', 'sleep 0.2 & echo $!; exec sleep 10'], {
    stdio: ['ignore', 'pipe', 'ignore']
  });
  const closed: Promise<unknown[]> = once(parent, 'close');
  try {
    const [output] = await once(parent.stdout!, 'data');
    await callbackAsync(Number(String(output).trim()), parent.pid!);
  } finally {
    parent.kill();
    await closed;
  }
}
