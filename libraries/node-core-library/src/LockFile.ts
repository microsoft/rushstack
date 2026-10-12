// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import * as child_process from 'node:child_process';

import { FileSystem } from './FileSystem';
import { FileWriter } from './FileWriter';
import { Async } from './Async';
import { getWindowsLockFileDirtyPath, tryAcquireWindowsLockFile } from './WindowsLockFile';

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

const LSTART_MONTHS: string[] = [
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

/**
 * Helper function that is exported for unit tests only.
 * Returns the time when the process started, in milliseconds since the epoch, rounded down to a whole second.
 * Unlike getProcessStartTime(), the result doesn't depend on the time zone or locale of the current process.
 * Returns undefined if the process doesn't exist with that pid, or if its start time can't be determined.
 */
export function getProcessStartTimeMs(pid: number): number | undefined {
  const pidString: string = pid.toString();
  if (pid < 0 || pidString.indexOf('e') >= 0 || pidString.indexOf('E') >= 0) {
    return undefined;
  }
  let args: string[];
  if (process.platform === 'darwin') {
    args = [`-p ${pidString}`, '-o lstart'];
  } else if (process.platform === 'linux') {
    args = ['-p', pidString, '-o', 'lstart'];
  } else {
    return undefined;
  }

  // "ps -o lstart" formats the time using the time zone and locale of the "ps" process
  const psResult: child_process.SpawnSyncReturns<string> = child_process.spawnSync('ps', args, {
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C', TZ: 'UTC0' }
  });

  return _parseLstartAsUtcMs((psResult.stdout || '').split('\n')[1] || '');
}

/**
 * Parses a start time that "ps -o lstart" printed with the C locale, for example "Sun Sep 27 17:15:08 2026",
 * as if it were in UTC.  Returns the time in milliseconds since the epoch, or undefined if the text has another
 * format, such as the format of another locale.
 */
function _parseLstartAsUtcMs(lstart: string): number | undefined {
  const match: RegExpExecArray | null =
    /^\s*[A-Za-z]{3} ([A-Za-z]{3}) +(\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})\s*$/.exec(lstart);
  if (!match) {
    return undefined;
  }
  const month: number = LSTART_MONTHS.indexOf(match[1]);
  if (month < 0) {
    return undefined;
  }
  return Date.UTC(
    Number(match[6]),
    month,
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
    Number(match[5])
  );
}

const LSTART_DAYS: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// The number of clock ticks per second in /proc/[pid]/stat.  This is sysconf(_SC_CLK_TCK), which Linux fixes
// at 100 (USER_HZ) on every architecture that Node.js supports.
const LINUX_CLOCK_TICKS_PER_SECOND: number = 100;

/**
 * Helper function that is exported for unit tests only.
 * Linux only: returns the time when the system booted, in seconds since the epoch, from the "btime" line of
 * /proc/stat.  "ps -o lstart" adds the start time of a process to this time.
 */
export function getLinuxBootTimeSeconds(): number {
  const match: RegExpExecArray | null = /^btime (\d+)$/m.exec(FileSystem.readFile('/proc/stat'));
  if (!match) {
    throw new Error('The contents of /proc/stat have an unexpected format');
  }
  return Number(match[1]);
}

/**
 * The start time of a Linux process, in the formats that getProcessStartTime() returns.
 */
export interface ILinuxProcessStartTime {
  /**
   * What "ps -o lstart" prints with the C locale and the current time zone, for example "Mon Sep 28 13:52:39 2026"
   */
  lstart: string;
  /**
   * The start time in clock ticks after boot, from /proc/[pid]/stat.  getProcessStartTime() returns this if
   * "ps" can't be run.
   */
  ticks: string;
  /**
   * The start time in milliseconds since the epoch, rounded down to a whole second like lstart.  This is what
   * getProcessStartTimeMs() returns, and it doesn't depend on the time zone.
   */
  startTimeMs: number;
}

/**
 * Helper function that is exported for unit tests only.
 * Linux only: returns the start time of a process from /proc, without running "ps" like getProcessStartTime()
 * does.  Returns undefined if the process doesn't exist with that pid.  Throws if /proc can't be read for another
 * reason, or if it has an unexpected format.
 * @param pid - The process ID
 * @param getBootTimeSeconds - Returns what getLinuxBootTimeSeconds() returns
 */
