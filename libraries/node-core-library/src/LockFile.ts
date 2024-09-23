// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as child_process from 'child_process';
import { FileSystem } from './FileSystem';
import { FileWriter } from './FileWriter';
import { Async } from './Async';

/**
 * http://man7.org/linux/man-pages/man5/proc.5.html
 * (22) starttime  %llu
 * The time the process started after system boot. In kernels before Linux 2.6, this value was
 * expressed in jiffies. Since Linux 2.6, the value is expressed in clock ticks (divide by
 * sysconf(_SC_CLK_TCK)).
 * The format for this field was %lu before Linux 2.6.
 */
const procStatStartTimePos: number = 22;

/**
 * Parses the process start time from the contents of a linux /proc/[pid]/stat file.
 * @param stat - The contents of a linux /proc/[pid]/stat file.
 * @returns The process start time in jiffies, or undefined if stat has an unexpected format.
 */
export function getProcessStartTimeFromProcStat(stat: string): string | undefined {
  // Parse the value at position procStatStartTimePos.
  // We cannot just split stat on spaces, because value 2 may contain spaces.
  // For example, when running the following Shell commands:
  // > cp "$(which bash)" ./'bash 2)('
  // > ./'bash 2)(' -c 'OWNPID=$BASHPID;cat /proc/$OWNPID/stat'
  // 59389 (bash 2)() S 59358 59389 59358 34818 59389 4202496 329 0 0 0 0 0 0 0 20 0 1 0
  // > rm -rf ./'bash 2)('
  // The output shows a stat file such that value 2 contains spaces.
  // To still umambiguously parse such output we assume no values after the second ends with a right parenthesis...

  // trimRight to remove the trailing line terminator.
  let values: string[] = stat.trimRight().split(' ');
  let i: number = values.length - 1;
  while (
    i >= 0 &&
    // charAt returns an empty string if the index is out of bounds.
    values[i].charAt(values[i].length - 1) !== ')'
  ) {
    i -= 1;
  }
  // i is the index of the last part of the second value (but i need not be 1).
  if (i < 1) {
    // Format of stat has changed.
    return undefined;
  }
  const value2: string = values.slice(1, i + 1).join(' ');
  values = [values[0], value2].concat(values.slice(i + 1));
  if (values.length < procStatStartTimePos) {
    // Older version of linux, or non-standard configuration of linux.
    return undefined;
  }
  const startTimeJiffies: string = values[procStatStartTimePos - 1];
  // In theory, the representations of start time returned by `cat /proc/[pid]/stat` and `ps -o lstart` can change
  // while the system is running, but we assume this does not happen.
  // So the caller can safely use this value as part of a unique process id (on the machine, without comparing
  // across reboots).
  return startTimeJiffies;
}

/**
 * Helper function that is exported for unit tests only.
 * Returns undefined if the process doesn't exist with that pid.
 */
