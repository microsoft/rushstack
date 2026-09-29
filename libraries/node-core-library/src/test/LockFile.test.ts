// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import * as child_process from 'node:child_process';
import {
  LockFile,
  type ILockFileHandle,
  getProcessStartTime,
  getProcessStartTimeFromProcStat,
  getProcessStartTimeMs,
  getLinuxBootTimeSeconds,
  getLinuxProcessStartTime,
  _setLockFileGetProcessStartTime
} from '../LockFile';
import { FileSystem, type FileSystemStats, type IFileSystemReadFileOptions } from '../FileSystem';
import { FileWriter } from '../FileWriter';
import * as WindowsLockFile from '../WindowsLockFile';

function setLockFileGetProcessStartTime(fn: (process: number) => string | undefined): void {
  _setLockFileGetProcessStartTime(fn);
}

/**
 * Replaces the contents of a file that FileSystem.readFile() reads, or makes reading it fail.
 */
function mockReadFile(filePath: string, contents: string | NodeJS.ErrnoException): void {
  const originalReadFile: typeof FileSystem.readFile = FileSystem.readFile;
  jest
    .spyOn(FileSystem, 'readFile')
    .mockImplementation((readFilePath: string, options?: IFileSystemReadFileOptions) => {
      if (readFilePath !== filePath) {
        return originalReadFile(readFilePath, options);
      }
      if (typeof contents !== 'string') {
        throw contents;
      }
      return contents;
    });
}

/**
 * Runs "ps -o lstart" for a process with the C locale, and returns what it prints.
 */
function getLstartWithCLocale(pid: number, timeZone?: string): string {
  return child_process
    .spawnSync('ps', ['-p', `${pid}`, '-o', 'lstart'], {
      encoding: 'utf8',
      env: { ...process.env, LC_ALL: 'C', ...(timeZone === undefined ? {} : { TZ: timeZone }) }
    })
    .stdout.split('\n')[1]
    .trim();
}

function createEaccesError(): NodeJS.ErrnoException {
  return Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
}

