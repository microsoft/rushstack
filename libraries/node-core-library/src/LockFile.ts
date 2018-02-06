// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as path from 'path';
import * as child_process from 'child_process';

/**
 * Helper function that is exported for unit tests only.
 * Returns undefined if the process doesn't exist with that pid.
 */
export function getProcessStartTime(pid: number): string | undefined {
  let args: string[];
  if (process.platform === 'darwin') {
    args = [`-p ${pid.toString()}`, '-o lstart'];
  } else if (process.platform === 'linux') {
    args = ['-p', pid.toString(), '-o', 'lstart'];
  } else {
    throw new Error(`Unsupported system: ${process.platform}`);
  }

  const psResult: string = child_process.spawnSync('ps', args).stdout.toString();

  // there was an error executing psresult
  if (!psResult) {
    throw new Error(`Unexpected output from "ps" command`);
  }

  const psSplit: string[] = psResult.split('\n');

  // successfuly able to run "ps", but no process was found
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

/**
 * A helper utility for working with file-based locks.
 * This class should only be used for locking resources across processes,
 * but should not be used for attempting to lock a resource in the same process.
 * @public
 */
export class LockFile {
  private static _getStartTime: (pid: number) => string | undefined = getProcessStartTime;

  /**
   * Attempts to create a lockfile with the given filePath.
   * If successful, returns a LockFile instance.
   * If unable to get a lock, returns undefined.
   * @param filePath - the filePath of the lockfile.
   */
  public static tryAcquire(filePath: string): LockFile | undefined {
    // resolve the filepath in case the cwd is changed during process execution
    filePath = path.resolve(filePath);
    if (process.platform === 'win32') {
      return LockFile._tryAcquireWindows(filePath);
    } else if (process.platform === 'linux' || process.platform === 'darwin') {
      return LockFile._tryAcquireMacOrLinux(filePath);
    }
    throw new Error(`Unable to create lock file for platform: "${process.platform}"`);
  }

  /**
   * Attempts to acquire the lock on a Linux or OSX machine
   */
  private static _tryAcquireMacOrLinux(absoluteFilePath: string): LockFile | undefined {
    let dirtyWhenAcquired: boolean = false;

    // get the current process' pid
    const pid: number = process.pid;
    const startTime: string | undefined = LockFile._getStartTime(pid);

    if (!startTime) {
      throw new Error(`UNable to calcualte start time for current process.`);
    }

    const lockFileDir: string = path.dirname(absoluteFilePath);

    // create your own pid file
    const pidLockFilePath: string = `${absoluteFilePath}.${pid}`;
    let lockFileDescriptor: number | undefined;

    let lockFile: LockFile;

    try {
      // open in write mode since if this file exists, it cannot be from the current process
      // we are not handling the case where multiple lockfiles are opened in the same process
      lockFileDescriptor = fsx.openSync(pidLockFilePath, 'w');
      fsx.writeSync(lockFileDescriptor, startTime);

      const currentBirthTimeMs: number = fsx.statSync(pidLockFilePath).birthtime.getTime();

      let smallestBirthTimeMs: number = currentBirthTimeMs;
      let smallestBirthTimePid: string = pid.toString();

      // now, scan the directory for all lockfiles
      const files: string[] = fsx.readdirSync(lockFileDir);

      // escape anything in the filename that could confuse regex
      const escapedLockFilePattern: RegExp =
        new RegExp(path.basename(absoluteFilePath).replace(/[^\w\s]/g, '\\$&') + '\\.([0-9]+)$');

      let match: RegExpMatchArray | null;
      for (const fileInFolder of files) {
        if (match = fileInFolder.match(escapedLockFilePattern)) {

          const fileInFolderPath: string = path.join(lockFileDir, fileInFolder);

          // the pid of this process is in match[1]
          const otherPid: string = match[1];

          // we found at least one lockfile hanging around that isn't ours
          if (otherPid !== pid.toString()) {
            dirtyWhenAcquired = true;

            console.log(`FOUND OTHER LOCKFILE: ${otherPid}`);

            const otherPidCurrentStartTime: string | undefined = LockFile._getStartTime(parseInt(otherPid, 10));

            let otherPidOldStartTime: string | undefined;
            try {
              otherPidOldStartTime = fsx.readFileSync(fileInFolderPath).toString();
            } catch (err) {
              // this means the file is probably deleted already
            }

            // check the timestamp of the file
            const otherBirthtimeMs: number = fsx.statSync(fileInFolderPath).birthtime.getTime();

            // if the otherPidOldStartTime is invalid, then we should look at the timestamp,
            // if this file was created after us, ignore it
            // if it was created within 1 second before us, then it could be good, so we
            //  will conservatively fail
            // otherwise it is an old lock file and will be deleted
            if (otherPidOldStartTime === '') {
              if (otherBirthtimeMs > currentBirthTimeMs) {
                // ignore this file, he will be unable to get the lock since this process
                // will hold it
                console.log(`Ignoring lock for pid ${otherPid} because its lockfile is newer than ours.`);
                continue;
              } else if (otherBirthtimeMs - currentBirthTimeMs < 0        // it was created before us AND
                      && otherBirthtimeMs - currentBirthTimeMs > -1000) { // it was created less than a second before

                // conservatively be unable to keep the lock
                fsx.closeSync(lockFileDescriptor);
                fsx.removeSync(pidLockFilePath);
                lockFileDescriptor = undefined;
                return undefined;
              }
            }

            console.log(`Other pid ${otherPid} lockfile has start time: "${otherPidOldStartTime}"`);
            console.log(`Other pid ${otherPid} actually has start time: "${otherPidCurrentStartTime}"`);

            // this means the process is no longer executing, delete the file
            if (!otherPidCurrentStartTime || otherPidOldStartTime !== otherPidCurrentStartTime) {
              console.log(`Other pid ${otherPid} is no longer executing!`);
              fsx.removeSync(fileInFolderPath);
              continue;
            }

            console.log(`Pid ${otherPid} lockfile has birth time: ${otherBirthtimeMs}`);
            console.log(`Pid ${pid} lockfile has birth time: ${currentBirthTimeMs}`);
            // this is a lockfile pointing at something valid
            if (otherBirthtimeMs < smallestBirthTimeMs) {
              smallestBirthTimeMs = otherBirthtimeMs;
              smallestBirthTimePid = otherPid;
            }
          }
        }
      }

      if (smallestBirthTimePid !== pid.toString()) {
        // we do not have the lock
        fsx.closeSync(lockFileDescriptor);
        fsx.removeSync(pidLockFilePath);
        lockFileDescriptor = undefined;
        return undefined;
      }

      // we have the lock!
      lockFile = new LockFile(lockFileDescriptor, pidLockFilePath, dirtyWhenAcquired);
      lockFileDescriptor = undefined; // we have handed the descriptor off to the instance
    } finally {
      if (lockFileDescriptor) {
        // ensure our lock is closed
        fsx.closeSync(lockFileDescriptor);
        fsx.removeSync(pidLockFilePath);
      }
    }
    return lockFile;
  }

  /**
   * Attempts to acquire the lock using Windows
   * This algorithm is much simpler since we can rely on the operating system
   */
  private static _tryAcquireWindows(absoluteFilePath: string): LockFile | undefined {
    let dirtyWhenAcquired: boolean = false;

    if (fsx.existsSync(absoluteFilePath)) {
      dirtyWhenAcquired = true;

      // If the lockfile is held by an process with an exclusive lock, then removing it will
      // silently fail. OpenSync() below will then fail and we will be unable to create a lock.

      // Otherwise, the lockfile is sitting on disk, but nothing is holding it, implying that
      // the last process to hold it died.
      fsx.unlinkSync(absoluteFilePath);
    }

    let fileDescriptor: number | undefined;
    try {
      // Attempt to open an exclusive lockfile
      fileDescriptor = fsx.openSync(absoluteFilePath, 'wx');
    } catch (error) {
      // we tried to delete the lock, but something else is holding it,
      // (probably an active process), therefore we are unable to create a lock
      return undefined;
    }

    // Ensure we can hand off the file descriptor to the lockfile
    let lockFile: LockFile;
    try {
      lockFile = new LockFile(fileDescriptor, absoluteFilePath, dirtyWhenAcquired);
      fileDescriptor = undefined;
    } finally {
      if (fileDescriptor) {
        fsx.closeSync(fileDescriptor);
      }
    }

    return lockFile;
  }

  /**
   * Unlocks a file and removes it from disk.
   * This can only be called once.
   */
  public release(): void {
    if (this.isReleased) {
      throw new Error(`The lock for file "${path.basename(this._filePath)}" has already been released.`);
    }

    fsx.closeSync(this._fileDescriptor!);
    fsx.removeSync(this._filePath);
    this._fileDescriptor = undefined;
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
    return this._fileDescriptor === undefined;
  }

  private constructor(
    private _fileDescriptor: number | undefined,
    private _filePath: string,
    private _dirtyWhenAcquired: boolean) {
  }
}