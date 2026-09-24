// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { LockFile } from '@rushstack/node-core-library';
import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { DaemonClientError } from './DaemonClientError';

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

const RESERVATION_LOCK_TIMEOUT_MS: number = 5000;
const RESERVATION_LOCK_RETRY_MS: number = 10;

/**
 * Runs a short, synchronous read-check-write of the startup reservation while holding a dedicated lock.
 * The start lock cannot be used because a waiting client holds it for the whole startup, while the helper
 * must still be able to update or release its own reservation.
 */
export function withStartupReservationLock<T>(paths: IDaemonPaths, action: () => T): T {
  const folder: string = path.dirname(paths.lockfilePath);
  const name: string = `${path.basename(paths.lockfilePath)}-reservation`;
  const deadline: number = Date.now() + RESERVATION_LOCK_TIMEOUT_MS;
  const sleeper: Int32Array = new Int32Array(new SharedArrayBuffer(4));
  let lock: LockFile | undefined = LockFile.tryAcquire(folder, name);
  while (!lock) {
    if (Date.now() >= deadline) {
      throw new DaemonClientError(
        'startupFailed',
        `Timed out waiting for the daemon startup reservation lock in ${folder}.`
      );
    }
    Atomics.wait(sleeper, 0, 0, RESERVATION_LOCK_RETRY_MS);
    lock = LockFile.tryAcquire(folder, name);
  }
  try {
    return action();
  } finally {
    lock.release();
  }
}