export function getLinuxProcessStartTime(
  pid: number,
  getBootTimeSeconds: () => number
): ILinuxProcessStartTime | undefined {
  const pidString: string = pid.toString();
  if (pid < 0 || pidString.indexOf('e') >= 0 || pidString.indexOf('E') >= 0) {
    throw new Error(`"pid" is negative or too large`);
  }
  let stat: string;
  try {
    stat = FileSystem.readFile(`/proc/${pidString}/stat`);
  } catch (error) {
    // ESRCH means that the process exited while we were reading the file.
    if (FileSystem.isNotExistError(error as Error) || (error as NodeJS.ErrnoException).code === 'ESRCH') {
      return undefined;
    }
    throw error;
  }
  const ticks: string | undefined = getProcessStartTimeFromProcStat(stat);
  if (ticks === undefined || !/^[0-9]+$/.test(ticks)) {
    throw new Error(`The contents of /proc/${pidString}/stat have an unexpected format`);
  }

  // Like "ps", round down to a whole second and use "%a %b %e %H:%M:%S %Y" in the local time zone.
  const startTimeMs: number =
    (getBootTimeSeconds() + Math.floor(Number(ticks) / LINUX_CLOCK_TICKS_PER_SECOND)) * 1000;
  const date: Date = new Date(startTimeMs);
  const twoDigits: (value: number) => string = (value: number) => (value < 10 ? `0${value}` : `${value}`);
  const lstart: string =
    `${LSTART_DAYS[date.getDay()]} ${LSTART_MONTHS[date.getMonth()]} ` +
    `${date.getDate() < 10 ? ' ' : ''}${date.getDate()} ` +
    `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}:${twoDigits(date.getSeconds())} ` +
    `${date.getFullYear()}`;
  return { lstart, ticks, startTimeMs };
}

// A set of locks that currently exist in the current process, to be used when
// multiple locks are acquired in the same process.
const IN_PROC_LOCKS: Set<string> = new Set<string>();

// The function used to determine a process's start time.  Overridable for unit testing.
let _getStartTime: (pid: number) => string | undefined = getProcessStartTime;

// On Linux, what _getStartTime() returned for the current process, and what getLinuxProcessStartTime()
// returned for it at the same time.  See _getCurrentProcessStartTime().
let _currentProcessStartTime: { startTime: string; linuxLstart: string } | undefined;

/**
 * For unit testing only: overrides the function used to determine a process's start time.
 * @internal
 */
export function _setLockFileGetProcessStartTime(fn: (pid: number) => string | undefined): void {
  _getStartTime = fn;
  _currentProcessStartTime = undefined;
}

/**
 * Returns the start time of the current process, which its lockfiles contain.  On Linux, this runs "ps" again only
 * if the start time that /proc gives changes, which happens when the system clock is set or process.env.TZ
 * changes.  A process that acquires locks often would otherwise run "ps" each time, which is slow when there are
 * many processes.
 */
function _getCurrentProcessStartTime(getLinuxBootTime: () => number): string | undefined {
  let linuxLstart: string | undefined;
  if (process.platform === 'linux') {
    try {
      linuxLstart = getLinuxProcessStartTime(process.pid, getLinuxBootTime)?.lstart;
    } catch (error) {
      // /proc can't be read, so run "ps" every time.
    }
  }
  if (linuxLstart !== undefined && _currentProcessStartTime?.linuxLstart === linuxLstart) {
    return _currentProcessStartTime.startTime;
  }
  const startTime: string | undefined = _getStartTime(process.pid);
  _currentProcessStartTime =
    startTime !== undefined && linuxLstart !== undefined ? { startTime, linuxLstart } : undefined;
  return startTime;
}

/**
 * Platform-specific ownership of an acquired lock.
 * @internal
 */
export interface ILockFileHandle {
  prepareForRelease?(deleteFile: boolean): void;
  close(): void;
}

/**
 * A successful acquisition transfers ownership of the handle to LockFile.
 * @internal
 */
export interface ITryAcquireResult {
  readonly fileWriter: ILockFileHandle;
  readonly filePath: string;
  readonly dirtyWhenAcquired: boolean;
}

