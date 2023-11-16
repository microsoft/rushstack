// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'fs';
import * as path from 'path';

import type { FileSystemAdapter } from 'fast-glob';
import Watchpack from 'watchpack';

interface IReaddirOptions {
  withFileTypes: true;
}

/* eslint-disable @rushstack/no-new-null */
type StatCallback = (error: NodeJS.ErrnoException | null, stats: fs.Stats) => void;
type ReaddirStringCallback = (error: NodeJS.ErrnoException | null, files: string[]) => void;
type ReaddirDirentCallback = (error: NodeJS.ErrnoException | null, files: fs.Dirent[]) => void;
/* eslint-enable @rushstack/no-new-null */

/**
 * Information about the state of a watched file.
 * @public
 */
export interface IWatchedFileState {
  /**
   * If the file has changed since the last invocation.
   */
  changed: boolean;
}

/**
 * Interface contract for `WatchFileSystemAdapter` for cross-version compatibility
 */
export interface IWatchFileSystemAdapter extends FileSystemAdapter {
  /**
   * Prepares for incoming glob requests. Any file changed after this method is called
   * will trigger teh watch callback in the next invocation.
   * File mtimes will be recorded at this time for any files that do not receive explicit
   * stat() or lstat() calls.
   */
  setBaseline(): void;
  /**
   * Watches all files that have been accessed since `prepare()` was called.
   * Clears the tracked file lists.
   */
  watch(onChange: () => void): void;
  /**
   * Tells the adapter to track the specified file (or folder) as used.
   * Returns an object containing data about the state of said file (or folder).
   */
  getStateAndTrackAsync(filePath: string): Promise<IWatchedFileState>;
}

interface ITimeEntry {
  timestamp: number;
  safeTime: number;
}

/**
 * A filesystem adapter for use with the "fast-glob" package. This adapter tracks file system accesses
 * to initialize `watchpack`.
 */
export class WatchFileSystemAdapter implements IWatchFileSystemAdapter {
  private _files: Map<string, number> = new Map();
  private _contexts: Map<string, number> = new Map();
  private _missing: Map<string, number> = new Map();

  private _watcher: Watchpack | undefined;

  private _lastFiles: Map<string, number> | undefined;
  private _lastQueryTime: number | undefined;
  private _times: Map<string, ITimeEntry> | undefined;

  /** { @inheritdoc fs.readdirSync } */
  public readdirSync: FileSystemAdapter['readdirSync'] = ((filePath: string, options?: IReaddirOptions) => {
    filePath = path.normalize(filePath);

    try {
      if (options?.withFileTypes) {
        const results: fs.Dirent[] = fs.readdirSync(filePath, options);
        this._contexts.set(filePath, Date.now());
        return results;
      } else {
        const results: string[] = fs.readdirSync(filePath);
        this._contexts.set(filePath, Date.now());
        return results;
      }
    } catch (err) {
      this._missing.set(filePath, Date.now());
      throw err;
    }
  }) as FileSystemAdapter['readdirSync'];

  /** { @inheritdoc fs.readdir } */
  public readdir: FileSystemAdapter['readdir'] = (
    filePath: string,
    optionsOrCallback: IReaddirOptions | ReaddirStringCallback,
    callback?: ReaddirDirentCallback | ReaddirStringCallback
  ) => {
    filePath = path.normalize(filePath);
    // Default to no options, which will return a string callback
    let options: IReaddirOptions | undefined;
    if (typeof optionsOrCallback === 'object') {
      options = optionsOrCallback;
    } else if (typeof optionsOrCallback === 'function') {
      callback = optionsOrCallback;
    }

    if (options?.withFileTypes) {
      fs.readdir(filePath, options, (err: NodeJS.ErrnoException | null, entries: fs.Dirent[]) => {
        if (err) {
          this._missing.set(filePath, Date.now());
        } else {
          this._contexts.set(filePath, Date.now());
        }
        (callback as ReaddirDirentCallback)(err, entries);
      });
    } else {
      fs.readdir(filePath, (err: NodeJS.ErrnoException | null, entries: string[]) => {
        if (err) {
          this._missing.set(filePath, Date.now());
        } else {
          this._contexts.set(filePath, Date.now());
        }
        (callback as ReaddirStringCallback)(err, entries);
      });
    }
  };

