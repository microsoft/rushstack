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
  /**
   * Attempts to create a lockfile with the given filePath.
   * If successful, returns a LockFile instance.
   * If unable to get a lock, returns undefined.
   * @param filePath - the filePath of the lockfile.
   */
  public static tryAcquire(filePath: string): LockFile | undefined {
    let dirtyWhenAcquired: boolean = false;

    // resolve the filepath in case the cwd is changed during process execution
    filePath = path.resolve(filePath);

    if (fsx.existsSync(filePath)) {

      dirtyWhenAcquired = true;

      if (process.platform === 'win32') {
        // If the lockfile is held by an process with an exclusive lock, then removing it will
        // silently fail. OpenSync() below will then fail and we will be unable to create a lock.

        // Otherwise, the lockfile is sitting on disk, but nothing is holding it, implying that
        // the last process to hold it died.
      } else if (process.platform === 'darwin' || process.platform === 'linux') {
        // we need to compare the process ID and start time in the lockfile
        // to the result of the ps command

        const contents: string = fsx.readFileSync(filePath).toString();
        const [pid, startTime]: string[] = contents.split(';');

        if (!!pid && !!startTime) {
          const oldStartTime: string | undefined = getProcessStartTime(parseInt(pid, 10));
          // the process that created this lock is still running!
          if (oldStartTime === startTime) {
            return undefined;
          }
        }
      } else {
        throw new Error(`Unsupported operating system: ${process.platform}`);
      }

      // If we get here it is safe to unlink the lockfile
      fsx.unlinkSync(filePath);
    }

    let fileDescriptor: number | undefined;
    try {
      // Attempt to open an exclusive lockfile
      fileDescriptor = fsx.openSync(filePath, 'wx');
    } catch (error) {
      // we tried to delete the lock, but something else is holding it,
      // (probably an active process), therefore we are unable to create a lock
      return undefined;
    }

    let lockFile: LockFile;
    try {
      if (process.platform === 'darwin' || process.platform === 'linux') {
        const startTime: string | undefined = getProcessStartTime(process.pid);
        if (startTime === undefined) {
          // we were unable to get the current pid
          throw new Error(`Unable to determine current process' start time`);
        }

        try {
          fsx.writeSync(fileDescriptor, `${process.pid};${startTime}`);
        } catch (error) {
          throw new Error(`Unable to write process pid and start time to lockfile!`);
        }
      }

      lockFile = new LockFile(fileDescriptor, filePath, dirtyWhenAcquired);
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