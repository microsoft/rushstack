// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { LockFile, getProcessStartTime, getProcessStartTimeFromProcStat } from '../LockFile';
import { FileSystem } from '../FileSystem';
import { FileWriter } from '../FileWriter';

function setLockFileGetProcessStartTime(fn: (process: number) => string | undefined): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (LockFile as any)._getStartTime = fn;
}

// lib/test
const libTestFolder: string = path.resolve(__dirname, '../../lib/test');

describe(LockFile.name, () => {
  afterEach(() => {
    jest.restoreAllMocks();
    setLockFileGetProcessStartTime(getProcessStartTime);
  });

  describe(LockFile.getLockFilePath.name, () => {
    test('only accepts alphabetical characters for resource name', () => {
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

  describe(getProcessStartTimeFromProcStat.name, () => {
    function createStatOutput(value2: string, n: number): string {
      let statOutput: string = `0 ${value2} S`;
      for (let i: number = 0; i < n; i++) {
        statOutput += ' 0';
      }
      return statOutput;
    }

    test('returns undefined if too few values are contained in /proc/[pid]/stat (1)', () => {
      const stat: string = createStatOutput('(bash)', 1);
      const ret: string | undefined = getProcessStartTimeFromProcStat(stat);
      expect(ret).toBeUndefined();
    });
    test('returns undefined if too few values are contained in /proc/[pid]/stat (2)', () => {
      const stat: string = createStatOutput('(bash)', 0);
      const ret: string | undefined = getProcessStartTimeFromProcStat(stat);
      expect(ret).toBeUndefined();
    });
    test('returns the correct start time if the second value in /proc/[pid]/stat contains spaces', () => {
      let stat: string = createStatOutput('(bash 2)', 18);
      const value22: string = '12345';
      stat += ` ${value22}`;
      const ret: string | undefined = getProcessStartTimeFromProcStat(stat);
      expect(ret).toEqual(value22);
    });
    test(
      'returns the correct start time if there are 22 values in /proc/[pid]/stat, including a trailing line ' +
        'terminator',
      () => {
        let stat: string = createStatOutput('(bash)', 18);
        const value22: string = '12345';
        stat += ` ${value22}\n`;
        const ret: string | undefined = getProcessStartTimeFromProcStat(stat);
        expect(ret).toEqual(value22);
      }
    );
    test('returns the correct start time if the second value in /proc/[pid]/stat does not contain spaces', () => {
      let stat: string = createStatOutput('(bash)', 18);
      const value22: string = '12345';
      stat += ` ${value22}`;
      const ret: string | undefined = getProcessStartTimeFromProcStat(stat);
      expect(ret).toEqual(value22);
    });
  });

  it('supports two lockfiles in the same process', async () => {
    const testFolder: string = `${libTestFolder}/6`;
    await FileSystem.ensureEmptyFolderAsync(testFolder);

    const resourceName: string = 'test1';

    const lock1: LockFile = await LockFile.acquireAsync(testFolder, resourceName);
    const lock2Promise: Promise<LockFile> = LockFile.acquireAsync(testFolder, resourceName);

    let lock2Acquired: boolean = false;
    lock2Promise
      .then(() => {
        lock2Acquired = true;
      })
      .catch(() => {
        fail();
      });

    const lock1Exists: boolean = await FileSystem.existsAsync(lock1.filePath);
    expect(lock1Exists).toEqual(true);
    expect(lock1.isReleased).toEqual(false);
    expect(lock2Acquired).toEqual(false);

    lock1.release();

    expect(lock1.isReleased).toEqual(true);

    const lock2: LockFile = await lock2Promise;

    const lock2Exists: boolean = await FileSystem.existsAsync(lock2.filePath);
    expect(lock2Exists).toEqual(true);
    expect(lock2.isReleased).toEqual(false);

    expect(lock2Acquired).toEqual(true);

    lock2.release();

    expect(lock2.isReleased).toEqual(true);
  });

  if (process.platform === 'darwin' || process.platform === 'linux') {
    describe('Linux and Mac', () => {
      describe(LockFile.getLockFilePath.name, () => {
        test('returns a resolved path containing the pid', () => {
          expect(path.join(process.cwd(), `test#${process.pid}.lock`)).toEqual(
            LockFile.getLockFilePath('./', 'test')
          );
        });

        test('allows for overridden pid', () => {
          expect(path.join(process.cwd(), `test#99.lock`)).toEqual(
            LockFile.getLockFilePath('./', 'test', 99)
          );
        });
      });

      test('can acquire and close a clean lockfile', () => {
        // ensure test folder is clean
        const testFolder: string = path.join(libTestFolder, '1');
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
        const testFolder: string = path.join(libTestFolder, '2');
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

      test('cannot acquire a lock if another valid lock exists with the same start time', () => {
        // ensure test folder is clean
        const testFolder: string = path.join(libTestFolder, '3');
        FileSystem.ensureEmptyFolder(testFolder);

        const otherPid: number = 1; // low pid so the other lock is before us
        const otherPidStartTime: string = '2012-01-02 12:53:12';
        const thisPidStartTime: string = otherPidStartTime;

        const resourceName: string = 'test';

        const otherPidLockFileName: string = LockFile.getLockFilePath(testFolder, resourceName, otherPid);

        setLockFileGetProcessStartTime((pid: number) => {
          return pid === process.pid ? thisPidStartTime : otherPidStartTime;
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

      test('deletes other hanging lockfiles if corresponding processes are not running anymore', () => {
        // ensure test folder is clean
        const testFolder: string = path.join(libTestFolder, '4');
        FileSystem.ensureEmptyFolder(testFolder);

        const resourceName: string = 'test';

        const otherPid: number = 999999999;
        const otherPidInitialStartTime: string = '2012-01-02 12:53:12';

        // simulate a hanging lockfile that was not cleaned by other process
        const otherPidLockFileName: string = LockFile.getLockFilePath(testFolder, resourceName, otherPid);
        const lockFileHandle: FileWriter = FileWriter.open(otherPidLockFileName);
        lockFileHandle.write(otherPidInitialStartTime);
        lockFileHandle.close();
        FileSystem.updateTimes(otherPidLockFileName, {
          accessedTime: 10000,
          modifiedTime: 10000
        });

        // return undefined as if the process was not running anymore
        setLockFileGetProcessStartTime((pid: number) => {
          return pid === otherPid ? undefined : getProcessStartTime(pid);
        });

        const deleteFileSpy = jest.spyOn(FileSystem, 'deleteFile');
        LockFile.tryAcquire(testFolder, resourceName);

        expect(deleteFileSpy).toHaveBeenCalledTimes(1);
        expect(deleteFileSpy).toHaveBeenNthCalledWith(1, otherPidLockFileName);
      });

      test("doesn't attempt deleting other process lockfile if it is released in the middle of acquiring process", () => {
        // ensure test folder is clean
        const testFolder: string = path.join(libTestFolder, '5');
        FileSystem.ensureEmptyFolder(testFolder);

        const resourceName: string = 'test';

        const otherPid: number = 999999999;
        const otherPidStartTime: string = '2012-01-02 12:53:12';

        const otherPidLockFileName: string = LockFile.getLockFilePath(testFolder, resourceName, otherPid);

        // create an open lockfile for other process
        const lockFileHandle: FileWriter = FileWriter.open(otherPidLockFileName);
        lockFileHandle.write(otherPidStartTime);
        lockFileHandle.close();
        FileSystem.updateTimes(otherPidLockFileName, {
          accessedTime: 10000,
          modifiedTime: 10000
        });

        // return other process start time as if it was still running
        setLockFileGetProcessStartTime((pid: number) => {
          return pid === otherPid ? otherPidStartTime : getProcessStartTime(pid);
        });

        const originalReadFile = FileSystem.readFile;
        jest.spyOn(FileSystem, 'readFile').mockImplementation((filePath: string) => {
          if (filePath === otherPidLockFileName) {
            // simulate other process lock release right before the current process reads
            // other process lockfile to decide on next steps for acquiring the lock
            FileSystem.deleteFile(filePath);
          }

          return originalReadFile(filePath);
        });

        const deleteFileSpy = jest.spyOn(FileSystem, 'deleteFile');

        LockFile.tryAcquire(testFolder, resourceName);

        // Ensure there were no other FileSystem.deleteFile calls after our lock release simulation.
        // An extra attempt to delete the lockfile might lead to unexpectedly deleting a new lockfile
        // created by another process right after releasing/deleting the previous lockfile
        expect(deleteFileSpy).toHaveBeenCalledTimes(1);
        expect(deleteFileSpy).toHaveBeenNthCalledWith(1, otherPidLockFileName);
      });
    });
  }

  if (process.platform === 'win32') {
    describe('Windows', () => {
      describe(LockFile.getLockFilePath.name, () => {
        test("returns a resolved path that doesn't contain", () => {
          expect(path.join(process.cwd(), `test.lock`)).toEqual(LockFile.getLockFilePath('./', 'test'));
        });

        test('ignores pid that is passed in', () => {
          expect(path.join(process.cwd(), `test.lock`)).toEqual(LockFile.getLockFilePath('./', 'test', 99));
        });
      });

      test('will not acquire if existing lock is there', () => {
        // ensure test folder is clean
        const testFolder: string = path.join(libTestFolder, '1');
        FileSystem.deleteFolder(testFolder);
        FileSystem.ensureFolder(testFolder);

        // create an open lockfile
        const resourceName: string = 'test';
        const lockFileHandle: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);
        expect(lockFileHandle).toBeDefined();

        const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);
        // this lock should be undefined since there is an existing lock
        expect(lock).toBeUndefined();
        lockFileHandle!.release();
      });

      test('can acquire and close a dirty lockfile', () => {
        // ensure test folder is clean
        const testFolder: string = path.join(libTestFolder, '1');
        FileSystem.ensureEmptyFolder(testFolder);

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
        const testFolder: string = path.join(libTestFolder, '1');
        FileSystem.ensureEmptyFolder(testFolder);

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
    });
  }
});
