// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import Watchpack from 'watchpack';

import { _tryGetWatchpackPendingEventState } from './WatchpackUtilities';

/**
 * Options for `fs.readdir`
 * @public
 */
export interface IReaddirOptions {
  /**
   * If true, readdir will return `fs.Dirent` objects instead of strings.
   */
  withFileTypes: true;
}

/* eslint-disable @rushstack/no-new-null */
/**
 * Callback for `fs.stat` and `fs.lstat`
 * @public
 */
export type StatCallback = (error: NodeJS.ErrnoException | null, stats: fs.Stats) => void;
/**
 * Callback for `fs.readdir` when `withFileTypes` is not specified or false
 * @public
 */
export type ReaddirStringCallback = (error: NodeJS.ErrnoException | null, files: string[]) => void;
/**
 * Callback for `fs.readdir` when `withFileTypes` is true
 * @public
 */
export type ReaddirDirentCallback = (error: NodeJS.ErrnoException | null, files: fs.Dirent[]) => void;
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
 * Interface contract for heft plugins to use the `WatchFileSystemAdapter`
 * @public
 */
export interface IWatchFileSystem {
  /**
   * Synchronous readdir. Watches the directory for changes.
   *
   * @see fs.readdirSync
   */
  readdirSync(filePath: string): string[];
  readdirSync(filePath: string, options: IReaddirOptions): fs.Dirent[];

  /**
   * Asynchronous readdir. Watches the directory for changes.
   *
   * @see fs.readdir
   */
  readdir(filePath: string, callback: ReaddirStringCallback): void;
  readdir(filePath: string, options: IReaddirOptions, callback: ReaddirDirentCallback): void;

  /**
   * Asynchronous lstat. Watches the file for changes, or if it does not exist, watches to see if it is created.
   * @see fs.lstat
   */
  lstat(filePath: string, callback: StatCallback): void;

  /**
   * Synchronous lstat. Watches the file for changes, or if it does not exist, watches to see if it is created.
   * @see fs.lstatSync
   */
  lstatSync(filePath: string): fs.Stats;

  /**
   * Asynchronous stat. Watches the file for changes, or if it does not exist, watches to see if it is created.
   * @see fs.stat
   */
  stat(filePath: string, callback: StatCallback): void;

  /**
   * Synchronous stat. Watches the file for changes, or if it does not exist, watches to see if it is created.
   * @see fs.statSync
   */
  statSync(filePath: string): fs.Stats;

  /**
   * Tells the adapter to track the specified file (or folder) as used.
   * Returns an object containing data about the state of said file (or folder).
   * Uses promise-based API.
   */
  getStateAndTrackAsync(filePath: string): Promise<IWatchedFileState>;

  /**
   * Tells the adapter to track the specified file (or folder) as used.
   * Returns an object containing data about the state of said file (or folder).
   * Uses synchronous API.
   */
  getStateAndTrack(filePath: string): IWatchedFileState;
}

/**
 * Interface contract for `WatchFileSystemAdapter` for cross-version compatibility
 */
export interface IWatchFileSystemAdapter extends IWatchFileSystem {
  /**
   * Prepares for incoming glob requests. Any file changed after this method is called
   * will trigger the watch callback in the next invocation.
   * File mtimes will be recorded at this time for any files that do not receive explicit
   * stat() or lstat() calls.
   */
  setBaseline(): void;
  /**
   * Watches all files that have been accessed since `prepare()` was called.
   * Clears the tracked file lists.
   */
  watch(onChange: () => void): void;
}

interface ITimeEntry {
  timestamp: number;
  safeTime: number;
}

/**
 * What a run read. The run's watcher checks the changes that it reports against this.
 */
interface IRunInputs {
  /**
   * When the run started. The watcher reports files whose times are close to this time, or later.
   */
  baseline: number | undefined;
  /**
   * The time of each file that the run read, as the run recorded it
   */
  files: ReadonlyMap<string, number>;
  /**
   * The folders that the run read
   */
  contexts: ReadonlyMap<string, number>;
  /**
   * The times that the previous watcher had when the run started
   */
  times: ReadonlyMap<string, ITimeEntry> | undefined;
}

const OUTDATED_ON_ATTACH_EXPLANATION: string = 'watch (outdated on attach)';
// A new watcher's first scan reports each file whose mtime is later than the watcher's start time, less the file
// system's accuracy. A watcher that attaches to the watcher of a folder that has already scanned reports the
// folder in the same way. Watchpack's other explanations are for events from the file system.
const SCAN_EXPLANATIONS: ReadonlySet<string> = new Set(['scan (file)', OUTDATED_ON_ATTACH_EXPLANATION]);

function tryLstatSync(filePath: string): fs.Stats | undefined {
  try {
    return fs.lstatSync(filePath, { throwIfNoEntry: false });
  } catch {
    return undefined;
  }
}

function getTimestamp(stats: fs.Stats): number {
  return stats.mtime.getTime() || stats.ctime.getTime() || Date.now();
}

/**
 * Watchpack records a file's new time only when its `fs.lstat()` after the file system's event finishes. If a
 * run starts before then, the previous watcher's time for the file is from before the change. Read the time
 * again, so that the run sees the change, and so that the run's watcher knows that the run saw it.
 */
