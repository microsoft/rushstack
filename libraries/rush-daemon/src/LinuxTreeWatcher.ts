// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';

/** Watches one directory without recursion. */
export type DirectoryWatchFunction = (
  folderPath: string,
  listener: fs.WatchListener<string>
) => fs.FSWatcher;

/** Options for {@link LinuxTreeWatcher}. */
export interface ILinuxTreeWatcherOptions {
  /** Absolute directory paths that are never observed, such as declared build output folders. */
  readonly getExcludedFolderPathsAsync?: () => Promise<ReadonlySet<string>>;
  /**
   * Reports the root once the initial walk finishes, covering changes made to directories before they
   * were registered. Callers that await {@link LinuxTreeWatcher.initialWalk} instead can leave this off.
   */
  readonly reportInitialWalkCompletion?: boolean;
  /** Test hook; defaults to a non-recursive `fs.watch`. */
  readonly watchDirectory?: DirectoryWatchFunction;
}

/** Directory names that are never observed at any depth. */
export const PRUNED_DIRECTORY_NAMES: ReadonlySet<string> = new Set(['node_modules', '.git']);

const TRANSIENT_ERROR_CODES: ReadonlySet<string | undefined> = new Set(['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM']);
const EMPTY_SET: ReadonlySet<string> = new Set();

const defaultWatchDirectory: DirectoryWatchFunction = (folderPath, listener) =>
  fs.watch(folderPath, { encoding: 'utf8', persistent: true }, listener);

/**
 * A recursive watcher for Linux built from one non-recursive inotify watch per directory.
 *
 * @remarks
 * Node's Linux emulation of `fs.watch(..., { recursive: true })` walks the tree synchronously on the event
 * loop and registers one inotify watch per file, including `node_modules` and build outputs. A directory-level
 * inotify watch already reports changes to the files it contains, so this watcher registers directories only,
 * walks asynchronously, prunes `node_modules`, `.git` and caller-provided folders, follows directories that are
 * created or removed later, and tolerates directories that disappear while they are being registered.
 *
 * The root is registered synchronously so a missing root fails like `fs.watch`. Each directory watch is created
 * before the directory is listed, so a child created during the walk is reported by its parent and then walked.
 * The object is `fs.FSWatcher`-compatible: it emits `error` and `close` and supports `ref`/`unref`.
 */
export class LinuxTreeWatcher extends EventEmitter {
  readonly #root: string;
  readonly #listener: fs.WatchListener<string>;
  readonly #watchDirectory: DirectoryWatchFunction;
  readonly #watchers: Map<string, fs.FSWatcher> = new Map();
  readonly #excludedFolderPaths: Promise<ReadonlySet<string>>;
  #resolvedExcludedFolderPaths: ReadonlySet<string> = EMPTY_SET;
  #closed: boolean = false;
  #failed: boolean = false;
  #isUnref: boolean = false;

  /** Resolves when the initial asynchronous walk has finished (or stopped). */
  public readonly initialWalk: Promise<void>;

