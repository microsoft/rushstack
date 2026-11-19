// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import { PhasedCommandEngineBusyError } from '@microsoft/rush-lib';
import { LockFile } from '@rushstack/node-core-library';

/** The resource name of native Rush's repository lock, in the common temp folder. */
const NATIVE_LOCK_RESOURCE_NAME: string = 'rush';

/**
 * Whether this process holds native Rush's repository lock in `lockFolder`, after it failed to take the lock.
 *
 * @remarks
 * A process that fails to take the lock deletes its own lock file again, so only the process that holds the lock
 * still has one. On Windows, the lock file does not name its process, so this is never known there.
 */
export function isNativeLockHeldByThisProcess(lockFolder: string): boolean {
  return (
    process.platform !== 'win32' &&
    fs.existsSync(LockFile.getLockFilePath(lockFolder, NATIVE_LOCK_RESOURCE_NAME))
  );
}

/**
 * Takes native Rush's repository lock in `lockFolder`, or returns undefined while another process holds it.
 * If this process holds it already, for another request, waiting for it would not end, so this fails at once, as a
 * native Rush command does.
 */
export function tryAcquireNativeLock(lockFolder: string): LockFile | undefined {
  const lock: LockFile | undefined = LockFile.tryAcquire(lockFolder, NATIVE_LOCK_RESOURCE_NAME);
  if (!lock && isNativeLockHeldByThisProcess(lockFolder)) {
    throw new PhasedCommandEngineBusyError();
  }
  return lock;
}