  /** { @inheritdoc fs.lstat } */
  public lstat: FileSystemAdapter['lstat'] = (filePath: string, callback: StatCallback): void => {
    filePath = path.normalize(filePath);
    fs.lstat(filePath, (err: NodeJS.ErrnoException | null, stats: fs.Stats) => {
      if (err) {
        this._missing.set(filePath, Date.now());
      } else {
        this._files.set(filePath, stats.mtime.getTime() || stats.ctime.getTime() || Date.now());
      }
      callback(err, stats);
    });
  };

  /** { @inheritdoc fs.lstatSync } */
  public lstatSync: FileSystemAdapter['lstatSync'] = (filePath: string): fs.Stats => {
    filePath = path.normalize(filePath);
    try {
      const stats: fs.Stats = fs.lstatSync(filePath);
      this._files.set(filePath, stats.mtime.getTime() || stats.ctime.getTime() || Date.now());
      return stats;
    } catch (err) {
      this._missing.set(filePath, Date.now());
      throw err;
    }
  };

  /** { @inheritdoc fs.stat } */
  public stat: FileSystemAdapter['stat'] = (filePath: string, callback: StatCallback): void => {
    filePath = path.normalize(filePath);
    fs.stat(filePath, (err: NodeJS.ErrnoException | null, stats: fs.Stats) => {
      if (err) {
        this._missing.set(filePath, Date.now());
      } else {
        this._files.set(filePath, stats.mtime.getTime() || stats.ctime.getTime() || Date.now());
      }
      callback(err, stats);
    });
  };

  /** { @inheritdoc fs.statSync } */
  public statSync: FileSystemAdapter['statSync'] = (filePath: string) => {
    filePath = path.normalize(filePath);
    try {
      const stats: fs.Stats = fs.statSync(filePath);
      this._files.set(filePath, stats.mtime.getTime() || stats.ctime.getTime() || Date.now());
      return stats;
    } catch (err) {
      this._missing.set(filePath, Date.now());
      throw err;
    }
  };

  /**
   * @inheritdoc
   */
  public setBaseline(): void {
    this._lastQueryTime = Date.now();

    if (this._watcher) {
      const times: Map<string, { timestamp: number; safeTime: number }> = new Map();
      this._watcher.pause();
      this._watcher.collectTimeInfoEntries(times, times);
      this._times = times;
    }
  }

  /**
   * @inheritdoc
   */
  public watch(onChange: () => void): void {
    if (this._files.size === 0 && this._contexts.size === 0 && this._missing.size === 0) {
      return;
    }

    const watcher: Watchpack = new Watchpack({
      aggregateTimeout: 0,
      followSymlinks: false
    });

    this._watcher = watcher;
    watcher.watch({
      files: this._files.keys(),
      directories: this._contexts.keys(),
      missing: this._missing.keys(),
      startTime: this._lastQueryTime
    });

    this._lastFiles = this._files;
    this._files = new Map();
    this._contexts.clear();
    this._missing.clear();

    watcher.once('aggregated', onChange);
  }

  /**
   * @inheritdoc
   */
  public async getStateAndTrackAsync(filePath: string): Promise<IWatchedFileState> {
    const normalizedSourcePath: string = path.normalize(filePath);
    const oldTime: number | undefined = this._lastFiles?.get(normalizedSourcePath);
    let newTimeEntry: ITimeEntry | undefined = this._times?.get(normalizedSourcePath);

    if (!newTimeEntry) {
      // Need to record a timestamp, otherwise first rerun will select everything
      try {
        const stats: fs.Stats = await fs.promises.lstat(normalizedSourcePath);
        const rounded: number = stats.mtime.getTime() || stats.ctime.getTime() || Date.now();
        newTimeEntry = {
          timestamp: rounded,
          safeTime: rounded
        };
      } catch (err) {
        this._missing.set(normalizedSourcePath, Date.now());
      }
    }

    const newTime: number | undefined =
      (newTimeEntry && (newTimeEntry.timestamp ?? newTimeEntry.safeTime)) || this._lastQueryTime;

    if (newTime) {
      this._files.set(normalizedSourcePath, newTime);
    }

    return {
      changed: newTime !== oldTime
    };
  }
}
