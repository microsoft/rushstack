// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import Watchpack, { type WatchOptions } from 'watchpack';
import type { Compiler, RspackPluginInstance, WatchFileSystem } from '@rspack/core';

// InputFileSystem type is defined inline since it's not exported from @rspack/core
// missing re-export here: https://github.com/web-infra-dev/rspack/blob/9542b49ad43f91ecbcb37ff277e0445e67b99967/packages/rspack/src/exports.ts#L133
// type definition here: https://github.com/web-infra-dev/rspack/blob/9542b49ad43f91ecbcb37ff277e0445e67b99967/packages/rspack/src/util/fs.ts#L496
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface InputFileSystem {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readFile: (...args: any[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readlink: (...args: any[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readdir: (...args: any[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stat: (...args: any[]) => void;
  purge?: (files?: string | string[] | Set<string>) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export type WatchCallback = Parameters<WatchFileSystem['watch']>[5];
export type WatchUndelayedCallback = Parameters<WatchFileSystem['watch']>[6];
export type Watcher = ReturnType<WatchFileSystem['watch']>;
export type WatcherInfo = ReturnType<Required<Watcher>['getInfo']>;
type FileSystemMap = ReturnType<NonNullable<Watcher['getFileTimeInfoEntries']>>;

interface IWatchState {
  changes: Set<string>;
  removals: Set<string>;

  callback: WatchCallback;
}

interface ITimeEntry {
  timestamp: number;
  safeTime: number;
}

type IRawFileSystemMap = Map<string, ITimeEntry>;

interface ITimeInfoEntries {
  fileTimeInfoEntries: FileSystemMap;
  contextTimeInfoEntries: FileSystemMap;
}

export class DeferredWatchFileSystem implements WatchFileSystem {
  public readonly inputFileSystem: InputFileSystem;
  public readonly watcherOptions: WatchOptions;
  public watcher: Watchpack | undefined;

  private readonly _onChange: () => void;
  private _state: IWatchState | undefined;

  public constructor(inputFileSystem: InputFileSystem, onChange: () => void) {
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

    const { changes, removals, callback } = state;

    // Force flush the aggregation callback
    const { changes: newChanges, removals: newRemovals } = this.watcher!.getAggregated();

    // Rspack (like Webpack 5) treats changes and removals as separate things
    if (newRemovals) {
      for (const removal of newRemovals) {
        changes.delete(removal);
        removals.add(removal);
      }
    }
    if (newChanges) {
      for (const change of newChanges) {
        removals.delete(change);
        changes.add(change);
      }
    }

    if (changes.size > 0 || removals.size > 0) {
      this._purge(removals, changes);

      const { fileTimeInfoEntries, contextTimeInfoEntries } = this._fetchTimeInfo();

      callback(null, fileTimeInfoEntries, contextTimeInfoEntries, changes, removals);

      changes.clear();
      removals.clear();

      return true;
    }

    return false;
  }

  public watch(
    files: Iterable<string>,
    directories: Iterable<string>,
    missing: Iterable<string>,
    startTime: number,
    options: WatchOptions,
    callback: WatchCallback,
    callbackUndelayed: WatchUndelayedCallback
  ): Watcher {
    const oldWatcher: Watchpack | undefined = this.watcher;
    this.watcher = new Watchpack(options);

    const changes: Set<string> = new Set();
    const removals: Set<string> = new Set();

    this._state = {
      changes,
      removals,

      callback
    };

    this.watcher.on('aggregated', (newChanges: Set<string>, newRemovals: Set<string>) => {
      for (const change of newChanges) {
        removals.delete(change);
        changes.add(change);
      }
      for (const removal of newRemovals) {
        changes.delete(removal);
        removals.add(removal);
      }

      this._onChange();
    });

    this.watcher.watch({
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
      getInfo: () => {
        const newRemovals: Set<string> | undefined = this.watcher?.aggregatedRemovals;
        const newChanges: Set<string> | undefined = this.watcher?.aggregatedChanges;
        this._purge(newRemovals, newChanges);
        const { fileTimeInfoEntries, contextTimeInfoEntries } = this._fetchTimeInfo();
        return {
          changes: newChanges!,
          removals: newRemovals!,
          fileTimeInfoEntries,
          contextTimeInfoEntries
        };
      },
      getContextTimeInfoEntries: () => {
        const { contextTimeInfoEntries } = this._fetchTimeInfo();
        return contextTimeInfoEntries;
      },
      getFileTimeInfoEntries: () => {
        const { fileTimeInfoEntries } = this._fetchTimeInfo();
        return fileTimeInfoEntries;
      }
    };
  }

  private _fetchTimeInfo(): ITimeInfoEntries {
    const fileTimeInfoEntries: IRawFileSystemMap = new Map();
    const contextTimeInfoEntries: IRawFileSystemMap = new Map();
    this.watcher?.collectTimeInfoEntries(fileTimeInfoEntries, contextTimeInfoEntries);
    return { fileTimeInfoEntries, contextTimeInfoEntries };
  }

  private _purge(removals: Set<string> | undefined, changes: Set<string> | undefined): void {
    const fs: InputFileSystem = this.inputFileSystem;
    if (fs.purge) {
      if (removals) {
        for (const removal of removals) {
          fs.purge(removal);
        }
      }
      if (changes) {
        for (const change of changes) {
          fs.purge(change);
        }
      }
    }
  }
}

export class OverrideNodeWatchFSPlugin implements RspackPluginInstance {
  public readonly fileSystems: Set<DeferredWatchFileSystem> = new Set();
  private readonly _onChange: () => void;

  public constructor(onChange: () => void) {
    this._onChange = onChange;
  }

  public apply(compiler: Compiler): void {
    const { inputFileSystem } = compiler;
    if (!inputFileSystem) {
      throw new Error(`compiler.inputFileSystem is not defined`);
    }

    const watchFileSystem: DeferredWatchFileSystem = new DeferredWatchFileSystem(
      inputFileSystem,
      this._onChange
    );
    this.fileSystems.add(watchFileSystem);
    compiler.watchFileSystem = watchFileSystem;
  }
}
