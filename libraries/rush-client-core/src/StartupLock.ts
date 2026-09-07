// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { LockFile } from '@rushstack/node-core-library';
import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

export interface IStartupLock {
  releaseAsync(): Promise<void>;
}

export async function tryAcquireStartupLockAsync(paths: IDaemonPaths): Promise<IStartupLock | undefined> {
  const folder: string = path.dirname(paths.lockfilePath);
  const lock: LockFile | undefined = LockFile.tryAcquire(
    folder,
    `${path.basename(paths.lockfilePath)}-start`
  );
  return lock ? { releaseAsync: async () => lock.release() } : undefined;
}