function refreshPendingTimes(watcher: Watchpack, times: Map<string, ITimeEntry>): void {
  const pendingEventState: ReturnType<typeof _tryGetWatchpackPendingEventState> =
    _tryGetWatchpackPendingEventState(watcher);
  if (!pendingEventState) {
    return;
  }

  for (const { filePath } of pendingEventState.pendingFileEvents) {
    const stats: fs.Stats | undefined = tryLstatSync(filePath);
    if (!stats) {
      times.delete(filePath);
    } else if (!stats.isDirectory()) {
      const timestamp: number = getTimestamp(stats);
      times.set(filePath, { timestamp, safeTime: timestamp });
    }
  }
}

/**
 * Returns false if the watcher reported the path only because the path's time is close to the run's start, and
 * the run has already read the path as it is now.
 */
function isReportedChangeNew(filePath: string, explanation: string, inputs: IRunInputs): boolean {
  if (!SCAN_EXPLANATIONS.has(explanation) || inputs.baseline === undefined) {
    return true;
  }

  const stats: fs.Stats | undefined = tryLstatSync(filePath);
  if (!stats) {
    return true;
  }

  if (stats.isDirectory()) {
    // The watcher of a folder that the run read reports the folder's files one by one
    return explanation !== OUTDATED_ON_ATTACH_EXPLANATION || !inputs.contexts.has(filePath);
  }

  if (stats.ctimeMs >= inputs.baseline) {
    return true;
  }

  const readTime: number | undefined = inputs.files.get(filePath) ?? inputs.times?.get(filePath)?.timestamp;
  return readTime !== getTimestamp(stats);
}

/**
 * A filesystem adapter for use with the "fast-glob" package. This adapter tracks file system accesses
 * to initialize `watchpack`.
 */
export class WatchFileSystemAdapter implements IWatchFileSystemAdapter {
  #files: Map<string, number> = new Map();
  #contexts: Map<string, number> = new Map();
  #missing: Map<string, number> = new Map();

  #watcher: Watchpack | undefined;

  #lastFiles: Map<string, number> | undefined;
  #lastQueryTime: number | undefined;
  #times: Map<string, ITimeEntry> | undefined;

  /** { @inheritdoc fs.readdirSync } */
  public readdirSync: IWatchFileSystemAdapter['readdirSync'] = ((
    filePath: string,
    options?: IReaddirOptions
  ) => {
    filePath = path.normalize(filePath);

    try {
      if (options?.withFileTypes) {
        const results: fs.Dirent[] = fs.readdirSync(filePath, options);
        this.#contexts.set(filePath, Date.now());
        return results;
      } else {
        const results: string[] = fs.readdirSync(filePath);
        this.#contexts.set(filePath, Date.now());
        return results;
      }
    } catch (err) {
      this.#missing.set(filePath, Date.now());
      throw err;
    }
  }) as IWatchFileSystemAdapter['readdirSync'];

