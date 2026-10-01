// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { LockFile } from '@rushstack/node-core-library';
import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

export interface IStartupLock {
  releaseAsync(): Promise<void>;
}

export async function tryAcquireStartupLockAsync(paths: IDaemonPaths): Promise<IStartupLock | undefined> {
  const folder: string = path.dirname(paths.lockfilePath);
  const lock: LockFile | undefined = LockFile.tryAcquire(folder, getStartupLockResourceName(paths));
  return lock ? { releaseAsync: async () => lock.release() } : undefined;
}

/**
 * Returns false when no process holds the start mutex. A `LockFile` owner keeps its file in the folder
 * (`<resource>#<pid>.lock`, or `<resource>.lock` on Windows; see `LockFile.getLockFilePath()`), so without one
 * the mutex is free. Unlike `tryAcquireStartupLockAsync()`, this runs no `ps` to learn the process start time.
 * True means the mutex may be held, for example by a process that has exited without releasing it, or that the
 * folder cannot be read.
 */
export function isStartupLockFilePresent(paths: IDaemonPaths): boolean {
  const resourceName: string = getStartupLockResourceName(paths);
  let names: string[];
  try {
    names = fs.readdirSync(path.dirname(paths.lockfilePath));
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ENOENT';
  }
  return names.some(
    (name: string) =>
      name === `${resourceName}.lock` || (name.startsWith(`${resourceName}#`) && name.endsWith('.lock'))
  );
}

function getStartupLockResourceName(paths: IDaemonPaths): string {
  return `${path.basename(paths.lockfilePath)}-start`;
}