/**
 * The `LockFile` implements a file-based mutex for synchronizing access to a shared resource
 * between multiple Node.js processes.  It is not recommended for synchronization solely within
 * a single Node.js process.
 * @remarks
 * The implementation works on Windows, Mac, and Linux without requiring any native helpers.
 * Windows uses native exclusive file sharing and a `.dirty` companion to retain interrupted-owner
 * state across close/delete handoffs. A clean release removes the companion before relinquishing ownership.
 * On non-Windows systems, the algorithm requires access to the `ps` shell command.  On Linux,
 * it requires access the `/proc/${pidString}/stat` filesystem.
 * @public
 */
export class LockFile {
  private _fileWriter: ILockFileHandle | undefined;
  private _filePath: string;
  private _dirtyWhenAcquired: boolean;

  private constructor(fileWriter: ILockFileHandle, filePath: string, dirtyWhenAcquired: boolean) {
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
   * Returns all paths used to manage this process's lock, including platform-specific companion files.
   * Use these paths when excluding an active lock from folder cleanup; do not remove them while
   * the lock is held.
   * @param resourceFolder - The folder where the lock files will be created
   * @param resourceName - The resource name accepted by {@link LockFile.getLockFilePath}
   * @param pid - The PID used by the locking algorithm; defaults to `process.pid`
   */
  public static getLockFilePaths(
    resourceFolder: string,
    resourceName: string,
    pid: number = process.pid
  ): ReadonlyArray<string> {
    const filePath: string = LockFile.getLockFilePath(resourceFolder, resourceName, pid);
    return process.platform === 'win32' ? [filePath, getWindowsLockFileDirtyPath(filePath)] : [filePath];
  }

  /**
   * Attempts to create a lockfile with the given filePath.
   * @param resourceFolder - The folder where the lock file will be created
   * @param resourceName - An alphanumeric name that describes the resource being locked.  This will become
   *   the filename of the temporary file created to manage the lock.
   * @returns If successful, returns a `LockFile` instance.  If unable to get a lock, returns `undefined`.
   * This includes Windows volumes that do not enforce exclusive sharing. Unexpected filesystem errors throw.
   */
  public static tryAcquire(resourceFolder: string, resourceName: string): LockFile | undefined {
    FileSystem.ensureFolder(resourceFolder);
    const lockFilePath: string = LockFile.getLockFilePath(resourceFolder, resourceName);
    const result: ITryAcquireResult | undefined = _tryAcquireInner(
      resourceFolder,
      resourceName,
      lockFilePath
    );
    return result && new LockFile(result.fileWriter, result.filePath, result.dirtyWhenAcquired);
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
      const result: ITryAcquireResult | undefined = _tryAcquireInner(
        resourceFolder,
        resourceName,
        lockFilePath
      );
      if (result) {
        return new LockFile(result.fileWriter, result.filePath, result.dirtyWhenAcquired);
      }

      await Async.sleepAsync(interval);
    }

    throw new Error(`Exceeded maximum wait time to acquire lock for resource "${resourceName}"`);
  }

