import * as fsx from 'fs-extra';

/**
 * Represents the current state of a lock file
 * @public
 */
export enum LockFileState {
  /**
   * Successfully created a lock and no previous lockfile existed before.
   * The resource being locked should be in a clean state.
   */
  Clean = 1,
  /**
   * Successfully created a lock, but a previous lockfile existed before.
   * The resource being locked may be corrupted.
   */
  Dirty = 2
}

/**
 * A helper utility for working with file-based locks.
 * This class should only be used for locking resources across processes,
 * but should not be used for attempting to lock a resource in the same process.
 * @public
 */
export class LockFile {
  /**
   * Attempts to create a lockfile with the given filename.
   * If successful, returns a LockFile instance.
   * If unable to get a lock, returns undefined.
   * @param filename - the filename of the lockfile.
   */
  public static lock(filename: string): LockFile | undefined {
    let state: LockFileState;

    if (fsx.existsSync(filename)) {
      // If the lockfile is held by an process with an exclusive lock, then removing it will
      // silently fail. OpenSync() below will then fail and we will be unable to create a lock.

      // Otherwise, the lockfile is sitting on disk, but nothing is holding it, implying that
      // the last process to hold it died.
      state = LockFileState.Dirty;
      fsx.removeSync(filename);
    } else {
      state = LockFileState.Clean;
    }

    let fileDescriptor: number;
    try {
      // Attempt to open an exclusive lockfile
      fileDescriptor = fsx.openSync(filename, 'wx');
    } catch (error) {
      // we tried to delete the lock, but something else is holding it,
      // (probably an active process), therefore we are unable to create a lock
      return undefined;
    }

    return new LockFile(fileDescriptor, state);
  }

  public unlock(): void {
    if (this.isLocked) {
      fsx.closeSync(this._fileDescriptor!);
      this._fileDescriptor = undefined;
    }
  }

  public get state(): LockFileState {
    return this._state;
  }

  public set state(state: LockFileState) {
    this._state = state;
  }

  public get isLocked(): boolean {
    return this._fileDescriptor !== undefined;
  }

  private constructor(
    private _fileDescriptor: number | undefined,
    private _state: LockFileState) {
  }
}