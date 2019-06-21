// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { LockFile, getProcessStartTime, getProcessStartTimeFromProcStat } from '../LockFile';
import { FileSystem } from '../FileSystem';
import { FileWriter } from '../FileWriter';

function setLockFileGetProcessStartTime(fn: (process: number) => string | undefined): void {
  // tslint:disable-next-line:no-any
  (LockFile as any)._getStartTime = fn;
}

describe('LockFile', () => {
  afterEach(() => {
    setLockFileGetProcessStartTime(getProcessStartTime);
  });

  describe('getLockFilePath', () => {
    test('only acceps alphabetical characters for resource name', () => {
      expect(() => {
        LockFile.getLockFilePath(process.cwd(), 'foo123');
      }).not.toThrow();
      expect(() => {
        LockFile.getLockFilePath(process.cwd(), 'bar.123');
      }).not.toThrow();
      expect(() => {
        LockFile.getLockFilePath(process.cwd(), 'foo.bar');
      }).not.toThrow();
      expect(() => {
        LockFile.getLockFilePath(process.cwd(), 'lock-file.123');
      }).not.toThrow();

      expect(() => {
        LockFile.getLockFilePath(process.cwd(), '.foo123');
      }).toThrow();
      expect(() => {
        LockFile.getLockFilePath(process.cwd(), 'foo123.');
      }).toThrow();
      expect(() => {
        LockFile.getLockFilePath(process.cwd(), '-foo123');
      }).toThrow();
      expect(() => {
        LockFile.getLockFilePath(process.cwd(), 'foo123-');
      }).toThrow();
      expect(() => {
        LockFile.getLockFilePath(process.cwd(), '');
      }).toThrow();
    });
  });

  describe('getProcessStartTimeFromProcStat', () => {
    function createStatOutput (value2: string, n: number): string {
      let statOutput: string = `0 ${value2} S`;
      for (let i: number = 0; i < n; i++) {
        statOutput += ' 0';
      }
      return statOutput;
    }

    test('returns undefined if too few values are contained in /proc/[pid]/stat (1)', () => {
      const stat: string = createStatOutput('(bash)', 1);
      const ret: string|undefined = getProcessStartTimeFromProcStat(stat);
      expect(ret).toBeUndefined();
    });
    test('returns undefined if too few values are contained in /proc/[pid]/stat (2)', () => {
      const stat: string = createStatOutput('(bash)', 0);
      const ret: string|undefined = getProcessStartTimeFromProcStat(stat);
      expect(ret).toBeUndefined();
    });
    test('returns the correct start time if the second value in /proc/[pid]/stat contains spaces', () => {
      let stat: string = createStatOutput('(bash 2)', 18);
      const value22: string = '12345';
      stat += ` ${value22}`;
      const ret: string|undefined = getProcessStartTimeFromProcStat(stat);
      expect(ret).toEqual(value22);
    });
    test('returns the correct start time if there are 22 values in /proc/[pid]/stat, including a trailing line '
      + 'terminator', () => {
      let stat: string = createStatOutput('(bash)', 18);
      const value22: string = '12345';
      stat += ` ${value22}\n`;
      const ret: string|undefined = getProcessStartTimeFromProcStat(stat);
      expect(ret).toEqual(value22);
    });
    test('returns the correct start time if the second value in /proc/[pid]/stat does not contain spaces', () => {
      let stat: string = createStatOutput('(bash)', 18);
      const value22: string = '12345';
      stat += ` ${value22}`;
      const ret: string|undefined = getProcessStartTimeFromProcStat(stat);
      expect(ret).toEqual(value22);
    });
  });

  if (process.platform === 'darwin' || process.platform === 'linux') {
    describe('Linux and Mac', () => {
      describe('getLockFilePath()', () => {
        test('returns a resolved path containing the pid', () => {
          expect(
            path.join(process.cwd(), `test#${process.pid}.lock`)
          ).toEqual(
            LockFile.getLockFilePath('./', 'test')
          );
        });

        test('allows for overridden pid', () => {
          expect(
            path.join(process.cwd(), `test#99.lock`)
          ).toEqual(
            LockFile.getLockFilePath('./', 'test', 99)
          );
        });
      });

      test('can acquire and close a clean lockfile', () => {
        // ensure test folder is clean
        const testFolder: string = path.join(__dirname, '1');
        FileSystem.ensureEmptyFolder(testFolder);

        const resourceName: string = 'test';
        const pidLockFileName: string = LockFile.getLockFilePath(testFolder, resourceName);
        const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

        // The lockfile should exist and be in a clean state
        expect(lock).toBeDefined();
        expect(lock!.dirtyWhenAcquired).toEqual(false);
        expect(lock!.isReleased).toEqual(false);
        expect(FileSystem.exists(pidLockFileName)).toEqual(true);

        // Ensure that we can release the "clean" lockfile
        lock!.release();
        expect(FileSystem.exists(pidLockFileName)).toEqual(false);
        expect(lock!.isReleased).toEqual(true);

        // Ensure we cannot release the lockfile twice
        expect(() => {
          lock!.release();
        }).toThrow();
      });

      test('cannot acquire a lock if another valid lock exists', () => {
        // ensure test folder is clean
        const testFolder: string = path.join(__dirname, '2');
        FileSystem.ensureEmptyFolder(testFolder);

        const otherPid: number = 999999999;
        const otherPidStartTime: string = '2012-01-02 12:53:12';

        const resourceName: string = 'test';

        const otherPidLockFileName: string = LockFile.getLockFilePath(testFolder, resourceName, otherPid);

        setLockFileGetProcessStartTime((pid: number) => {
          return pid === process.pid ? getProcessStartTime(process.pid) : otherPidStartTime;
        });

        // create an open lockfile
        const lockFileHandle: FileWriter = FileWriter.open(otherPidLockFileName);
        lockFileHandle.write(otherPidStartTime);
        lockFileHandle.close();
        FileSystem.updateTimes(otherPidLockFileName, {
          accessedTime: 10000,
          modifiedTime: 10000
        });

        const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

        // this lock should be undefined since there is an existing lock
        expect(lock).toBeUndefined();
      });
    });
  }

  if (process.platform === 'win32') {
    describe('getLockFilePath()', () => {
      test('returns a resolved path that doesn\'t contain', () => {
        expect(
          path.join(process.cwd(), `test.lock`)
        ).toEqual(
          LockFile.getLockFilePath('./', 'test')
        );
      });

      test('ignores pid that is passed in', () => {
        expect(
          path.join(process.cwd(), `test.lock`)
        ).toEqual(
          LockFile.getLockFilePath('./', 'test', 99)
        );
      });
    });

    test('will not acquire if existing lock is there', () => {
      // ensure test folder is clean
      const testFolder: string = path.join(__dirname, '1');
      FileSystem.deleteFolder(testFolder);
      FileSystem.ensureFolder(testFolder);

      // create an open lockfile
      const resourceName: string = 'test';
      const lockFileName: string = LockFile.getLockFilePath(testFolder, resourceName);
      const lockFileHandle: FileWriter = FileWriter.open(lockFileName, { exclusive: true });

      const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

      // this lock should be undefined since there is an existing lock
      expect(lock).toBeUndefined();
      lockFileHandle.close();
    });

    test('can acquire and close a dirty lockfile', () => {
      // ensure test folder is clean
      const testFolder: string = path.join(__dirname, '1');
      FileSystem.deleteFolder(testFolder);
      FileSystem.ensureFolder(testFolder);

      // Create a lockfile that is still hanging around on disk,
      const resourceName: string = 'test';
      const lockFileName: string = LockFile.getLockFilePath(testFolder, resourceName);
      FileWriter.open(lockFileName, { exclusive: true }).close();

      const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

      expect(lock).toBeDefined();
      expect(lock!.dirtyWhenAcquired).toEqual(true);
      expect(lock!.isReleased).toEqual(false);
      expect(FileSystem.exists(lockFileName)).toEqual(true);

      // Ensure that we can release the "dirty" lockfile
      lock!.release();
      expect(FileSystem.exists(lockFileName)).toEqual(false);
      expect(lock!.isReleased).toEqual(true);
    });

    test('can acquire and close a clean lockfile', () => {
      // ensure test folder is clean
      const testFolder: string = path.join(__dirname, '1');
      FileSystem.deleteFolder(testFolder);
      FileSystem.ensureFolder(testFolder);

      const resourceName: string = 'test';
      const lockFileName: string = LockFile.getLockFilePath(testFolder, resourceName);
      const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

      // The lockfile should exist and be in a clean state
      expect(lock).toBeDefined();
      expect(lock!.dirtyWhenAcquired).toEqual(false);
      expect(lock!.isReleased).toEqual(false);
      expect(FileSystem.exists(lockFileName)).toEqual(true);

      // Ensure that we can release the "clean" lockfile
      lock!.release();
      expect(FileSystem.exists(lockFileName)).toEqual(false);
      expect(lock!.isReleased).toEqual(true);

      // Ensure we cannot release the lockfile twice
      expect(() => {
        lock!.release();
      }).toThrow();
    });
  }
});