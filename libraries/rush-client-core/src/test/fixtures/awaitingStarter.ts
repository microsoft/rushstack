// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { DaemonClientError } from '../../DaemonClientError';
import type { IConnectOrStartDaemonOptions } from '../../connectOrStartDaemon';
import {
  DaemonStartupPendingError,
  connectOrAwaitDaemonStartupAsync
} from '../../connectOrAwaitDaemonStartup';

/**
 * Prints one JSON line: whether the client connected, may run Rush in-process, or must fail, and every
 * onAwaitStartup call. Given a folder as the second argument, it first appends its PID to "clients" there and
 * waits for a "go" file, and it appends its PID to "notices" there on each onAwaitStartup call.
 */
async function mainAsync(): Promise<void> {
  const options: IConnectOrStartDaemonOptions = JSON.parse(process.argv[2]);
  const signalFolder: string | undefined = process.argv[3];
  if (signalFolder) {
    fs.appendFileSync(path.join(signalFolder, 'clients'), `${process.pid}\n`);
    while (!fs.existsSync(path.join(signalFolder, 'go'))) await delayAsync(10);
  }
  const startedAt: number = Date.now();
  const notices: { owner: string; waitMs: number }[] = [];
  try {
    const client = await connectOrAwaitDaemonStartupAsync({
      ...options,
      onAwaitStartup: (owner: string, waitMs: number) => {
        notices.push({ owner, waitMs });
        if (signalFolder) fs.appendFileSync(path.join(signalFolder, 'notices'), `${process.pid}\n`);
      }
    });
    const elapsedMs: number = Date.now() - startedAt;
    const { pid } = await client.status;
    await client.closeAsync();
    process.stdout.write(`${JSON.stringify({ kind: 'connected', pid, elapsedMs, notices })}\n`);
  } catch (error) {
    const kind: string =
      error instanceof DaemonStartupPendingError
        ? 'pending'
        : error instanceof DaemonClientError
          ? 'fallback'
          : 'error';
    const elapsedMs: number = Date.now() - startedAt;
    process.stdout.write(
      `${JSON.stringify({ kind, message: (error as Error).message, elapsedMs, notices })}\n`
    );
  }
}

mainAsync().catch((error: Error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
