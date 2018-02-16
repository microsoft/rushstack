// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types='mocha' />

import * as fsx from 'fs-extra';
import { assert } from 'chai';
import * as path from 'path';
import { LockFile, getProcessStartTime } from '../LockFile';

function setLockFileGetProcessStartTime(fn: (process: number) => string | undefined): void {
  // tslint:disable-next-line:no-any
  (LockFile as any)._getStartTime = fn;
}

describe('LockFile', () => {
  afterEach(() => {
    setLockFileGetProcessStartTime(getProcessStartTime);
  });

  describe('getLockFilePath', () => {
    it('only acceps alphabetical characters for resource name', () => {
      assert.doesNotThrow(() => {
        LockFile.getLockFilePath(process.cwd(), 'foo123');
      });
      assert.doesNotThrow(() => {
        LockFile.getLockFilePath(process.cwd(), 'bar.123');
      });
      assert.doesNotThrow(() => {
        LockFile.getLockFilePath(process.cwd(), 'foo.bar');
      });
      assert.doesNotThrow(() => {
        LockFile.getLockFilePath(process.cwd(), 'lock-file.123');
      });
      assert.throws(() => {
        LockFile.getLockFilePath(process.cwd(), '.foo123');
      });
      assert.throws(() => {
        LockFile.getLockFilePath(process.cwd(), 'foo123.');
      });
      assert.throws(() => {
        LockFile.getLockFilePath(process.cwd(), '-foo123');
      });
      assert.throws(() => {
        LockFile.getLockFilePath(process.cwd(), 'foo123-');
      });
      assert.throws(() => {
        LockFile.getLockFilePath(process.cwd(), '');
      });
    });
  });

  if (process.platform === 'darwin' || process.platform === 'linux') {
    describe('Linux and Mac', () => {
      describe('getLockFilePath()', () => {
        it('returns a resolved path containing the pid', () => {
          assert.equal(
            path.join(process.cwd(), `test#${process.pid}.lock`),
            LockFile.getLockFilePath('./', 'test')
          );
        });

        it('allows for overridden pid', () => {
          assert.equal(
            path.join(process.cwd(), `test#99.lock`),
            LockFile.getLockFilePath('./', 'test', 99)
          );
        });
      });

      it('can acquire and close a clean lockfile', () => {
        // ensure test folder is clean
        const testFolder: string = path.join(__dirname, '1');
        fsx.removeSync(testFolder);
        fsx.mkdirsSync(testFolder);

        const resourceName: string = 'test';
        const pidLockFileName: string = LockFile.getLockFilePath(testFolder, resourceName);
        const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

        // The lockfile should exist and be in a clean state
        assert.isDefined(lock);
        assert.isFalse(lock!.dirtyWhenAcquired);
        assert.isFalse(lock!.isReleased);
        assert.isTrue(fsx.existsSync(pidLockFileName));

        // Ensure that we can release the "clean" lockfile
        lock!.release();
        assert.isFalse(fsx.existsSync(pidLockFileName));
        assert.isTrue(lock!.isReleased);

        // Ensure we cannot release the lockfile twice
        assert.throws(() => {
          lock!.release();
        });
      });

      it('cannot acquire a lock if another valid lock exists', () => {
        // ensure test folder is clean
        const testFolder: string = path.join(__dirname, '2');
        fsx.removeSync(testFolder);
        fsx.mkdirsSync(testFolder);

        const otherPid: number = 999999999;
        const otherPidStartTime: string = '2012-01-02 12:53:12';

        const resourceName: string = 'test';

        const otherPidLockFileName: string = LockFile.getLockFilePath(testFolder, resourceName, otherPid);

        setLockFileGetProcessStartTime((pid: number) => {
          return pid === process.pid ? getProcessStartTime(process.pid) : otherPidStartTime;
        });

        // create an open lockfile
        const lockFileDescriptor: number = fsx.openSync(otherPidLockFileName, 'w');
        fsx.writeSync(lockFileDescriptor, otherPidStartTime);
        fsx.closeSync(lockFileDescriptor);
        fsx.utimesSync(otherPidLockFileName, 10000, 10000);

        const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

        // this lock should be undefined since there is an existing lock
        assert.isUndefined(lock);
      });
    });
  }

  if (process.platform === 'win32') {
    describe('getLockFilePath()', () => {
      it('returns a resolved path that doesn\'t contain', () => {
        assert.equal(
          path.join(process.cwd(), `test.lock`),
          LockFile.getLockFilePath('./', 'test')
        );
      });

      it('ignores pid that is passed in', () => {
        assert.equal(
          path.join(process.cwd(), `test.lock`),
          LockFile.getLockFilePath('./', 'test', 99)
        );
      });
    });

    it('will not acquire if existing lock is there', () => {
      // ensure test folder is clean
      const testFolder: string = path.join(__dirname, '1');
      fsx.removeSync(testFolder);
      fsx.mkdirsSync(testFolder);

      // create an open lockfile
      const resourceName: string = 'test';
      const lockFileName: string = LockFile.getLockFilePath(testFolder, resourceName);
      const lockFileDescriptor: number = fsx.openSync(lockFileName, 'wx');

      const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

      // this lock should be undefined since there is an existing lock
      assert.isUndefined(lock);
      fsx.closeSync(lockFileDescriptor);
    });

    it('can acquire and close a dirty lockfile', () => {
      // ensure test folder is clean
      const testFolder: string = path.join(__dirname, '1');
      fsx.removeSync(testFolder);
      fsx.mkdirsSync(testFolder);

      // Create a lockfile that is still hanging around on disk,
      const resourceName: string = 'test';
      const lockFileName: string = LockFile.getLockFilePath(testFolder, resourceName);
      fsx.closeSync(fsx.openSync(lockFileName, 'wx'));

      const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

      assert.isDefined(lock);
      assert.isTrue(lock!.dirtyWhenAcquired);
      assert.isFalse(lock!.isReleased);
      assert.isTrue(fsx.existsSync(lockFileName));

      // Ensure that we can release the "dirty" lockfile
      lock!.release();
      assert.isFalse(fsx.existsSync(lockFileName));
      assert.isTrue(lock!.isReleased);
    });

    it('can acquire and close a clean lockfile', () => {
      // ensure test folder is clean
      const testFolder: string = path.join(__dirname, '1');
      fsx.removeSync(testFolder);
      fsx.mkdirsSync(testFolder);

      const resourceName: string = 'test';
      const lockFileName: string = LockFile.getLockFilePath(testFolder, resourceName);
      const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

      // The lockfile should exist and be in a clean state
      assert.isDefined(lock);
      assert.isFalse(lock!.dirtyWhenAcquired);
      assert.isFalse(lock!.isReleased);
      assert.isTrue(fsx.existsSync(lockFileName));

      // Ensure that we can release the "clean" lockfile
      lock!.release();
      assert.isFalse(fsx.existsSync(lockFileName));
      assert.isTrue(lock!.isReleased);

      // Ensure we cannot release the lockfile twice
      assert.throws(() => {
        lock!.release();
      });
    });
  }
});