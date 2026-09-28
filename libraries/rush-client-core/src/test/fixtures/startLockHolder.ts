// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { tryAcquireStartupLockAsync, type IStartupLock } from '../../StartupLock';

/** Holds the start mutex, like a client that has not reserved startup yet, until a "release-lock" file exists. */
async function mainAsync(): Promise<void> {
  const paths: IDaemonPaths = JSON.parse(process.argv[2]);
  const folder: string = path.dirname(paths.lockfilePath);
  const lock: IStartupLock | undefined = await tryAcquireStartupLockAsync(paths);
  if (!lock) throw new Error('The start mutex is already held.');
  fs.writeFileSync(path.join(folder, 'lock-held'), String(process.pid));
  const expiry: number = Date.now() + 30000;
  while (!fs.existsSync(path.join(folder, 'release-lock')) && Date.now() < expiry) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await lock.releaseAsync();
}

mainAsync().catch((error: Error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