// lib/test
const libTestFolder: string = path.resolve(__dirname, '../../lib-commonjs/test');

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

  describe(LockFile.getLockFilePaths.name, () => {
    it('returns all platform-specific backing paths using the requested PID', () => {
      const filePath: string = LockFile.getLockFilePath(process.cwd(), 'resource', 99);
      expect(LockFile.getLockFilePaths(process.cwd(), 'resource', 99)).toEqual(
        process.platform === 'win32' ? [filePath, `${filePath}.dirty`] : [filePath]
      );
    });

    it('validates resource names consistently', () => {
      expect(() => LockFile.getLockFilePaths(process.cwd(), '../invalid')).toThrow();
    });
  });

  describe('release failures', () => {
    const platformDescriptor: PropertyDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
    let lock: LockFile;
    let fileWriter: ILockFileHandle;

    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      jest.spyOn(FileSystem, 'ensureFolder').mockImplementation(() => {});
      jest.spyOn(FileSystem, 'deleteFile').mockImplementation(() => {});
      fileWriter = { prepareForRelease: jest.fn(), close: jest.fn() };
      jest.spyOn(WindowsLockFile, 'tryAcquireWindowsLockFile').mockImplementation((filePath) => ({
        filePath,
        fileWriter,
        dirtyWhenAcquired: false
      }));
      lock = LockFile.tryAcquire(process.cwd(), 'release-test')!;
    });

    afterEach(() => {
      // The outer afterEach restores mocks; remove the in-process entry first.
      if (!lock.isReleased) {
        fileWriter.prepareForRelease = undefined;
        fileWriter.close = () => {};
        lock.release(false);
      }
      Object.defineProperty(process, 'platform', platformDescriptor);
    });

    it('closes and clears ownership after preparation fails, retaining recovery files and the original error', () => {
      const error: Error = new Error('prepare failure');
      fileWriter.prepareForRelease = () => {
        throw error;
      };
      expect(() => lock.release()).toThrow(error);
      expect(fileWriter.close).toHaveBeenCalledTimes(1);
      expect(lock.isReleased).toBe(true);
      expect(FileSystem.deleteFile).not.toHaveBeenCalled();
      fileWriter.prepareForRelease = undefined;
      const recovered: LockFile = LockFile.tryAcquire(process.cwd(), 'release-test')!;
      expect(recovered).toBeDefined();
      recovered.release(false);
    });

    it('retains ownership and the in-process guard after close fails', () => {
      const error: Error = new Error('close failure');
      fileWriter.close = () => {
        throw error;
      };
      expect(() => lock.release()).toThrow(error);
      expect(lock.isReleased).toBe(false);
      expect(LockFile.tryAcquire(process.cwd(), 'release-test')).toBeUndefined();
      expect(FileSystem.deleteFile).not.toHaveBeenCalled();
    });

    it('preserves both preparation and close errors', () => {
      const preparationError: Error = new Error('prepare failure');
      const closeError: Error = new Error('close failure');
      fileWriter.prepareForRelease = () => {
        throw preparationError;
      };
      fileWriter.close = () => {
        throw closeError;
      };
      expect(() => lock.release()).toThrow(
        expect.objectContaining({ errors: [preparationError, closeError] })
      );
      expect(lock.isReleased).toBe(false);
      expect(FileSystem.deleteFile).not.toHaveBeenCalled();
    });

    it.each(['EPERM', 'EACCES', 'EIO'])(
      'surfaces unexpected deletion error %s after clearing ownership',
      (code) => {
        const error: NodeJS.ErrnoException = Object.assign(new Error('unlink failure'), { code });
        jest.mocked(FileSystem.deleteFile).mockImplementation(() => {
          throw error;
        });
        expect(() => lock.release()).toThrow(error);
        expect(lock.isReleased).toBe(true);
      }
    );

    it('tolerates only sharing-denied deletion after a successor acquires the lock', () => {
      jest.mocked(FileSystem.deleteFile).mockImplementation(() => {
        throw Object.assign(new Error('sharing violation'), { code: 'EBUSY' });
      });
      expect(() => lock.release()).not.toThrow();
      expect(lock.isReleased).toBe(true);
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
    // The second lock should not be dirty since it is acquired after the first lock is released
    expect(lock2.dirtyWhenAcquired).toEqual(false);
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

      test('deletes other hanging lockfiles if corresponding processes are not running anymore and marks dirtyWhenAcquired', () => {
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

        const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

        expect(lock).toBeDefined();
        expect(lock!.dirtyWhenAcquired).toEqual(true);
        expect(lock!.isReleased).toEqual(false);

        expect(deleteFileSpy).toHaveBeenCalledTimes(1);
        expect(deleteFileSpy).toHaveBeenNthCalledWith(1, otherPidLockFileName, {
          throwIfNotExists: false
        });

        lock!.release();
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

        const originalReadFile: typeof FileSystem.readFile = FileSystem.readFile;
        jest.spyOn(FileSystem, 'readFile').mockImplementation((filePath: string) => {
          if (filePath === otherPidLockFileName) {
            // simulate other process lock release right before the current process reads
            // other process lockfile to decide on next steps for acquiring the lock
            FileSystem.deleteFile(filePath);
          }

          return originalReadFile(filePath);
        });

        const deleteFileSpy = jest.spyOn(FileSystem, 'deleteFile');

        const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

        expect(lock).toBeDefined();
        expect(lock!.dirtyWhenAcquired).toEqual(false);
        expect(lock!.isReleased).toEqual(false);

        // Ensure there were no other FileSystem.deleteFile calls after our lock release simulation.
        // An extra attempt to delete the lockfile might lead to unexpectedly deleting a new lockfile
        // created by another process right after releasing/deleting the previous lockfile
        expect(deleteFileSpy).toHaveBeenCalledTimes(1);
        expect(deleteFileSpy).toHaveBeenNthCalledWith(1, otherPidLockFileName);

        lock!.release();
      });

      test("doesn't mark dirtyWhenAcquired if other process releases the lock and exits after its lockfile is read", () => {
        // ensure test folder is clean
        const testFolder: string = path.join(libTestFolder, '17');
        FileSystem.ensureEmptyFolder(testFolder);

        const resourceName: string = 'test';

        const otherPid: number = 999999999;
        const otherPidStartTime: string = '2012-01-02 12:53:12';

        const otherPidLockFileName: string = LockFile.getLockFilePath(testFolder, resourceName, otherPid);

        // create an open lockfile for other process
        const lockFileHandle: FileWriter = FileWriter.open(otherPidLockFileName);
        lockFileHandle.write(otherPidStartTime);
        lockFileHandle.close();

        // simulate other process lock release and exit while the current process checks whether it is running
        setLockFileGetProcessStartTime((pid: number) => {
          if (pid === otherPid) {
            FileSystem.deleteFile(otherPidLockFileName);
            return undefined;
          }
          return getProcessStartTime(pid);
        });

        const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

        expect(lock).toBeDefined();
        expect(lock!.dirtyWhenAcquired).toEqual(false);
        expect(lock!.isReleased).toEqual(false);

        lock!.release();
      });

      describe('when lockfiles have the same birthtime', () => {
        const resourceName: string = 'test';
        // Compared as strings, this is larger than any real PID, so a PID tie-break would favor this process.
        const otherPid: number = 999999999;
        const otherPidStartTime: string = '2012-01-02 12:53:12';
        const birthtime: Date = new Date(1500000000000);

        interface IOtherLockFile {
          otherPidLockFileName: string;
          ourGetStatisticsSpy: jest.SpyInstance;
        }

        function prepareOtherLockFile(
          testFolder: string,
          contents: string,
          otherBirthtime: Date,
          deleteAfterFirstRead: boolean = false
        ): IOtherLockFile {
          FileSystem.ensureEmptyFolder(testFolder);
          const otherPidLockFileName: string = LockFile.getLockFilePath(testFolder, resourceName, otherPid);
          const lockFileHandle: FileWriter = FileWriter.open(otherPidLockFileName);
          lockFileHandle.write(contents);
          lockFileHandle.close();

          // the other process is still running
          setLockFileGetProcessStartTime((pid: number) => {
            return pid === otherPid ? otherPidStartTime : getProcessStartTime(pid);
          });

          const ourGetStatisticsSpy: jest.SpyInstance = jest
            .spyOn(FileWriter.prototype, 'getStatistics')
            .mockReturnValue({ birthtime } as FileSystemStats);
          const originalGetStatistics: typeof FileSystem.getStatistics = FileSystem.getStatistics;
          jest.spyOn(FileSystem, 'getStatistics').mockImplementation((filePath: string) => {
            if (path.resolve(filePath) !== otherPidLockFileName) {
              return originalGetStatistics(filePath);
            }
            if (deleteAfterFirstRead) {
              // Like us, the other process saw the tie, so it deletes its lockfile before trying again.
              FileSystem.deleteFile(otherPidLockFileName);
            }
            return { birthtime: otherBirthtime } as FileSystemStats;
          });
          return { otherPidLockFileName, ourGetStatisticsSpy };
        }

        test('cannot acquire a lock if another valid lock has the same birthtime and a larger pid', () => {
          const testFolder: string = path.join(libTestFolder, '6');
          const { otherPidLockFileName, ourGetStatisticsSpy } = prepareOtherLockFile(
            testFolder,
            otherPidStartTime,
            birthtime
          );

          const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

          // The other process may have read the folder before our lockfile existed, in which case it
          // already holds the lock, so a tie must not let us acquire it.  We try again with a new
          // lockfile a few times before giving up.
          expect(lock).toBeUndefined();
          expect(ourGetStatisticsSpy).toHaveBeenCalledTimes(4);
          expect(FileSystem.exists(otherPidLockFileName)).toEqual(true);
          expect(FileSystem.exists(LockFile.getLockFilePath(testFolder, resourceName))).toEqual(false);
        });

        test('cannot acquire a lock or delete the other lockfile if it is still empty', () => {
          const testFolder: string = path.join(libTestFolder, '7');
          const { otherPidLockFileName } = prepareOtherLockFile(testFolder, '', birthtime);

          const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

          // The other process hasn't written its start time yet, so its lockfile is not stale.
          expect(lock).toBeUndefined();
          expect(FileSystem.exists(otherPidLockFileName)).toEqual(true);
        });

        test('can acquire a lock after a tie if the other process gives up', () => {
          const testFolder: string = path.join(libTestFolder, '8');
          const { otherPidLockFileName, ourGetStatisticsSpy } = prepareOtherLockFile(
            testFolder,
            otherPidStartTime,
            birthtime,
            true
          );

          const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

          expect(lock).toBeDefined();
          expect(lock!.dirtyWhenAcquired).toEqual(false);
          expect(ourGetStatisticsSpy).toHaveBeenCalledTimes(2);
          expect(FileSystem.exists(otherPidLockFileName)).toEqual(false);
          lock!.release();
        });

        test('does not try again if another valid lock is older', () => {
          const testFolder: string = path.join(libTestFolder, '9');
          const { otherPidLockFileName, ourGetStatisticsSpy } = prepareOtherLockFile(
            testFolder,
            otherPidStartTime,
            new Date(birthtime.getTime() - 1)
          );

          const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

          expect(lock).toBeUndefined();
          expect(ourGetStatisticsSpy).toHaveBeenCalledTimes(1);
          expect(FileSystem.exists(otherPidLockFileName)).toEqual(true);
        });

        test('can acquire a lock if the other valid lock is newer', () => {
          const testFolder: string = path.join(libTestFolder, '10');
          const { otherPidLockFileName } = prepareOtherLockFile(
            testFolder,
            otherPidStartTime,
            new Date(birthtime.getTime() + 1)
          );

          const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

          expect(lock).toBeDefined();
          expect(lock!.dirtyWhenAcquired).toEqual(false);
          expect(FileSystem.exists(otherPidLockFileName)).toEqual(true);
          lock!.release();
        });
      });

      describe('when the start time in a lockfile differs from the start time of its running process', () => {
        const resourceName: string = 'test';
        // The parent process is still running, and it started before any lockfile that this test creates.
        const otherPid: number = process.ppid;

        function createOtherLockFile(testFolder: string, contents: string): string {
          FileSystem.ensureEmptyFolder(testFolder);
          const otherPidLockFileName: string = LockFile.getLockFilePath(testFolder, resourceName, otherPid);
          const lockFileHandle: FileWriter = FileWriter.open(otherPidLockFileName);
          lockFileHandle.write(contents);
          lockFileHandle.close();
          return otherPidLockFileName;
        }

        test('cannot acquire a lock if the other process wrote its start time in another time zone', () => {
          const testFolder: string = path.join(libTestFolder, '11');
          // This is UTC+14 (or UTC-12 if that is the local time zone).  POSIX time zones need no time zone database.
          const otherTimeZone: string = new Date().getTimezoneOffset() === -840 ? 'XYZ+12' : 'XYZ-14';
          // What the other process writes if it runs with TZ=otherTimeZone
          const otherPidStartTime: string = child_process
            .spawnSync('ps', ['-p', `${otherPid}`, '-o', 'lstart'], {
              encoding: 'utf8',
              env: { ...process.env, TZ: otherTimeZone }
            })
            .stdout.split('\n')[1]
            .trim();
          expect(otherPidStartTime).not.toEqual(getProcessStartTime(otherPid));
          const otherPidLockFileName: string = createOtherLockFile(testFolder, otherPidStartTime);

          const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

          // The other process is running and started before its lockfile was created, so it holds the lock.
          expect(lock).toBeUndefined();
          expect(FileSystem.exists(otherPidLockFileName)).toEqual(true);
        });

        // Formats a time as "ps -o lstart" prints it with the C locale and TZ=UTC0, for example
        // "Sun Sep 27 17:15:08 2026".
        function formatLstartInUtc(timeMs: number): string {
          const date: Date = new Date(timeMs);
          const days: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const months: string[] = [
            'Jan',
            'Feb',
            'Mar',
            'Apr',
            'May',
            'Jun',
            'Jul',
            'Aug',
            'Sep',
            'Oct',
            'Nov',
            'Dec'
          ];
          const twoDigits: (value: number) => string = (value: number) => `${value}`.padStart(2, '0');
          return (
            `${days[date.getUTCDay()]} ${months[date.getUTCMonth()]} ${`${date.getUTCDate()}`.padStart(2, ' ')} ` +
            `${twoDigits(date.getUTCHours())}:${twoDigits(date.getUTCMinutes())}:${twoDigits(date.getUTCSeconds())} ` +
            `${date.getUTCFullYear()}`
          );
        }

        // What the other process wrote if its time zone is offsetMs ahead of UTC
        function getOtherPidStartTimeWithOffset(offsetMs: number): string {
          const otherPidStartTimeMs: number | undefined = getProcessStartTimeMs(otherPid);
          expect(otherPidStartTimeMs).toBeDefined();
          return formatLstartInUtc(otherPidStartTimeMs! + offsetMs);
        }

        test.each<[string, string, number]>([
          ['5 hours and 45 minutes ahead of UTC', '20', (5 * 60 + 45) * 60 * 1000],
          ['12 hours behind UTC', '21', -12 * 60 * 60 * 1000],
          ['7 hours behind UTC, printed 2 seconds off', '22', -7 * 60 * 60 * 1000 + 2000]
        ])(
          'cannot acquire a lock if the other process wrote its start time in a time zone %s',
          (description: string, folderName: string, offsetMs: number) => {
            const testFolder: string = path.join(libTestFolder, folderName);
            const otherPidLockFileName: string = createOtherLockFile(
              testFolder,
              getOtherPidStartTimeWithOffset(offsetMs)
            );

            const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

            expect(lock).toBeUndefined();
            expect(FileSystem.exists(otherPidLockFileName)).toEqual(true);
          }
        );

        test.each<[string, string, number]>([
          ['7 minutes after', '23', 7 * 60 * 1000],
          ['25 hours after', '24', 25 * 60 * 60 * 1000],
          ['13 hours before', '25', -13 * 60 * 60 * 1000]
        ])(
          'deletes the lockfile of a process that started before the lockfile if its start time is %s the start time of the process',
          (description: string, folderName: string, offsetMs: number) => {
            const testFolder: string = path.join(libTestFolder, folderName);
            // No time zone is this far from UTC, so the lockfile was written by another process that had the same
            // PID, for example in a container or before the lockfile was copied.
            const otherPidLockFileName: string = createOtherLockFile(
              testFolder,
              getOtherPidStartTimeWithOffset(offsetMs)
            );

            const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

            expect(lock).toBeDefined();
            expect(lock!.dirtyWhenAcquired).toEqual(true);
            expect(FileSystem.exists(otherPidLockFileName)).toEqual(false);
            lock!.release();
          }
        );

        test('deletes the lockfile of a process that started before the lockfile if its start time is from another year', () => {
          const testFolder: string = path.join(libTestFolder, '26');
          const otherPidLockFileName: string = createOtherLockFile(testFolder, 'Mon Jan  1 00:00:00 2024');

          const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

          expect(lock).toBeDefined();
          expect(lock!.dirtyWhenAcquired).toEqual(true);
          expect(FileSystem.exists(otherPidLockFileName)).toEqual(false);
          lock!.release();
        });

        test('cannot acquire a lock if the other process wrote its start time in the format of another locale', () => {
          const testFolder: string = path.join(libTestFolder, '27');
          // Only the C locale's format can be compared with the start time of the process.
          const otherPidLockFileName: string = createOtherLockFile(testFolder, 'Mo 28 Sep 2026 18:15:31');

          const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

          expect(lock).toBeUndefined();
          expect(FileSystem.exists(otherPidLockFileName)).toEqual(true);
        });

        test('deletes the lockfile of a process that started after the lockfile, even if its start time is in another time zone', () => {
          const testFolder: string = path.join(libTestFolder, '30');
          // UTC+14, or UTC-12 if that is the local time zone
          const otherTimeZone: string = new Date().getTimezoneOffset() === -840 ? 'XYZ+12' : 'XYZ-14';
          const otherPidStartTime: string = child_process
            .spawnSync('ps', ['-p', `${otherPid}`, '-o', 'lstart'], {
              encoding: 'utf8',
              env: { ...process.env, LC_ALL: 'C', TZ: otherTimeZone }
            })
            .stdout.split('\n')[1]
            .trim();
          const otherPidLockFileName: string = createOtherLockFile(testFolder, otherPidStartTime);
          // The lockfile was created 1 minute before the process with its PID started.
          const otherBirthtimeMs: number = getProcessStartTimeMs(otherPid)! - 60000;
          const originalGetStatistics: typeof FileSystem.getStatistics = FileSystem.getStatistics;
          jest.spyOn(FileSystem, 'getStatistics').mockImplementation((filePath: string) => {
            return path.resolve(filePath) === otherPidLockFileName
              ? ({ birthtime: new Date(otherBirthtimeMs) } as FileSystemStats)
              : originalGetStatistics(filePath);
          });

          const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

          expect(lock).toBeDefined();
          expect(lock!.dirtyWhenAcquired).toEqual(true);
          expect(FileSystem.exists(otherPidLockFileName)).toEqual(false);
          lock!.release();
        });

        test('deletes the lockfile if its PID now belongs to a process that started after the lockfile was created', () => {
          const testFolder: string = path.join(libTestFolder, '12');
          const otherPidLockFileName: string = createOtherLockFile(testFolder, 'Thu Jan  1 00:00:10 1970');
          const originalGetStatistics: typeof FileSystem.getStatistics = FileSystem.getStatistics;
          jest.spyOn(FileSystem, 'getStatistics').mockImplementation((filePath: string) => {
            return path.resolve(filePath) === otherPidLockFileName
              ? ({ birthtime: new Date(10000) } as FileSystemStats)
              : originalGetStatistics(filePath);
          });

          const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

          expect(lock).toBeDefined();
          expect(lock!.dirtyWhenAcquired).toEqual(true);
          expect(FileSystem.exists(otherPidLockFileName)).toEqual(false);
          lock!.release();
        });

        test('deletes an empty lockfile that is more than 1 second old', () => {
          const testFolder: string = path.join(libTestFolder, '13');
          const otherPidLockFileName: string = createOtherLockFile(testFolder, '');
          const originalGetStatistics: typeof FileSystem.getStatistics = FileSystem.getStatistics;
          jest.spyOn(FileSystem, 'getStatistics').mockImplementation((filePath: string) => {
            return path.resolve(filePath) === otherPidLockFileName
              ? ({ birthtime: new Date(Date.now() - 2000) } as FileSystemStats)
              : originalGetStatistics(filePath);
          });

          const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

          expect(lock).toBeDefined();
          expect(lock!.dirtyWhenAcquired).toEqual(true);
          expect(FileSystem.exists(otherPidLockFileName)).toEqual(false);
          lock!.release();
        });

        test("doesn't mark dirtyWhenAcquired if the process releases the lock and exits before its start time is checked again", () => {
          const testFolder: string = path.join(libTestFolder, '19');
          // No process has this PID, so the second check of its start time finds that the process exited.
          const exitedPid: number = 999999999;
          FileSystem.ensureEmptyFolder(testFolder);
          const exitedPidLockFileName: string = LockFile.getLockFilePath(testFolder, resourceName, exitedPid);
          const lockFileHandle: FileWriter = FileWriter.open(exitedPidLockFileName);
          lockFileHandle.write('Mon Jan  2 12:53:12 2012');
          lockFileHandle.close();

          // Before its lockfile is read, the process is running, and its start time is formatted differently,
          // as if it had another time zone.
          setLockFileGetProcessStartTime((pid: number) => {
            return pid === exitedPid ? 'Mon Jan  2 04:53:12 2012' : getProcessStartTime(pid);
          });
          // Right after its lockfile is read, the process releases the lock and exits.
          const originalGetStatistics: typeof FileSystem.getStatistics = FileSystem.getStatistics;
          jest.spyOn(FileSystem, 'getStatistics').mockImplementation((filePath: string) => {
            const statistics: FileSystemStats = originalGetStatistics(filePath);
            if (path.resolve(filePath) === exitedPidLockFileName) {
              FileSystem.deleteFile(exitedPidLockFileName);
            }
            return statistics;
          });

          const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

          expect(lock).toBeDefined();
          expect(lock!.dirtyWhenAcquired).toEqual(false);
          lock!.release();
        });
      });

      describe(getProcessStartTimeMs.name, () => {
        test('returns the start time of a process', () => {
          const startTimeMs: number | undefined = getProcessStartTimeMs(process.pid);
          expect(startTimeMs).toBeDefined();
          expect(startTimeMs! % 1000).toEqual(0);
          expect(Math.abs(startTimeMs! - (Date.now() - process.uptime() * 1000))).toBeLessThan(5000);
        });

        test('does not depend on the time zone', () => {
          const startTimeMs: number | undefined = getProcessStartTimeMs(process.pid);
          const originalTimeZone: string | undefined = process.env.TZ;
          process.env.TZ = 'XYZ-14';
          try {
            expect(getProcessStartTimeMs(process.pid)).toEqual(startTimeMs);
          } finally {
            if (originalTimeZone === undefined) {
              delete process.env.TZ;
            } else {
              process.env.TZ = originalTimeZone;
            }
          }
        });

        test('returns undefined if the process does not exist', () => {
          expect(getProcessStartTimeMs(999999999)).toBeUndefined();
        });
      });

      if (process.platform === 'linux') {
        describe(getLinuxProcessStartTime.name, () => {
          test('returns what "ps -o lstart" prints with the C locale', () => {
            for (const pid of [process.pid, process.ppid, 1]) {
              expect(getLinuxProcessStartTime(pid, getLinuxBootTimeSeconds)!.lstart).toEqual(
                getLstartWithCLocale(pid)
              );
            }
          });

          test('uses the time zone of the process, like "ps"', () => {
            // A test can't change the time zone of its own process in Jest, so this runs another process.
            const timeZone: string = new Date().getTimezoneOffset() === -840 ? 'XYZ+12' : 'XYZ-14';
            const lockFileModulePath: string = require.resolve('../LockFile');
            const script: string =
              `const { getLinuxProcessStartTime, getLinuxBootTimeSeconds } = require(${JSON.stringify(lockFileModulePath)});` +
              `console.log(getLinuxProcessStartTime(${process.pid}, getLinuxBootTimeSeconds).lstart);`;
            const lstart: string = child_process
              .spawnSync(process.execPath, ['-e', script], {
                encoding: 'utf8',
                env: { ...process.env, TZ: timeZone }
              })
              .stdout.trim();

            expect(lstart).toEqual(getLstartWithCLocale(process.pid, timeZone));
            expect(lstart).not.toEqual(
              getLinuxProcessStartTime(process.pid, getLinuxBootTimeSeconds)!.lstart
            );
          });

          test('returns the start time in clock ticks from /proc/[pid]/stat', () => {
            expect(getLinuxProcessStartTime(process.pid, getLinuxBootTimeSeconds)!.ticks).toEqual(
              getProcessStartTimeFromProcStat(FileSystem.readFile(`/proc/${process.pid}/stat`))
            );
          });

          test('reads /proc/[pid]/stat if the command name contains spaces and parentheses', () => {
            mockReadFile(
              '/proc/12345/stat',
              '12345 (a) (b) S 1 1 1 0 -1 4194304 0 0 0 0 0 0 0 0 20 0 1 0 250 0 0\n'
            );
            // 250 ticks are 2.5 seconds, which "ps" rounds down.  This is September 8 or 9, 2001 in any time zone.
            const expectedLstart: string = child_process
              .spawnSync('date', ['-d', '@1000000002', '+%a %b %e %H:%M:%S %Y'], {
                encoding: 'utf8',
                env: { ...process.env, LC_ALL: 'C' }
              })
              .stdout.trim();

            expect(getLinuxProcessStartTime(12345, () => 1000000000)).toEqual({
              lstart: expectedLstart,
              ticks: '250',
              startTimeMs: 1000000002000
            });
            expect(expectedLstart).toMatch(/^[A-Z][a-z]{2} Sep {2}[89] \d\d:\d\d:\d\d 2001$/);
          });

          test('returns undefined if the process does not exist', () => {
            expect(getLinuxProcessStartTime(999999999, getLinuxBootTimeSeconds)).toBeUndefined();
          });

          test('throws if /proc/[pid]/stat cannot be read', () => {
            mockReadFile('/proc/12345/stat', createEaccesError());
            expect(() => getLinuxProcessStartTime(12345, getLinuxBootTimeSeconds)).toThrow('EACCES');
          });

          test('throws if /proc/[pid]/stat has an unexpected format', () => {
            mockReadFile('/proc/12345/stat', '12345 (node) S 1\n');
            expect(() => getLinuxProcessStartTime(12345, getLinuxBootTimeSeconds)).toThrow(
              'unexpected format'
            );
          });
        });

        describe('when other lockfiles belong to running processes', () => {
          const resourceName: string = 'test';
          let childProcesses: child_process.ChildProcess[] = [];

          afterEach(() => {
            for (const childProcess of childProcesses) {
              childProcess.kill();
            }
            childProcesses = [];
          });

          function startProcesses(count: number): number[] {
            for (let i: number = 0; i < count; i++) {
              childProcesses.push(child_process.spawn('sleep', ['60'], { stdio: 'ignore' }));
            }
            return childProcesses.map((childProcess: child_process.ChildProcess) => childProcess.pid!);
          }

          // Creates a lockfile for each process that is newer than the lockfile of this process,
          // so that tryAcquire() checks all of them and then acquires the lock.
          function createNewerLockFiles(
            testFolder: string,
            otherPids: number[],
            getContents: (pid: number) => string
          ): string[] {
            FileSystem.ensureEmptyFolder(testFolder);
            const otherPidLockFileNames: string[] = otherPids.map((otherPid: number) => {
              const otherPidLockFileName: string = LockFile.getLockFilePath(
                testFolder,
                resourceName,
                otherPid
              );
              FileSystem.writeFile(otherPidLockFileName, getContents(otherPid));
              return otherPidLockFileName;
            });
            const originalGetStatistics: typeof FileSystem.getStatistics = FileSystem.getStatistics;
            jest.spyOn(FileSystem, 'getStatistics').mockImplementation((filePath: string) => {
              return otherPidLockFileNames.includes(path.resolve(filePath))
                ? ({ birthtime: new Date(Date.now() + 60000) } as FileSystemStats)
                : originalGetStatistics(filePath);
            });
            return otherPidLockFileNames;
          }

          function expectToAcquireAndKeep(testFolder: string, otherPidLockFileNames: string[]): void {
            const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

            expect(lock).toBeDefined();
            expect(lock!.dirtyWhenAcquired).toEqual(false);
            for (const otherPidLockFileName of otherPidLockFileNames) {
              expect(FileSystem.exists(otherPidLockFileName)).toEqual(true);
            }
            lock!.release();
          }

          test('does not run "ps" for them', () => {
            const testFolder: string = path.join(libTestFolder, '14');
            const otherPidLockFileNames: string[] = createNewerLockFiles(
              testFolder,
              [process.ppid, 1, ...startProcesses(6)],
              getLstartWithCLocale
            );
            // LockFile calls the functions of this module object, so they can be spied on here.
            const nativeChildProcess: typeof child_process = jest.requireActual('node:child_process');
            const spawnSyncSpy: jest.SpyInstance = jest.spyOn(nativeChildProcess, 'spawnSync');
            const readFileSpy: jest.SpyInstance = jest.spyOn(FileSystem, 'readFile');

            expectToAcquireAndKeep(testFolder, otherPidLockFileNames);

            // "ps" ran only for the start time of this process.
            expect(spawnSyncSpy).toHaveBeenCalledTimes(1);
            expect(spawnSyncSpy.mock.calls[0][1]).toEqual(['-p', `${process.pid}`, '-o', 'lstart']);
            // The boot time was read once.
            expect(readFileSpy.mock.calls.filter((args: unknown[]) => args[0] === '/proc/stat')).toHaveLength(
              1
            );
          });

          test('does not run "ps" if a lockfile has the start time in clock ticks', () => {
            const testFolder: string = path.join(libTestFolder, '15');
            const otherPidLockFileNames: string[] = createNewerLockFiles(
              testFolder,
              startProcesses(1),
              (otherPid: number) => getLinuxProcessStartTime(otherPid, getLinuxBootTimeSeconds)!.ticks
            );
            const getStartTimeSpy: jest.Mock = jest.fn(getProcessStartTime);
            setLockFileGetProcessStartTime(getStartTimeSpy);

            expectToAcquireAndKeep(testFolder, otherPidLockFileNames);

            expect(getStartTimeSpy.mock.calls).toEqual([[process.pid]]);
          });

          test('runs "ps" if /proc/[pid]/stat cannot be read', () => {
            const testFolder: string = path.join(libTestFolder, '16');
            const otherPids: number[] = startProcesses(1);
            const otherPidLockFileNames: string[] = createNewerLockFiles(
              testFolder,
              otherPids,
              getLstartWithCLocale
            );
            mockReadFile(`/proc/${otherPids[0]}/stat`, createEaccesError());
            const getStartTimeSpy: jest.Mock = jest.fn(getProcessStartTime);
            setLockFileGetProcessStartTime(getStartTimeSpy);

            expectToAcquireAndKeep(testFolder, otherPidLockFileNames);

            expect(getStartTimeSpy.mock.calls).toEqual([[process.pid], [otherPids[0]]]);
          });

          test('does not run "ps" for them if they wrote their start times with other time zones or locales', () => {
            const testFolder: string = path.join(libTestFolder, '28');
            const otherPids: number[] = startProcesses(3);
            const otherPidLockFileNames: string[] = createNewerLockFiles(
              testFolder,
              otherPids,
              (otherPid: number) => {
                switch (otherPids.indexOf(otherPid)) {
                  case 0:
                    return getLstartWithCLocale(otherPid, 'XYZ-05:45');
                  case 1:
                    return getLstartWithCLocale(otherPid, 'XYZ+12');
                  default:
                    // The format of another locale
                    return '28.09.2026 18:15:31';
                }
              }
            );
            const nativeChildProcess: typeof child_process = jest.requireActual('node:child_process');
            const spawnSyncSpy: jest.SpyInstance = jest.spyOn(nativeChildProcess, 'spawnSync');

            expectToAcquireAndKeep(testFolder, otherPidLockFileNames);

            // "ps" ran only for the start time of this process.
            expect(spawnSyncSpy).toHaveBeenCalledTimes(1);
            expect(spawnSyncSpy.mock.calls[0][1]).toEqual(['-p', `${process.pid}`, '-o', 'lstart']);
          });

          test('runs "ps" for a lockfile whose start time is not the start time of its process in any time zone', () => {
            const testFolder: string = path.join(libTestFolder, '29');
            const otherPids: number[] = startProcesses(1);
            // Another process that had the same PID wrote this lockfile.  It started 7 minutes after this process.
            const otherPidLockFileNames: string[] = createNewerLockFiles(
              testFolder,
              otherPids,
              (otherPid: number) => getLstartWithCLocale(otherPid, 'XYZ-00:07')
            );
            const getStartTimeSpy: jest.Mock = jest.fn(getProcessStartTime);
            setLockFileGetProcessStartTime(getStartTimeSpy);

            const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);

            // /proc never makes a lockfile stale, so "ps" decided it.
            expect(getStartTimeSpy.mock.calls).toEqual([[process.pid], [otherPids[0]]]);
            expect(lock).toBeDefined();
            expect(lock!.dirtyWhenAcquired).toEqual(true);
            expect(FileSystem.exists(otherPidLockFileNames[0])).toEqual(false);
            lock!.release();
          });
        });

        describe('when this process acquires locks again', () => {
          const resourceName: string = 'test';
          const testFolder: string = path.join(libTestFolder, '18');

          beforeEach(() => {
            FileSystem.ensureEmptyFolder(testFolder);
          });

          // Returns what the lockfile of this process contained
          function acquireAndRelease(): string {
            const lock: LockFile | undefined = LockFile.tryAcquire(testFolder, resourceName);
            expect(lock).toBeDefined();
            const contents: string = FileSystem.readFile(LockFile.getLockFilePath(testFolder, resourceName));
            lock!.release();
            return contents;
          }

          test('runs "ps" for the start time of this process only once', () => {
            const getStartTimeSpy: jest.Mock = jest.fn(getProcessStartTime);
            setLockFileGetProcessStartTime(getStartTimeSpy);
            const expectedStartTime: string = getProcessStartTime(process.pid)!;

            for (let i: number = 0; i < 3; i++) {
              expect(acquireAndRelease()).toEqual(expectedStartTime);
            }

            expect(getStartTimeSpy.mock.calls).toEqual([[process.pid]]);
          });

          test('runs "ps" again if the boot time changes, as it does when the system clock is set', () => {
            const getStartTimeSpy: jest.Mock = jest.fn(getProcessStartTime);
            setLockFileGetProcessStartTime(getStartTimeSpy);

            acquireAndRelease();
            mockReadFile('/proc/stat', `btime ${getLinuxBootTimeSeconds() - 3600}\n`);
            acquireAndRelease();
            acquireAndRelease();

            expect(getStartTimeSpy.mock.calls).toEqual([[process.pid], [process.pid]]);
          });

          test('runs "ps" again if it did not return the start time', () => {
            const getStartTimeSpy: jest.Mock = jest
              .fn(getProcessStartTime)
              .mockImplementationOnce(() => undefined);
            setLockFileGetProcessStartTime(getStartTimeSpy);

            expect(() => LockFile.tryAcquire(testFolder, resourceName)).toThrow(
              'Unable to calculate start time for current process.'
            );
            acquireAndRelease();
            acquireAndRelease();

            expect(getStartTimeSpy.mock.calls).toEqual([[process.pid], [process.pid]]);
          });

          test('runs "ps" for other processes each time', () => {
            const otherPid: number = 999999999;
            const otherPidStartTime: string = '2012-01-02 12:53:12';
            const otherPidLockFileName: string = LockFile.getLockFilePath(testFolder, resourceName, otherPid);
            FileSystem.writeFile(otherPidLockFileName, otherPidStartTime);
            const originalGetStatistics: typeof FileSystem.getStatistics = FileSystem.getStatistics;
            jest.spyOn(FileSystem, 'getStatistics').mockImplementation((filePath: string) => {
              return path.resolve(filePath) === otherPidLockFileName
                ? ({ birthtime: new Date(Date.now() - 60000) } as FileSystemStats)
                : originalGetStatistics(filePath);
            });
            const getStartTimeSpy: jest.Mock = jest.fn((pid: number) =>
              pid === otherPid ? otherPidStartTime : getProcessStartTime(pid)
            );
            setLockFileGetProcessStartTime(getStartTimeSpy);

            for (let i: number = 0; i < 3; i++) {
              expect(LockFile.tryAcquire(testFolder, resourceName)).toBeUndefined();
            }

            expect(getStartTimeSpy.mock.calls).toEqual([[process.pid], [otherPid], [otherPid], [otherPid]]);
          });

          test('uses the new function after the function is replaced', () => {
            setLockFileGetProcessStartTime(() => 'Mon Jan  1 00:00:00 2024');
            expect(acquireAndRelease()).toEqual('Mon Jan  1 00:00:00 2024');

            setLockFileGetProcessStartTime(() => 'Tue Jan  2 00:00:00 2024');
            expect(acquireAndRelease()).toEqual('Tue Jan  2 00:00:00 2024');
          });
        });
      }
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
