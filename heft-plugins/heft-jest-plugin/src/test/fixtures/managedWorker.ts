// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { isMainThread, threadId } from 'node:worker_threads';

export interface IWorkerIdentity {
  pid: number;
  threadId: number;
  isMainThread: boolean;
}

const logPath: string | undefined = process.env.MANAGED_WORKER_LOG;
if (!logPath) throw new Error('Missing fixture log path.');
const firstBootstrap: boolean = !existsSync(logPath);
const identity: IWorkerIdentity = { pid: process.pid, threadId, isMainThread };
const id: string = `${identity.pid}:${identity.threadId}`;
appendFileSync(logPath, `boot ${id}\n`);
if (firstBootstrap && process.env.MANAGED_WORKER_BOOT_EXIT) {
  process.exit(Number(process.env.MANAGED_WORKER_BOOT_EXIT));
}
if (process.env.MANAGED_WORKER_BOOT_DELAY) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 750);
}
appendFileSync(logPath, `ready ${id}\n`);

export function run(label: string, exitCode?: number): IWorkerIdentity {
  const firstAttempt: boolean = !readFileSync(logPath!, 'utf8').includes(`run ${label} `);
  appendFileSync(logPath!, `run ${label} ${id}\n`);
  // A replay would return successfully, so the parent must reject and record exactly one attempt.
  if (firstAttempt && exitCode !== undefined) process.exit(exitCode);
  return identity;
}
