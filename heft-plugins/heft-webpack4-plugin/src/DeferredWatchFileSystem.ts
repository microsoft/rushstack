// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { performance } from 'node:perf_hooks';
import { setImmediate as setImmediateAsync, setTimeout as setTimeoutAsync } from 'node:timers/promises';

import Watchpack, { type WatchOptions } from 'watchpack';
import type { Compiler, Plugin } from 'webpack';

/**
 * The longest time that {@link DeferredWatchFileSystem.flushAsync} waits for watchpack to finish recording the
 * file system events that it has received.
 */
const MAX_PENDING_EVENTS_WAIT_MS: number = 1000;
const PENDING_EVENTS_POLL_INTERVAL_MS: number = 1;

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

/**
 * The fields of watchpack's internal `DirectoryWatcher` that show whether it is still recording a change.
 * They aren't part of watchpack's public API, so they are all optional.
 */
interface IDirectoryWatcherInternals {
  /**
   * True while the watcher reads the directory. Changes that the scan finds are recorded as it goes.
   */
  scanning?: boolean;
  /**
   * The names of the files that have an OS event whose `fs.lstat()` hasn't finished yet. The change is
   * recorded only when the `fs.lstat()` finishes.
   */
  _activeEvents?: Map<string, boolean>;
}

/**
 * A watchpack instance with the internal state that {@link DeferredWatchFileSystem.flushAsync} inspects.
 * Every watchpack instance that is created with the same options object shares one watcher manager, which
 * removes a directory watcher from `directoryWatchers` when the watcher closes.
 */
interface IWatchpackWithInternals extends Watchpack {
  watcherManager?: {
    directoryWatchers?: Map<string, IDirectoryWatcherInternals>;
  };
}

export class DeferredWatchFileSystem implements IWatchFileSystem {
  public readonly inputFileSystem: IPurgeable;
  public readonly watcherOptions: WatchOptions;
  public watcher: Watchpack | undefined;

  readonly #onChange: () => void;
  #state: IWatchState | undefined;
  #isFlushing: boolean = false;

  public constructor(inputFileSystem: IPurgeable, onChange: () => void) {
    this.inputFileSystem = inputFileSystem;
    this.watcherOptions = {
      aggregateTimeout: 0
    };
    this.watcher = new Watchpack(this.watcherOptions);
    this.#onChange = onChange;
  }

  public flush(): boolean {
    const state: IWatchState | undefined = this.#state;

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

  /**
   * Like {@link DeferredWatchFileSystem.flush}, but first lets watchpack finish recording the file system events
   * that it has already received.
   *
   * @remarks
   * Watchpack records a changed file only after an asynchronous `fs.lstat()` of it, so a file that an upstream
   * task wrote just before a call to `flush()` can be missing from the changes. This method waits until the
   * directory watchers have no events or scans in progress, for up to 1 second. If there are changes, it then
   * waits for the clock to pass the time when they were recorded. The compilation that the callback starts takes
   * its start time from the clock, and the next `watch()` call reports every change recorded at or after that
   * start time again, as "outdated on attach".
   *
   * While this method waits, it keeps the changes that the watcher reports for the flush, and doesn't call
   * `onChange` for them.
   */
  public async flushAsync(): Promise<boolean> {
    if (!this.#state) {
      return false;
    }

    this.#isFlushing = true;
    try {
      await this.#waitForPendingEventsAsync();
      if (!this.watcher) {
        // The watcher was closed while this method waited.
        return false;
      }

      return this.flush();
    } finally {
      this.#isFlushing = false;
    }
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

    this.#state = {
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

      // flushAsync() passes these changes to the callback when it finishes waiting, so they don't need
      // another run.
      if (!this.#isFlushing) {
        this.#onChange();
      }
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

  async #waitForPendingEventsAsync(): Promise<void> {
    // Let the event loop reach its poll phase, which delivers the OS events that were already queued when
    // flushAsync() was called. If flushAsync() was called during a poll phase, the first check phase comes
    // before the next poll phase, so it takes two turns.
    await setImmediateAsync();
    await setImmediateAsync();

    const deadline: number = performance.now() + MAX_PENDING_EVENTS_WAIT_MS;
    while (this.#hasPendingEvents() && performance.now() < deadline) {
      await setTimeoutAsync(PENDING_EVENTS_POLL_INTERVAL_MS);
    }

    if (this.#hasChanges()) {
      // Watchpack stamps each change with Date.now() when it records it, and webpack takes the start time of the
      // compilation, which it passes to the next watch(), from Date.now() as well. If they are equal, the next
      // watch() reports the change again.
      const recordedTime: number = Date.now();
      while (Date.now() <= recordedTime) {
        await setTimeoutAsync(PENDING_EVENTS_POLL_INTERVAL_MS);
      }
    }
  }

  #hasPendingEvents(): boolean {
    const directoryWatchers: Map<string, IDirectoryWatcherInternals> | undefined = (
      this.watcher as IWatchpackWithInternals | undefined
    )?.watcherManager?.directoryWatchers;
    if (!(directoryWatchers instanceof Map)) {
      return false;
    }

    for (const directoryWatcher of directoryWatchers.values()) {
      if (directoryWatcher.scanning || (directoryWatcher._activeEvents?.size ?? 0) > 0) {
        return true;
      }
    }

    return false;
  }

  #hasChanges(): boolean {
    const state: IWatchState | undefined = this.#state;
    const watcher: Watchpack | undefined = this.watcher;
    return (
      (!!state && (state.changes.size > 0 || state.removals.size > 0)) ||
      (!!watcher && (watcher.aggregatedChanges.size > 0 || watcher.aggregatedRemovals.size > 0))
    );
  }
}

export class OverrideNodeWatchFSPlugin implements Plugin {
  public readonly fileSystems: Set<DeferredWatchFileSystem> = new Set();
  readonly #onChange: () => void;

  public constructor(onChange: () => void) {
    this.#onChange = onChange;
  }

  public apply(compiler: Compiler): void {
    const watchFileSystem: DeferredWatchFileSystem = new DeferredWatchFileSystem(
      compiler.inputFileSystem,
      this.#onChange
    );
    this.fileSystems.add(watchFileSystem);
    (compiler as { watchFileSystem?: IWatchFileSystem }).watchFileSystem = watchFileSystem;
  }
}