  public constructor(root: string, listener: fs.WatchListener<string>, options: ILinuxTreeWatcherOptions = {}) {
    super();
    this.#root = path.resolve(root);
    this.#listener = listener;
    this.#watchDirectory = options.watchDirectory ?? defaultWatchDirectory;
    this.#excludedFolderPaths = loadExcludedFolderPathsAsync(options.getExcludedFolderPathsAsync);
    this.#addDirectory(this.#root, true);
    this.initialWalk = this.#walkAsync(this.#root).then(() => {
      if (options.reportInitialWalkCompletion) this.#reportCoverage(this.#root);
    });
  }

  /** The directories that currently hold an inotify watch. */
  public get watchedFolderPaths(): ReadonlySet<string> {
    return new Set(this.#watchers.keys());
  }

  public close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const watcher of this.#watchers.values()) watcher.close();
    this.#watchers.clear();
    process.nextTick(() => this.emit('close'));
  }

  public ref(): this {
    this.#isUnref = false;
    for (const watcher of this.#watchers.values()) watcher.ref();
    return this;
  }

  public unref(): this {
    this.#isUnref = true;
    for (const watcher of this.#watchers.values()) watcher.unref();
    return this;
  }

  #isPruned(folderPath: string): boolean {
    return (
      PRUNED_DIRECTORY_NAMES.has(path.basename(folderPath)) || this.#resolvedExcludedFolderPaths.has(folderPath)
    );
  }

  /** Returns false when the directory vanished before it could be watched. */
  #addDirectory(folderPath: string, isRoot: boolean = false): boolean {
    if (this.#closed || this.#failed) return false;
    if (this.#watchers.has(folderPath)) return true;
    let watcher: fs.FSWatcher;
    try {
      watcher = this.#watchDirectory(folderPath, (eventType, filename) =>
        this.#onDirectoryEvent(folderPath, eventType, filename)
      );
    } catch (error) {
      if (isRoot) throw toWatchError(error, folderPath);
      if (TRANSIENT_ERROR_CODES.has(getErrorCode(error))) return false;
      this.#fail(error, folderPath);
      return false;
    }
    watcher.on('error', (error: Error) => this.#onDirectoryError(folderPath, error));
    if (this.#isUnref) watcher.unref();
    this.#watchers.set(folderPath, watcher);
    return true;
  }

  #onDirectoryEvent(folderPath: string, eventType: fs.WatchEventType, filename: string | null): void {
    if (this.#closed) return;
    if (!filename) {
      this.#listener(eventType, path.relative(this.#root, folderPath));
      return;
    }
    const changedPath: string = path.join(folderPath, filename);
    if (this.#isPruned(changedPath)) return;
    this.#listener(eventType, path.relative(this.#root, changedPath));
    if (eventType === 'rename') {
      void this.#reconcileEntryAsync(changedPath);
    }
  }

  #onDirectoryError(folderPath: string, error: Error): void {
    if (TRANSIENT_ERROR_CODES.has(getErrorCode(error)) && folderPath !== this.#root) {
      // The directory was removed; its parent's `rename` event already reported the change.
      this.#removeDirectory(folderPath);
      return;
    }
    this.#fail(error, folderPath);
  }

  async #reconcileEntryAsync(changedPath: string): Promise<void> {
    let isDirectory: boolean;
    try {
      isDirectory = (await fs.promises.lstat(changedPath)).isDirectory();
    } catch {
      isDirectory = false;
    }
    if (!isDirectory) {
      this.#removeDirectory(changedPath);
    } else if (!this.#watchers.has(changedPath) && this.#addDirectory(changedPath)) {
      await this.#walkAsync(changedPath);
      // Files written into the new directory before its watch existed were not reported.
      this.#reportCoverage(changedPath);
    }
  }

  #reportCoverage(folderPath: string): void {
    if (!this.#closed && !this.#failed) this.#listener('rename', path.relative(this.#root, folderPath));
  }

  #removeDirectory(folderPath: string): void {
    const prefix: string = folderPath + path.sep;
    for (const [key, watcher] of this.#watchers) {
      if (key === folderPath || key.startsWith(prefix)) {
        watcher.close();
        this.#watchers.delete(key);
      }
    }
  }

  async #walkAsync(folderPath: string): Promise<void> {
    this.#resolvedExcludedFolderPaths = await this.#excludedFolderPaths;
    let directory: fs.Dir;
    try {
      directory = await fs.promises.opendir(folderPath);
    } catch {
      // Removed or replaced while walking; the parent's `rename` event already reported the change.
      this.#removeDirectory(folderPath);
      return;
    }
    const children: string[] = [];
    try {
      for await (const entry of directory) {
        if (this.#closed || this.#failed) break;
        const childPath: string = path.join(folderPath, entry.name);
        if (entry.isDirectory() && !this.#isPruned(childPath) && this.#addDirectory(childPath)) {
          children.push(childPath);
        }
      }
    } catch {
      // The directory disappeared mid-read; any registered children are cleaned up by their own events.
    }
    for (const childPath of children) {
      if (this.#closed || this.#failed) return;
      await this.#walkAsync(childPath);
    }
  }

  #fail(error: unknown, folderPath: string): void {
    if (this.#failed || this.#closed) return;
    this.#failed = true;
    this.emit('error', toWatchError(error, folderPath));
  }
}

/** Creates a {@link LinuxTreeWatcher} typed as an `fs.FSWatcher`. */
export function createLinuxTreeWatcher(
  root: string,
  listener: fs.WatchListener<string>,
  options?: ILinuxTreeWatcherOptions
): fs.FSWatcher {
  return new LinuxTreeWatcher(root, listener, options) as unknown as fs.FSWatcher;
}

async function loadExcludedFolderPathsAsync(
  getExcludedFolderPathsAsync: (() => Promise<ReadonlySet<string>>) | undefined
): Promise<ReadonlySet<string>> {
  if (!getExcludedFolderPathsAsync) return EMPTY_SET;
  try {
    const folders: ReadonlySet<string> = await getExcludedFolderPathsAsync();
    return new Set(Array.from(folders, (folder: string) => path.resolve(folder)));
  } catch {
    // Pruning is an optimization; observing a folder that could have been skipped is always safe.
    return EMPTY_SET;
  }
}

function getErrorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

/** Makes inotify exhaustion (`ENOSPC`) explicit instead of surfacing a bare libuv error. */
export function toWatchError(error: unknown, folderPath: string): Error {
  const cause: Error = error instanceof Error ? error : new Error(String(error));
  if (getErrorCode(error) !== 'ENOSPC') return cause;
  const limitError: NodeJS.ErrnoException = new Error(
    `The Linux inotify watch limit was reached while watching "${folderPath}" ` +
      `(fs.inotify.max_user_watches). Rush daemon change detection is incomplete. ` +
      `Increase the limit (for example "sudo sysctl fs.inotify.max_user_watches=524288") ` +
      `or unset RUSH_DAEMON_WATCH.`,
    { cause }
  );
  limitError.code = 'ENOSPC';
  return limitError;
}
