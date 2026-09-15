// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { tryAcquireStartupLockAsync, type IStartupLock } from '../StartupLock';
import { removeTestFolderAsync } from './TestProcessExit';

it('holds startup exclusively until the owning lock is released', async () => {
  const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-start-lock-'));
  const paths: IDaemonPaths = {
    lockfilePath: path.join(folder, 'daemon.pid.json'),
    socketPath:
      process.platform === 'win32'
        ? `\\\\.\\pipe\\${path.basename(folder)}`
        : path.join(folder, 'daemon.sock')
  };
  let lock: IStartupLock | undefined = await tryAcquireStartupLockAsync(paths);
  try {
    expect(lock).toBeDefined();
    expect(await tryAcquireStartupLockAsync(paths)).toBeUndefined();
    await lock!.releaseAsync();
    lock = undefined;
    lock = await tryAcquireStartupLockAsync(paths);
    expect(lock).toBeDefined();
  } finally {
    await lock?.releaseAsync();
    await removeTestFolderAsync(folder);
  }
});
