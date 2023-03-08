// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import Watchpack, { type WatchOptions } from 'watchpack';
import type { Compiler, Plugin } from 'webpack';

export interface IPurgeable {
  purge?: (changes: string[]) => void;
}

export interface IWatchCallback {
  (
    err: Error | undefined,
    files: string[],
    dirs: string[],
    missing: string[],
    fileTimes: Map<string, number>,
    dirTimes: Map<string, number>,
    removals: Set<string>
  ): void;
}

export interface IWatchUndelayedCallback {
  (path: string, mtime: number): void;
}

export interface IWatch {
  close(): void;
  pause(): void;
  getFileTimestamps(): Map<string, number>;
  getContextTimestamps(): Map<string, number>;
}

function* contains<T>(source: Iterable<T>, collection: ReadonlySet<T>): IterableIterator<T> {
  for (const item of source) {
    if (collection.has(item)) {
      yield item;
    }
  }
}

interface IWatchState {
  files: Set<string>;
  dirs: Set<string>;
  missing: Set<string>;

  changes: Set<string>;
  removals: Set<string>;

  callback: IWatchCallback;
}

export interface IWatchFileSystem {
  watch(
    files: string[],
    directories: string[],
    missing: string[],
    startTime: number,
    options: WatchOptions,
    callback: IWatchCallback,
    callbackUndelayed: IWatchUndelayedCallback
  ): IWatch;
}

export class DeferredWatchFileSystem implements IWatchFileSystem {
  public readonly inputFileSystem: IPurgeable;
  public readonly watcherOptions: WatchOptions;
  public watcher: Watchpack | undefined;

  private readonly _onChange: () => void;
  private _state: IWatchState | undefined;

  public constructor(inputFileSystem: IPurgeable, onChange: () => void) {
    this.inputFileSystem = inputFileSystem;
    this.watcherOptions = {
      aggregateTimeout: 0
    };
    this.watcher = new Watchpack(this.watcherOptions);
    this._onChange = onChange;
  }

  public flush(): boolean {
    const state: IWatchState | undefined = this._state;

    if (!state) {
      return false;
    }

    const { files, dirs, missing, changes, removals, callback } = state;

    const { changes: aggregatedChanges, removals: aggregatedRemovals } = this.watcher!.getAggregated();

    // Webpack 4 treats changes as a superset of removals
    for (const removal of aggregatedRemovals) {
      changes.add(removal);
      removals.add(removal);
    }
    for (const change of aggregatedChanges) {
      removals.delete(change);
      changes.add(change);
    }

    if (changes.size > 0) {
      this.inputFileSystem.purge?.(Array.from(changes));

      const filteredRemovals: Set<string> = new Set(contains(removals, files));
      const changedFiles: string[] = Array.from(contains(changes, files)).sort();
      const changedDirs: string[] = Array.from(contains(changes, dirs)).sort();
      const changedMissing: string[] = Array.from(contains(changes, missing)).sort();

      const times: Map<string, number> = new Map(Object.entries(this.watcher!.getTimes()));

      callback(undefined, changedFiles, changedDirs, changedMissing, times, times, filteredRemovals);

      changes.clear();
      removals.clear();

      return true;
    }

    return false;
  }

  public watch(
    files: string[],
    directories: string[],
    missing: string[],
    startTime: number,
    options: WatchOptions,
    callback: IWatchCallback,
    callbackUndelayed: IWatchUndelayedCallback
  ): IWatch {
    const oldWatcher: Watchpack | undefined = this.watcher;
    const watcher: Watchpack = (this.watcher = new Watchpack(options));

    const changes: Set<string> = new Set();
    const removals: Set<string> = new Set();

    this._state = {
      files: new Set(files),
      dirs: new Set(directories),
      missing: new Set(missing),

      changes,
      removals,

      callback
    };

    watcher.once('aggregated', (newChanges: Set<string>, newRemovals: Set<string>) => {
      watcher.pause();

      for (const change of newChanges) {
        changes.add(change);
      }
      for (const removal of newRemovals) {
        changes.add(removal);
        removals.add(removal);
      }

      this._onChange();
    });

    watcher.watch({
      files,
      directories,
      missing,
      startTime
    });

    if (oldWatcher) {
      oldWatcher.close();
    }

    return {
      close: () => {
        if (this.watcher) {
          this.watcher.close();
          this.watcher = undefined;
        }
      },
      pause: () => {
        if (this.watcher) {
          this.watcher.pause();
        }
      },
      getFileTimestamps: () => {
        const timestamps: Record<string, number> | undefined = this.watcher?.getTimes();
        return timestamps ? new Map(Object.entries(timestamps)) : new Map();
      },
      getContextTimestamps: () => {
        const timestamps: Record<string, number> | undefined = this.watcher?.getTimes();
        return timestamps ? new Map(Object.entries(timestamps)) : new Map();
      }
    };
  }
}

export class OverrideNodeWatchFSPlugin implements Plugin {
  public readonly fileSystems: Set<DeferredWatchFileSystem> = new Set();
  private readonly _onChange: () => void;

  public constructor(onChange: () => void) {
    this._onChange = onChange;
  }

  public apply(compiler: Compiler): void {
    const watchFileSystem: DeferredWatchFileSystem = new DeferredWatchFileSystem(
      compiler.inputFileSystem,
      this._onChange
    );
    this.fileSystems.add(watchFileSystem);
    (compiler as { watchFileSystem?: IWatchFileSystem }).watchFileSystem = watchFileSystem;
  }
}