  /**
   * Unlocks a file and optionally removes it from disk.
   * This can only be called once.
   * @remarks
   * If release preparation fails, the handle is still closed and recovery files are retained.
   * If closing fails, ownership is uncertain and {@link LockFile.isReleased} remains false.
   *
   * @param deleteFile - Whether to delete the lockfile from disk. Defaults to true.
   */
  public release(deleteFile: boolean = true): void {
    const fileWriter: ILockFileHandle | undefined = this._fileWriter;
    if (!fileWriter) {
      throw new Error(`The lock for file "${path.basename(this._filePath)}" has already been released.`);
    }

    const errors: unknown[] = [];
    try {
      fileWriter.prepareForRelease?.(deleteFile);
    } catch (error) {
      errors.push(error);
    }
    try {
      fileWriter.close();
    } catch (error) {
      // A failed close does not prove ownership was relinquished. Retain the handle and in-process guard.
      errors.push(error);
      if (errors.length === 1) throw error;
      throw new AggregateError(errors, `Failed to release the lock for file "${this._filePath}".`);
    }
    this._fileWriter = undefined;
    IN_PROC_LOCKS.delete(this._filePath);
    // Leave the backing files intact after failed preparation so the next owner recovers dirty state.
    if (errors.length > 0) throw errors[0];
    if (deleteFile) {
      try {
        FileSystem.deleteFile(this._filePath, { throwIfNotExists: false });
      } catch (error) {
        // A new Windows owner may acquire the file between close and unlink. Never remove its lock.
        if (
          process.platform !== 'win32' ||
          typeof error !== 'object' ||
          error === null ||
          !('code' in error) ||
          error.code !== 'EBUSY'
        )
          throw error;
      }
    }
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
   * Returns true if this lock has been released.
   */
  public get isReleased(): boolean {
    return this._fileWriter === undefined;
  }
}

function _tryAcquireInner(
  resourceFolder: string,
  resourceName: string,
  lockFilePath: string
): ITryAcquireResult | undefined {
  if (!IN_PROC_LOCKS.has(lockFilePath)) {
    switch (process.platform) {
      case 'win32': {
        return tryAcquireWindowsLockFile(lockFilePath);
      }

      case 'linux':
      case 'darwin': {
        return _tryAcquireMacOrLinux(resourceFolder, resourceName, lockFilePath);
      }

      default: {
        throw new Error(`File locking not implemented for platform: "${process.platform}"`);
      }
    }
  }
}

// How much later than a lockfile's birthtime its process may appear to have started.  "ps" reports whole
// seconds, and the system clock can be adjusted while a process runs.
const START_TIME_TOLERANCE_MS: number = 5000;

// Every time zone is ahead of or behind UTC by a whole number of 15-minute steps, from UTC-12 to UTC+14.
const TIME_ZONE_OFFSET_STEP_MS: number = 15 * 60 * 1000;
const MIN_TIME_ZONE_OFFSET_MS: number = -12 * 60 * 60 * 1000;
const MAX_TIME_ZONE_OFFSET_MS: number = 14 * 60 * 60 * 1000;

/**
 * Returns false if the start time in a lockfile can't be what "ps -o lstart" printed for a process that started
 * at `startTimeMs`, in any time zone.  Returns true if it can, or if the start time is in a format other than the
 * C locale's, which can't be checked.
 *
 * On Linux, the start time that "ps" reports for a process moves with the system clock.  So if the clock is
 * changed by more than START_TIME_TOLERANCE_MS while a process holds a lock, this can return false for the
 * lockfile of that process, which is then treated as stale.
 *
 * A custom POSIX TZ string can set an offset that no time zone has, such as TZ=XYZ-5:07.  This returns false
 * for a start time written with such an offset, so a process with another time zone treats that lockfile as
 * stale.
 */
function _isStartTimeInSomeTimeZone(lockFileStartTime: string, startTimeMs: number): boolean {
  const lockFileStartTimeMs: number | undefined = _parseLstartAsUtcMs(lockFileStartTime);
  if (lockFileStartTimeMs === undefined) {
    return true;
  }
  const offsetMs: number = lockFileStartTimeMs - startTimeMs;
  if (
    offsetMs < MIN_TIME_ZONE_OFFSET_MS - START_TIME_TOLERANCE_MS ||
    offsetMs > MAX_TIME_ZONE_OFFSET_MS + START_TIME_TOLERANCE_MS
  ) {
    return false;
  }
  const stepOffsetMs: number = Math.round(offsetMs / TIME_ZONE_OFFSET_STEP_MS) * TIME_ZONE_OFFSET_STEP_MS;
  return Math.abs(offsetMs - stepOffsetMs) <= START_TIME_TOLERANCE_MS;
}

/**
 * Called when the start time in the lockfile of another running process differs from the start time that
 * we got for its PID.  Returns true if the lockfile still belongs to that process.
 */
function _isLockFileOfRunningProcess(
  pid: string,
  lockFileStartTime: string | undefined,
  lockFileBirthtimeMs: number | undefined
): boolean {
  // "ps -o lstart" formats the start time using the time zone and locale of the process that runs it,
  // so a process whose TZ, LANG, LC_TIME or LC_ALL differs from ours wrote its start time differently.
  // If the start time differs because the lockfile's process exited and the OS gave its PID to a new
  // process, then the new process usually started after the lockfile was created.  It can have started
  // before, if the lockfile was copied or restored, or if a process in another PID namespace (such as a
  // container) wrote it.  So the lockfile must also hold the process's start time in some time zone.
  // An empty lockfile is still treated as stale here, as before.
  if (!lockFileStartTime || lockFileBirthtimeMs === undefined) {
    return false;
  }
  const startTimeMs: number | undefined = getProcessStartTimeMs(parseInt(pid, 10));
  return (
    startTimeMs !== undefined &&
    startTimeMs <= lockFileBirthtimeMs + START_TIME_TOLERANCE_MS &&
    _isStartTimeInSomeTimeZone(lockFileStartTime, startTimeMs)
  );
}

/**
 * What /proc shows about the process that wrote the lockfile of another process.  See
 * _getLinuxLockFileProcessState().
 */
type LinuxLockFileProcessState = 'running' | 'exited' | 'unknown';

/**
 * Uses /proc to tell whether the lockfile of another process belongs to the running process with its PID.  This
 * is much faster than running "ps", which reads the files of every process in /proc.
 * @returns `running` if it does.  `exited` if /proc has no process with that PID, while it has the current
 * process: "ps" reads the same /proc, so it wouldn't find a process with that PID either.  `unknown` if the start
 * time in the lockfile is different, if /proc can't tell, or if this isn't Linux.  Then the caller must run "ps",
 * so this never makes the lockfile of a running process stale.
 */
function _getLinuxLockFileProcessState(
  pid: string,
  lockFileStartTime: string | undefined,
  lockFileBirthtimeMs: number | undefined,
  getBootTimeSeconds: () => number
): LinuxLockFileProcessState {
  if (process.platform !== 'linux') {
    return 'unknown';
  }
  let startTime: ILinuxProcessStartTime | undefined;
  try {
    startTime = getLinuxProcessStartTime(parseInt(pid, 10), getBootTimeSeconds);
  } catch (error) {
    // For example, /proc isn't mounted, or it doesn't let us read the files of this process.
    return 'unknown';
  }
  if (startTime === undefined) {
    return _isCurrentProcessInLinuxProc(getBootTimeSeconds) ? 'exited' : 'unknown';
  }
  if (!lockFileStartTime) {
    return 'unknown';
  }
  // These are the formats that getProcessStartTime() returns.
  if (lockFileStartTime === startTime.lstart || lockFileStartTime === startTime.ticks) {
    return 'running';
  }
  // The other process may have written its start time with another time zone or locale.  This is the check
  // that _isLockFileOfRunningProcess() makes after running "ps" twice, with the start time from /proc.
  if (
    lockFileBirthtimeMs !== undefined &&
    startTime.startTimeMs <= lockFileBirthtimeMs + START_TIME_TOLERANCE_MS &&
    _isStartTimeInSomeTimeZone(lockFileStartTime, startTime.startTimeMs)
  ) {
    return 'running';
  }
  return 'unknown';
}

/**
 * Returns true if /proc has the current process under its PID.  Otherwise, for example if /proc isn't mounted,
 * a PID that /proc doesn't have may still belong to a running process.
 */
function _isCurrentProcessInLinuxProc(getBootTimeSeconds: () => number): boolean {
  try {
    return getLinuxProcessStartTime(process.pid, getBootTimeSeconds) !== undefined;
  } catch (error) {
    return false;
  }
}

// Returned by _tryAcquireMacOrLinuxOnce() when the lockfile of another process has the same birthtime as ours.
const TIED: unique symbol = Symbol('tied');
// The maximum number of attempts that _tryAcquireMacOrLinux() makes while lockfiles keep tying.
const MAX_TIED_ATTEMPTS: number = 4;
// After a tie, the next attempt waits a random time of up to this many milliseconds times the attempt number.
const TIE_RETRY_DELAY_MS: number = 20;

/**
 * Attempts to acquire the lock on a Linux or OSX machine
 */
function _tryAcquireMacOrLinux(
  resourceFolder: string,
  resourceName: string,
  pidLockFilePath: string
): ITryAcquireResult | undefined {
  // On Linux, the time when the system booted, which we read from /proc/stat at most once per call
  let linuxBootTimeSeconds: number | undefined;
  const getLinuxBootTime: () => number = () => {
    if (linuxBootTimeSeconds === undefined) {
      linuxBootTimeSeconds = getLinuxBootTimeSeconds();
    }
    return linuxBootTimeSeconds;
  };

  // Suppose that a process terminates unexpectedly without deleting its PID-based lockfile,
  // then we check to see if the process is still alive.  The OS may have given the same PID
  // to a new process, how to detect that?  We will rely on getProcessStartTime() which
  // is stored in the file itself for comparison.
  const startTime: string | undefined = _getCurrentProcessStartTime(getLinuxBootTime);

  if (!startTime) {
    throw new Error(`Unable to calculate start time for current process.`);
  }

  for (let attempt: number = 1; ; attempt++) {
    const result: ITryAcquireResult | typeof TIED | undefined = _tryAcquireMacOrLinuxOnce(
      resourceFolder,
      resourceName,
      pidLockFilePath,
      startTime,
      getLinuxBootTime
    );
    if (result !== TIED) {
      return result;
    }
    if (attempt >= MAX_TIED_ATTEMPTS) {
      return undefined;
    }
    // If the other process also saw the tie, neither of us has the lock.  Wait a random time so that
    // our next lockfile is unlikely to tie again, and try again.
    const delayMs: number = 1 + Math.floor(Math.random() * TIE_RETRY_DELAY_MS * attempt);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
  }
}

/**
 * Makes one attempt to acquire the lock on a Linux or OSX machine
 */
function _tryAcquireMacOrLinuxOnce(
  resourceFolder: string,
  resourceName: string,
  pidLockFilePath: string,
  startTime: string,
  getLinuxBootTime: () => number
): ITryAcquireResult | typeof TIED | undefined {
  // get the current process identifier (PID)
  const pid: number = process.pid;

  let lockFileHandle: FileWriter | undefined;

  let result: ITryAcquireResult | undefined;

  try {
    // open in write mode since if this file exists, it cannot be from the current process
    // TODO: This will malfunction if the same process tries to acquire two locks on the same file.
    // We should ideally maintain a dictionary of normalized acquired filenames
    lockFileHandle = FileWriter.open(pidLockFilePath);
    lockFileHandle.write(startTime);
    const currentBirthTimeMs: number = lockFileHandle.getStatistics().birthtime.getTime();

    // Set if another process has a lockfile with the same birthtime as ours
    let tied: boolean = false;

    // now, scan the directory for all lockfiles
    const files: string[] = FileSystem.readFolderItemNames(resourceFolder);

    // look for anything ending with # then numbers and ".lock"
    const lockFileRegExp: RegExp = /^(.+)#([0-9]+)\.lock$/;

    // If we are the process to acquire the lock, it becomes our responsibility to clean up these
    // stale files.  If there is at least 1 stale file, then the resource is assumed to be "dirty"
    // (for example, the previous process was interrupted before releasing or while acquiring).
    const staleFilesToDelete: string[] = [];

    let match: RegExpMatchArray | null;
    let otherPid: string;
    for (const fileInFolder of files) {
      if (
        (match = fileInFolder.match(lockFileRegExp)) &&
        match[1] === resourceName &&
        (otherPid = match[2]) !== pid.toString()
      ) {
        // We found at least one lockfile hanging around that isn't ours
        const fileInFolderPath: string = `${resourceFolder}/${fileInFolder}`;

        // console.log(`FOUND OTHER LOCKFILE: ${otherPid}`);

        // The start time from the file, which we will compare with otherPidCurrentStartTime
        // to determine whether the PID got reused by a new process.
        let otherPidOldStartTime: string | undefined;
        let otherBirthtimeMs: number | undefined;
        try {
          otherPidOldStartTime = FileSystem.readFile(fileInFolderPath);
          // check the timestamp of the file
          otherBirthtimeMs = FileSystem.getStatistics(fileInFolderPath).birthtime.getTime();
        } catch (error) {
          if (FileSystem.isNotExistError(error)) {
            // ==> Properly closed lockfile, safe to ignore:
            // The other process deleted the file, which we assume means it completed successfully,
            // so the state is not dirty.  This is equivalent to if readFolderItemNames() never saw
            // the file in the firstplace.
            continue;
          }
        }

        // What the other process's file exists, but it is an empty file?
        // Either they were terminated while acquiring, or else they haven't finished writing it yet.
        if (otherBirthtimeMs !== undefined && otherPidOldStartTime === '') {
          if (otherBirthtimeMs > currentBirthTimeMs) {
            // ==> Safe to ignore
            // If the other process was terminated, it happened before they finished acquiring.
            // If the other process is alive, their file is newer, so we will acquire instead of them.

            // console.log(`Ignoring lock for pid ${otherPid} because its lockfile is newer than ours.`);
            continue;
          } else if (otherBirthtimeMs === currentBirthTimeMs) {
            // ==> Tie
            // The other process's file has the same birthtime as ours, and they may acquire the lock
            // after they finish writing the contents, so we must not treat this file as stale below.
            // See the comment about ties below.
            tied = true;
            continue;
          } else if (
            otherBirthtimeMs - currentBirthTimeMs < 0 &&
            otherBirthtimeMs - currentBirthTimeMs > -1000
          ) {
            // ==> Race condition
            // The other process created their file first, so they will probably acquire the lock
            // after they finish writing the contents.  But what if their process is actually dead
            // and replaced by a new process with the same PID?  Normally the otherPidOldStartTime
            // gives the answer, but in this edge case we are missing that information.
            // So we conservatively assume that it should not take them more than 1000ms to
            // open a file, write a PID, and close the file.
            return undefined; // fail to acquire and retry later
          }
        }

        // console.log(`Other pid ${otherPid} lockfile has start time: "${otherPidOldStartTime}"`);

        // Actual start time of the other PID.  On Linux, /proc usually shows that the file belongs to the
        // process with that PID, even if that process has another time zone or locale, or that no process has
        // that PID, and then we don't need to run "ps", which is slow when there are many processes.  When many
        // processes wait for the same lock, each of their attempts checks the file of every other process, and
        // a process that exits without releasing its lock leaves its file for the next process to check.
        let otherPidCurrentStartTime: string | undefined;
        switch (
          _getLinuxLockFileProcessState(otherPid, otherPidOldStartTime, otherBirthtimeMs, getLinuxBootTime)
        ) {
          case 'running': {
            otherPidCurrentStartTime = otherPidOldStartTime;
            break;
          }
          case 'exited': {
            otherPidCurrentStartTime = undefined;
            break;
          }
          default: {
            otherPidCurrentStartTime = _getStartTime(parseInt(otherPid, 10));
            break;
          }
        }

        // console.log(`Other pid ${otherPid} actually has start time: "${otherPidCurrentStartTime}"`);

        // Time to compare
        if (
          !otherPidCurrentStartTime ||
          (otherPidOldStartTime !== otherPidCurrentStartTime &&
            !_isLockFileOfRunningProcess(otherPid, otherPidOldStartTime, otherBirthtimeMs))
        ) {
          // ==> Stale lockfile
          // This file doesn't prevent us from acquiring the lock, but it does indicate that
          // the resource was left in a dirty state.  (If we delete the file right now, that
          // information would be lost, so we clean up later when we acquire successfully.)

          // console.log(`Other pid ${otherPid} is no longer executing!`);

          // We checked the other process after we read its file.  If the file is gone now, the other process
          // released the lock in between, so the resource isn't dirty.
          if (!FileSystem.exists(fileInFolderPath)) {
            continue;
          }
          staleFilesToDelete.push(fileInFolderPath);
          continue;
        }

        // console.log(`Pid ${otherPid} lockfile has birth time: ${otherBirthtimeMs}`);
        // console.log(`Pid ${pid} lockfile has birth time: ${currentBirthTimeMs}`);

        if (otherBirthtimeMs !== undefined) {
          // ==> We found a valid file belonging to another process.
          // With multiple parties trying to acquire, the winner is the one with the earliest file.
          if (otherBirthtimeMs < currentBirthTimeMs) {
            // we do not have the lock
            return undefined;
          }

          if (otherBirthtimeMs === currentBirthTimeMs) {
            // ==> Tie
            // Birthtimes have millisecond precision (often coarser), so files created at about the
            // same time can have equal birthtimes.  We read the folder only once, so the other process
            // may have read it before our file existed and concluded that it holds the lock.  Breaking
            // the tie by PID could then let both processes acquire the lock.  Instead, a tie means that
            // neither process acquires the lock in this attempt.  At least one of the two processes
            // sees the other's file, so at most one of them acquires the lock.
            tied = true;
          }
        }
      }
    }

    if (tied) {
      // we do not have the lock, but we may acquire it if we try again with a new file
      return TIED;
    }

    let dirtyWhenAcquired: boolean = false;
    for (const staleFileToDelete of staleFilesToDelete) {
      FileSystem.deleteFile(staleFileToDelete, { throwIfNotExists: false });
      dirtyWhenAcquired = true;
    }

    // We have the lock!
    result = { fileWriter: lockFileHandle, filePath: pidLockFilePath, dirtyWhenAcquired };
    lockFileHandle = undefined; // The returned result has taken ownership of our handle
  } finally {
    if (lockFileHandle) {
      // ensure our lock is closed
      lockFileHandle.close();
      FileSystem.deleteFile(pidLockFilePath);
    }
  }
  return result;
}
