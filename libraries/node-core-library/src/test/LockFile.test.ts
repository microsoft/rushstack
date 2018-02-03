// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types='mocha' />

import * as fsx from 'fs-extra';
import { assert } from 'chai';
import * as path from 'path';
import { LockFile, getProcessStartTime } from '../LockFile';

let i: number = 0;
function getLockFileName(): string {
  i++;
  return path.join(__dirname, `${Date.now()}_${i}.lock`);
}

describe('LockFile', () => {
  it('will not acquire if existing lock is there', () => {
    // create an open lockfile
    const lockFileName: string = getLockFileName();
    fsx.removeSync(lockFileName);
    const lockFileDescriptor: number = fsx.openSync(lockFileName, 'wx');

    if (process.platform === 'darwin' || process.platform === 'linux') {
      fsx.writeSync(lockFileDescriptor, `${process.pid};${getProcessStartTime(process.pid.toString())}`);
    }
    const lock: LockFile | undefined = LockFile.tryAcquire(lockFileName);

    // this lock should be undefined since there is an existing lock
    assert.isUndefined(lock);
    fsx.closeSync(lockFileDescriptor);

    fsx.removeSync(lockFileName);
  });

  it('can acquire and close a dirty lockfile that cannot be parsed', () => {
    // Create a lockfile that is still hanging around on disk,
    const lockFileName: string = getLockFileName();
    fsx.removeSync(lockFileName);
    fsx.closeSync(fsx.openSync(lockFileName, 'wx'));

    const lock: LockFile | undefined = LockFile.tryAcquire(lockFileName);

    assert.isDefined(lock);
    assert.isTrue(lock!.dirtyWhenAcquired);
    assert.isFalse(lock!.isReleased);

    // Ensure that we can release the "dirty" lockfile
    lock!.release();
    assert.isFalse(fsx.existsSync(lockFileName));
    assert.isTrue(lock!.isReleased);
  });

  it('can acquire and close a dirty lockfile', () => {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      // Create a lockfile that is still hanging around on disk,
      const lockFileName: string = getLockFileName();
      fsx.removeSync(lockFileName);
      const lockFileDescriptor: number = fsx.openSync(lockFileName, 'wx');

      fsx.writeSync(lockFileDescriptor, `${process.pid};12345`);
      fsx.closeSync(lockFileDescriptor);

      const lock: LockFile | undefined = LockFile.tryAcquire(lockFileName);

      assert.isDefined(lock);
      assert.isTrue(lock!.dirtyWhenAcquired);
      assert.isFalse(lock!.isReleased);

      // Ensure that we can release the "dirty" lockfile
      lock!.release();
      assert.isFalse(fsx.existsSync(lockFileName));
      assert.isTrue(lock!.isReleased);
    }
  });

  it('can acquire and close a clean lockfile', () => {
    const lockFileName: string = getLockFileName();
    fsx.removeSync(lockFileName);
    const lock: LockFile | undefined = LockFile.tryAcquire(lockFileName);

    // The lockfile should exist and be in a clean state
    assert.isDefined(lock);
    assert.isFalse(lock!.dirtyWhenAcquired);
    assert.isFalse(lock!.isReleased);

    // Ensure that we can release the "clean" lockfile
    lock!.release();
    assert.isFalse(fsx.existsSync(lockFileName));
    assert.isTrue(lock!.isReleased);

    // Ensure we cannot release the lockfile twice
    assert.throws(() => {
      lock!.release();
    });
  });

});