// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { DaemonClient, requestDaemonShutdownAsync } from '@rushstack/rush-client-core';
import {
  readDaemonLockfile,
  type IDaemonLockfile,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';
import { waitForTestProcessExitAsync } from './TestProcessExit';

/** Waits on attested ownership removal, not an arbitrary sleep or mere connection close. */
export async function stopSuccessorAsync(paths: IDaemonPaths): Promise<void> {
  const owner: IDaemonLockfile | undefined = readDaemonLockfile(paths.lockfilePath);
  if (!owner || owner.pid === process.pid) return;
  const { pid: ownerPid, startedAt: ownerStartedAt } = owner;
  const client: DaemonClient = await DaemonClient.connectAsync({ socketPath: paths.socketPath });
  const removed: Promise<void> = new Promise((resolve, reject) => {
    const timeout: NodeJS.Timeout = setTimeout(
      () => finish(new Error('Successor did not release ownership.')),
      15_000
    );
    const watcher: fs.FSWatcher = fs.watch(path.dirname(paths.lockfilePath), () => inspect());
    function finish(error?: Error): void {
      clearTimeout(timeout);
      watcher.close();
      if (error) reject(error);
      else resolve();
    }
    function inspect(): void {
      const current: IDaemonLockfile | undefined = readDaemonLockfile(paths.lockfilePath);
      if (!current || current.pid !== ownerPid || current.startedAt !== ownerStartedAt) finish();
    }
    watcher.once('error', finish);
    inspect();
  });
  try {
    await requestDaemonShutdownAsync(client, paths);
    await removed;
    await waitForTestProcessExitAsync(ownerPid);
  } finally {
    await client.closeAsync();
  }
}