  /** { @inheritdoc fs.readdir } */
  public readdir: IWatchFileSystemAdapter['readdir'] = (
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
          this.#missing.set(filePath, Date.now());
        } else {
          this.#contexts.set(filePath, Date.now());
        }
        (callback as ReaddirDirentCallback)(err, entries);
      });
    } else {
      fs.readdir(filePath, (err: NodeJS.ErrnoException | null, entries: string[]) => {
        if (err) {
          this.#missing.set(filePath, Date.now());
        } else {
          this.#contexts.set(filePath, Date.now());
        }
        (callback as ReaddirStringCallback)(err, entries);
      });
    }
  };

  /** { @inheritdoc fs.lstat } */
  public lstat: IWatchFileSystemAdapter['lstat'] = (filePath: string, callback: StatCallback): void => {
    filePath = path.normalize(filePath);
    fs.lstat(filePath, (err: NodeJS.ErrnoException | null, stats: fs.Stats) => {
      if (err) {
        this.#missing.set(filePath, Date.now());
      } else {
        this.#files.set(filePath, stats.mtime.getTime() || stats.ctime.getTime() || Date.now());
      }
      callback(err, stats);
    });
  };

  /** { @inheritdoc fs.lstatSync } */
  public lstatSync: IWatchFileSystemAdapter['lstatSync'] = (filePath: string): fs.Stats => {
    filePath = path.normalize(filePath);
    try {
      const stats: fs.Stats = fs.lstatSync(filePath);
      this.#files.set(filePath, stats.mtime.getTime() || stats.ctime.getTime() || Date.now());
      return stats;
    } catch (err) {
      this.#missing.set(filePath, Date.now());
      throw err;
    }
  };

  /** { @inheritdoc fs.stat } */
  public stat: IWatchFileSystemAdapter['stat'] = (filePath: string, callback: StatCallback): void => {
    filePath = path.normalize(filePath);
    fs.stat(filePath, (err: NodeJS.ErrnoException | null, stats: fs.Stats) => {
      if (err) {
        this.#missing.set(filePath, Date.now());
      } else {
        this.#files.set(filePath, stats.mtime.getTime() || stats.ctime.getTime() || Date.now());
      }
      callback(err, stats);
    });
  };

  /** { @inheritdoc fs.statSync } */
  public statSync: IWatchFileSystemAdapter['statSync'] = (filePath: string) => {
    filePath = path.normalize(filePath);
    try {
      const stats: fs.Stats = fs.statSync(filePath);
      this.#files.set(filePath, stats.mtime.getTime() || stats.ctime.getTime() || Date.now());
      return stats;
    } catch (err) {
      this.#missing.set(filePath, Date.now());
      throw err;
    }
  };

  /**
   * @inheritdoc
   */
  public setBaseline(): void {
    this.#lastQueryTime = Date.now();

    const watcher: Watchpack | undefined = this.#watcher;
    if (watcher) {
      this.#watcher = undefined;
      const times: Map<string, ITimeEntry> = new Map();
      watcher.collectTimeInfoEntries(times, times);
      refreshPendingTimes(watcher, times);
      // Close the previous watcher instead of only pausing it. A paused watcher keeps its directory watchers,
      // so every run would leak another set of them. A kept watcher also keeps its OS watch on a folder that
      // was deleted and recreated, and later watchers on that folder would share the dead watch, so edits in
      // the recreated folder would be reported one run late.
      watcher.close();
      this.#times = times;
    } else {
      // Nothing is watching, so times collected for an earlier run may be out of date.
      this.#times = undefined;
    }
  }

  /**
   * @inheritdoc
   */
  public watch(onChange: () => void): void {
    if (this.#files.size === 0 && this.#contexts.size === 0 && this.#missing.size === 0) {
      return;
    }

    const inputs: IRunInputs = {
      baseline: this.#lastQueryTime,
      files: this.#files,
      contexts: this.#contexts,
      times: this.#times
    };

    const watcher: Watchpack = new Watchpack({
      aggregateTimeout: 0,
      followSymlinks: false
    });

    // A file that changed just before the run started is reported again when the watcher starts, although the
    // run has read the change. Call onChange only for a change that the run may not have seen.
    let hasNewChange: boolean = false;
    const onReportedChange = (filePath: string, modifiedTime: number, explanation: string): void => {
      hasNewChange ||= isReportedChangeNew(filePath, explanation, inputs);
    };
    const onReportedRemove = (): void => {
      hasNewChange = true;
    };
    const onAggregated = (): void => {
      if (hasNewChange) {
        watcher.off('change', onReportedChange);
        watcher.off('remove', onReportedRemove);
        watcher.off('aggregated', onAggregated);
        onChange();
      }
    };
    watcher.on('change', onReportedChange);
    watcher.on('remove', onReportedRemove);
    watcher.on('aggregated', onAggregated);

    this.#watcher = watcher;
    watcher.watch({
      files: this.#files.keys(),
      directories: this.#contexts.keys(),
      missing: this.#missing.keys(),
      startTime: this.#lastQueryTime
    });

    // The watcher checks its reports against `inputs`, so the next run records into new maps
    this.#lastFiles = this.#files;
    this.#files = new Map();
    this.#contexts = new Map();
    this.#missing.clear();
  }

  /**
   * @inheritdoc
   */
  public async getStateAndTrackAsync(filePath: string): Promise<IWatchedFileState> {
    const normalizedSourcePath: string = path.normalize(filePath);
    const oldTime: number | undefined = this.#lastFiles?.get(normalizedSourcePath);
    let newTimeEntry: ITimeEntry | undefined = this.#times?.get(normalizedSourcePath);

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
        this.#missing.set(normalizedSourcePath, Date.now());
      }
    }

    const newTime: number | undefined =
      (newTimeEntry && (newTimeEntry.timestamp ?? newTimeEntry.safeTime)) || this.#lastQueryTime;

    if (newTime) {
      this.#files.set(normalizedSourcePath, newTime);
    }

    return {
      changed: newTime !== oldTime
    };
  }

  /**
   * @inheritdoc
   */
  public getStateAndTrack(filePath: string): IWatchedFileState {
    const normalizedSourcePath: string = path.normalize(filePath);
    const oldTime: number | undefined = this.#lastFiles?.get(normalizedSourcePath);
    let newTimeEntry: ITimeEntry | undefined = this.#times?.get(normalizedSourcePath);

    if (!newTimeEntry) {
      // Need to record a timestamp, otherwise first rerun will select everything
      const stats: fs.Stats | undefined = fs.lstatSync(normalizedSourcePath, { throwIfNoEntry: false });
      if (stats) {
        const rounded: number = stats.mtime.getTime() || stats.ctime.getTime() || Date.now();
        newTimeEntry = {
          timestamp: rounded,
          safeTime: rounded
        };
      } else {
        this.#missing.set(normalizedSourcePath, Date.now());
      }
    }

    const newTime: number | undefined =
      (newTimeEntry && (newTimeEntry.timestamp ?? newTimeEntry.safeTime)) || this.#lastQueryTime;

    if (newTime) {
      this.#files.set(normalizedSourcePath, newTime);
    }

    return {
      changed: newTime !== oldTime
    };
  }
}