export function getProcessStartTime(pid: number): string | undefined {
  const pidString: string = pid.toString();
  if (pid < 0 || pidString.indexOf('e') >= 0 || pidString.indexOf('E') >= 0) {
    throw new Error(`"pid" is negative or too large`);
  }
  let args: string[];
  if (process.platform === 'darwin') {
    args = [`-p ${pidString}`, '-o lstart'];
  } else if (process.platform === 'linux') {
    args = ['-p', pidString, '-o', 'lstart'];
  } else {
    throw new Error(`Unsupported system: ${process.platform}`);
  }

  const psResult: child_process.SpawnSyncReturns<string> = child_process.spawnSync('ps', args, {
    encoding: 'utf8'
  });
  const psStdout: string = psResult.stdout;

  // If no process with PID pid exists then the exit code is non-zero on linux but stdout is not empty.
  // But if no process exists we do not want to fall back on /proc/*/stat to determine the process
  // start time, so we we additionally test for !psStdout. NOTE: !psStdout evaluates to true if
  // zero bytes are written to stdout.
  if (psResult.status !== 0 && !psStdout && process.platform === 'linux') {
    // Try to read /proc/[pid]/stat and get the value at position procStatStartTimePos.
    let stat: undefined | string;
    try {
      stat = FileSystem.readFile(`/proc/${pidString}/stat`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // Either no process with PID pid exists, or this version/configuration of linux is non-standard.
      // We assume the former.
      return undefined;
    }
    if (stat !== undefined) {
      const startTimeJiffies: string | undefined = getProcessStartTimeFromProcStat(stat);
      if (startTimeJiffies === undefined) {
        throw new Error(
          `Could not retrieve the start time of process ${pidString} from the OS because the ` +
            `contents of /proc/${pidString}/stat have an unexpected format`
        );
      }
      return startTimeJiffies;
    }
  }

  // there was an error executing ps (zero bytes were written to stdout).
  if (!psStdout) {
    throw new Error(`Unexpected output from "ps" command`);
  }

  const psSplit: string[] = psStdout.split('\n');

  // successfully able to run "ps", but no process was found
  if (psSplit[1] === '') {
    return undefined;
  }

  if (psSplit[1]) {
    const trimmed: string = psSplit[1].trim();
    if (trimmed.length > 10) {
      return trimmed;
    }
  }

  throw new Error(`Unexpected output from the "ps" command`);
}

// A set of locks that currently exist in the current process, to be used when
// multiple locks are acquired in the same process.
const IN_PROC_LOCKS: Set<string> = new Set<string>();

/**
 * The `LockFile` implements a file-based mutex for synchronizing access to a shared resource
 * between multiple Node.js processes.  It is not recommended for synchronization solely within
 * a single Node.js process.
 * @remarks
 * The implementation works on Windows, Mac, and Linux without requiring any native helpers.
 * On non-Windows systems, the algorithm requires access to the `ps` shell command.  On Linux,
 * it requires access the `/proc/${pidString}/stat` filesystem.
 * @public
 */
export class LockFile {
  private static _getStartTime: (pid: number) => string | undefined = getProcessStartTime;

  private _fileWriter: FileWriter | undefined;
  private _filePath: string;
  private _dirtyWhenAcquired: boolean;

  private constructor(fileWriter: FileWriter | undefined, filePath: string, dirtyWhenAcquired: boolean) {
    this._fileWriter = fileWriter;
    this._filePath = filePath;
    this._dirtyWhenAcquired = dirtyWhenAcquired;

    IN_PROC_LOCKS.add(filePath);
  }

  /**
   * Returns the path of the lockfile that will be created when a lock is successfully acquired.
   * @param resourceFolder - The folder where the lock file will be created
   * @param resourceName - An alphanumeric name that describes the resource being locked.  This will become
   *   the filename of the temporary file created to manage the lock.
   * @param pid - The PID for the current Node.js process (`process.pid`), which is used by the locking algorithm.
   */
  public static getLockFilePath(
    resourceFolder: string,
    resourceName: string,
    pid: number = process.pid
  ): string {
    if (!resourceName.match(/^[a-zA-Z0-9][a-zA-Z0-9-.]+[a-zA-Z0-9]$/)) {
      throw new Error(
        `The resource name "${resourceName}" is invalid.` +
          ` It must be an alphanumeric string with only "-" or "." It must start and end with an alphanumeric character.`
      );
    }

    switch (process.platform) {
      case 'win32': {
        return path.resolve(resourceFolder, `${resourceName}.lock`);
      }

      case 'linux':
      case 'darwin': {
        return path.resolve(resourceFolder, `${resourceName}#${pid}.lock`);
      }

      default: {
        throw new Error(`File locking not implemented for platform: "${process.platform}"`);
      }
    }
  }

  /**
   * Attempts to create a lockfile with the given filePath.
   * @param resourceFolder - The folder where the lock file will be created
   * @param resourceName - An alphanumeric name that describes the resource being locked.  This will become
   *   the filename of the temporary file created to manage the lock.
   * @returns If successful, returns a `LockFile` instance.  If unable to get a lock, returns `undefined`.
   */
  public static tryAcquire(resourceFolder: string, resourceName: string): LockFile | undefined {
    FileSystem.ensureFolder(resourceFolder);
    const lockFilePath: string = LockFile.getLockFilePath(resourceFolder, resourceName);
    return LockFile._tryAcquireInner(resourceFolder, resourceName, lockFilePath);
  }

  /**
   * @deprecated Use {@link LockFile.acquireAsync} instead.
   */
  public static acquire(resourceFolder: string, resourceName: string, maxWaitMs?: number): Promise<LockFile> {
    return LockFile.acquireAsync(resourceFolder, resourceName, maxWaitMs);
  }

  /**
   * Attempts to create the lockfile.  Will continue to loop at every 100ms until the lock becomes available
   * or the maxWaitMs is surpassed.
   *
   * @remarks
   * This function is subject to starvation, whereby it does not ensure that the process that has been
   * waiting the longest to acquire the lock will get it first. This means that a process could theoretically
   * wait for the lock forever, while other processes skipped it in line and acquired the lock first.
   *
   * @param resourceFolder - The folder where the lock file will be created
   * @param resourceName - An alphanumeric name that describes the resource being locked.  This will become
   *   the filename of the temporary file created to manage the lock.
   * @param maxWaitMs - The maximum number of milliseconds to wait for the lock before reporting an error
   */
  public static async acquireAsync(
    resourceFolder: string,
    resourceName: string,
    maxWaitMs?: number
  ): Promise<LockFile> {
    const interval: number = 100;
    const startTime: number = Date.now();
    const timeoutTime: number | undefined = maxWaitMs ? startTime + maxWaitMs : undefined;

    await FileSystem.ensureFolderAsync(resourceFolder);

    const lockFilePath: string = LockFile.getLockFilePath(resourceFolder, resourceName);

    // eslint-disable-next-line no-unmodified-loop-condition
    while (!timeoutTime || Date.now() <= timeoutTime) {
      const lock: LockFile | undefined = LockFile._tryAcquireInner(
        resourceFolder,
        resourceName,
        lockFilePath
      );
      if (lock) {
        return lock;
      }

      await Async.sleepAsync(interval);
    }

    throw new Error(`Exceeded maximum wait time to acquire lock for resource "${resourceName}"`);
  }

  private static _tryAcquireInner(
    resourceFolder: string,
    resourceName: string,
    lockFilePath: string
  ): LockFile | undefined {
    if (!IN_PROC_LOCKS.has(lockFilePath)) {
      switch (process.platform) {
        case 'win32': {
          return LockFile._tryAcquireWindows(lockFilePath);
        }

        case 'linux':
        case 'darwin': {
          return LockFile._tryAcquireMacOrLinux(resourceFolder, resourceName, lockFilePath);
        }

        default: {
          throw new Error(`File locking not implemented for platform: "${process.platform}"`);
        }
      }
    }
  }

  /**
   * Attempts to acquire the lock on a Linux or OSX machine
   */
  private static _tryAcquireMacOrLinux(
    resourceFolder: string,
    resourceName: string,
    pidLockFilePath: string
  ): LockFile | undefined {
    let dirtyWhenAcquired: boolean = false;

    // get the current process' pid
    const pid: number = process.pid;
    const startTime: string | undefined = LockFile._getStartTime(pid);

    if (!startTime) {
      throw new Error(`Unable to calculate start time for current process.`);
    }

    let lockFileHandle: FileWriter | undefined;

    let lockFile: LockFile;

    try {
      // open in write mode since if this file exists, it cannot be from the current process
      // TODO: This will malfunction if the same process tries to acquire two locks on the same file.
      // We should ideally maintain a dictionary of normalized acquired filenames
      lockFileHandle = FileWriter.open(pidLockFilePath);
      lockFileHandle.write(startTime);
      const currentBirthTimeMs: number = lockFileHandle.getStatistics().birthtime.getTime();

      let smallestBirthTimeMs: number = currentBirthTimeMs;
      let smallestBirthTimePid: string = pid.toString();

      // now, scan the directory for all lockfiles
      const files: string[] = FileSystem.readFolderItemNames(resourceFolder);

      // look for anything ending with # then numbers and ".lock"
      const lockFileRegExp: RegExp = /^(.+)#([0-9]+)\.lock$/;

      let match: RegExpMatchArray | null;
      let otherPid: string;
      for (const fileInFolder of files) {
        if (
          (match = fileInFolder.match(lockFileRegExp)) &&
          match[1] === resourceName &&
          (otherPid = match[2]) !== pid.toString()
        ) {
          // we found at least one lockfile hanging around that isn't ours
          const fileInFolderPath: string = `${resourceFolder}/${fileInFolder}`;
          dirtyWhenAcquired = true;

          // console.log(`FOUND OTHER LOCKFILE: ${otherPid}`);

          const otherPidCurrentStartTime: string | undefined = LockFile._getStartTime(parseInt(otherPid, 10));

          let otherPidOldStartTime: string | undefined;
          let otherBirthtimeMs: number | undefined;
          try {
            otherPidOldStartTime = FileSystem.readFile(fileInFolderPath);
            // check the timestamp of the file
            otherBirthtimeMs = FileSystem.getStatistics(fileInFolderPath).birthtime.getTime();
          } catch (error) {
            if (FileSystem.isNotExistError(error)) {
              // the file is already deleted by other process, skip it
              continue;
            }
          }

          // if the otherPidOldStartTime is invalid, then we should look at the timestamp,
          // if this file was created after us, ignore it
          // if it was created within 1 second before us, then it could be good, so we
          //  will conservatively fail
          // otherwise it is an old lock file and will be deleted
          if (otherPidOldStartTime === '' && otherBirthtimeMs !== undefined) {
            if (otherBirthtimeMs > currentBirthTimeMs) {
              // ignore this file, he will be unable to get the lock since this process
              // will hold it
              // console.log(`Ignoring lock for pid ${otherPid} because its lockfile is newer than ours.`);
              continue;
            } else if (
              otherBirthtimeMs - currentBirthTimeMs < 0 && // it was created before us AND
              otherBirthtimeMs - currentBirthTimeMs > -1000
            ) {
              // it was created less than a second before

              // conservatively be unable to keep the lock
              return undefined;
            }
          }

          // console.log(`Other pid ${otherPid} lockfile has start time: "${otherPidOldStartTime}"`);
          // console.log(`Other pid ${otherPid} actually has start time: "${otherPidCurrentStartTime}"`);

          // this means the process is no longer executing, delete the file
          if (!otherPidCurrentStartTime || otherPidOldStartTime !== otherPidCurrentStartTime) {
            // console.log(`Other pid ${otherPid} is no longer executing!`);
            FileSystem.deleteFile(fileInFolderPath);
            continue;
          }

          // console.log(`Pid ${otherPid} lockfile has birth time: ${otherBirthtimeMs}`);
          // console.log(`Pid ${pid} lockfile has birth time: ${currentBirthTimeMs}`);
          // this is a lockfile pointing at something valid
          if (otherBirthtimeMs !== undefined) {
            // the other lock file was created before the current earliest lock file
            // or the other lock file was created at the same exact time, but has earlier pid

            // note that it is acceptable to do a direct comparison of the PIDs in this case
            // since we are establishing a consistent order to apply to the lock files in all
            // execution instances.

            // it doesn't matter that the PIDs roll over, we've already
            // established that these processes all started at the same time, so we just
            // need to get all instances of the lock test to agree which one won.
            if (
              otherBirthtimeMs < smallestBirthTimeMs ||
              (otherBirthtimeMs === smallestBirthTimeMs && otherPid < smallestBirthTimePid)
            ) {
              smallestBirthTimeMs = otherBirthtimeMs;
              smallestBirthTimePid = otherPid;
            }
          }
        }
      }

      if (smallestBirthTimePid !== pid.toString()) {
        // we do not have the lock
        return undefined;
      }

      // we have the lock!
      lockFile = new LockFile(lockFileHandle, pidLockFilePath, dirtyWhenAcquired);
      lockFileHandle = undefined; // we have handed the descriptor off to the instance
    } finally {
      if (lockFileHandle) {
        // ensure our lock is closed
        lockFileHandle.close();
        FileSystem.deleteFile(pidLockFilePath);
      }
    }
    return lockFile;
  }

  /**
   * Attempts to acquire the lock using Windows
   * This algorithm is much simpler since we can rely on the operating system
   */
  private static _tryAcquireWindows(lockFilePath: string): LockFile | undefined {
    let dirtyWhenAcquired: boolean = false;

    let fileHandle: FileWriter | undefined;
    let lockFile: LockFile;

    try {
      if (FileSystem.exists(lockFilePath)) {
        dirtyWhenAcquired = true;

        // If the lockfile is held by an process with an exclusive lock, then removing it will
        // silently fail. OpenSync() below will then fail and we will be unable to create a lock.

        // Otherwise, the lockfile is sitting on disk, but nothing is holding it, implying that
        // the last process to hold it died.
        FileSystem.deleteFile(lockFilePath);
      }

      try {
        // Attempt to open an exclusive lockfile
        fileHandle = FileWriter.open(lockFilePath, { exclusive: true });
      } catch (error) {
        // we tried to delete the lock, but something else is holding it,
        // (probably an active process), therefore we are unable to create a lock
        return undefined;
      }

      // Ensure we can hand off the file descriptor to the lockfile
      lockFile = new LockFile(fileHandle, lockFilePath, dirtyWhenAcquired);
      fileHandle = undefined;
    } finally {
      if (fileHandle) {
        fileHandle.close();
      }
    }

    return lockFile;
  }

  /**
   * Unlocks a file and optionally removes it from disk.
   * This can only be called once.
   *
   * @param deleteFile - Whether to delete the lockfile from disk. Defaults to true.
   */
  public release(deleteFile: boolean = true): void {
    if (this.isReleased) {
      throw new Error(`The lock for file "${path.basename(this._filePath)}" has already been released.`);
    }

    IN_PROC_LOCKS.delete(this._filePath);

    this._fileWriter!.close();
    if (deleteFile) {
      FileSystem.deleteFile(this._filePath);
    }

    this._fileWriter = undefined;
  }

  /**
   * Returns the initial state of the lock.
   * This can be used to detect if the previous process was terminated before releasing the resource.
   */
  public get dirtyWhenAcquired(): boolean {
    return this._dirtyWhenAcquired;
  }

  /**
   * Returns the absolute path to the lockfile
   */
  public get filePath(): string {
    return this._filePath;
  }

  /**
   * Returns true if this lock is currently being held.
   */
  public get isReleased(): boolean {
    return this._fileWriter === undefined;
  }
}
