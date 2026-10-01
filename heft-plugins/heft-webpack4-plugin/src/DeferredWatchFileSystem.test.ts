// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { setImmediate as setImmediateAsync, setTimeout as setTimeoutAsync } from 'node:timers/promises';

import type { WatchOptions } from 'watchpack';

import { DeferredWatchFileSystem, type IWatch } from './DeferredWatchFileSystem';

/**
 * The fields of watchpack's internal `DirectoryWatcher` that these tests read or set.
 */
interface IDirectoryWatcherInternals {
  scanning: boolean;
  _activeEvents: Map<string, boolean>;
}

interface IFlush {
  changes: string[];
  removals: string[];
}

// On Linux, inotify queues the event for a write during the write, so the event loop delivers it on its next poll.
// Other platforms can deliver an event later, so the tests that depend on that timing run only on Linux.
const itOnLinux: jest.It = process.platform === 'linux' ? it : it.skip;

// Windows has no FIFOs, so there holdThreadPool() gives each thread about 100 ms of work instead, which can take
// longer than flushAsync() waits on a machine whose CPUs are busy.
const PBKDF2_ITERATIONS: number = 200000;

describe(DeferredWatchFileSystem.name, () => {
  let fifoPath: string | undefined;
  let folder: string;
  let watchOptions: WatchOptions;
  let onChange: jest.Mock<void, []>;
  let purge: jest.Mock<void, [string[]]>;
  let watchFileSystem: DeferredWatchFileSystem;
  let watcher: IWatch | undefined;
  let flushes: IFlush[];
  let compilationStartTimes: number[];
  let releaseThreadPoolAsync: (() => Promise<void>) | undefined;

  beforeAll(() => {
    if (process.platform !== 'win32') {
      const fifoFolder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'heft-webpack4-plugin-test-fifo-'));
      fifoPath = path.join(fifoFolder, 'fifo');
      child_process.execFileSync('mkfifo', [fifoPath]);
    }
  });

  afterAll(() => {
    if (fifoPath) {
      // Not fs.rmSync(), which calls lstat on the FIFO. Until the next stat call, Node's fs.realpathSync() then
      // returns some paths with their symlinks unresolved, and jest fails to require() a package that pnpm linked.
      fs.unlinkSync(fifoPath);
      fs.rmdirSync(path.dirname(fifoPath));
    }
  });

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'heft-webpack4-plugin-test-'));
    watchOptions = { aggregateTimeout: 20 };
    onChange = jest.fn();
    purge = jest.fn();
    watchFileSystem = new DeferredWatchFileSystem({ purge }, onChange);
    watcher = undefined;
    flushes = [];
    compilationStartTimes = [];
    releaseThreadPoolAsync = undefined;
  });

  afterEach(async () => {
    // For a test that failed while it held the thread pool
    await releaseThreadPoolAsync?.();
    watcher?.close();
    fs.rmSync(folder, { recursive: true, force: true });
  });

  function createFile(name: string): string {
    const filePath: string = path.join(folder, name);
    fs.writeFileSync(filePath, 'initial');
    // An old modification time, so that the first scan doesn't report the file as changed.
    const past: Date = new Date(Date.now() - 60000);
    fs.utimesSync(filePath, past, past);
    return filePath;
  }

  /**
   * Watches the files as webpack's `Watching` does. When a flush calls back, the callback takes the start time of
   * the compilation from the clock, as `Watching._go()` does. Webpack 4 doesn't pause the watcher there, because
   * its callback clears `Watching.watcher` before it calls `_invalidate()`.
   */
  function watch(files: string[], startTime: number): void {
    watcher = watchFileSystem.watch(
      files,
      [],
      [],
      startTime,
      watchOptions,
      (error, changedFiles, changedDirs, changedMissing, fileTimes, dirTimes, removals) => {
        compilationStartTimes.push(Date.now());
        flushes.push({
          changes: changedFiles.slice().sort(),
          removals: Array.from(removals).sort()
        });
      },
      () => {
        // Webpack's undelayed callback isn't used.
      }
    );
  }

  function getDirectoryWatchers(): IDirectoryWatcherInternals[] {
    const internals: { watcherManager: { directoryWatchers: Map<string, IDirectoryWatcherInternals> } } =
      watchFileSystem.watcher as unknown as {
        watcherManager: { directoryWatchers: Map<string, IDirectoryWatcherInternals> };
      };
    return Array.from(internals.watcherManager.directoryWatchers.values());
  }

  async function waitForAsync(condition: () => boolean): Promise<void> {
    const deadline: number = performance.now() + 5000;
    while (!condition()) {
      if (performance.now() > deadline) {
        throw new Error('The condition was not met within 5 seconds');
      }
      await setImmediateAsync();
    }
  }

  async function watchAndWaitForScanAsync(files: string[]): Promise<void> {
    watch(files, Date.now());
    await waitForAsync(() => getDirectoryWatchers().every((directoryWatcher) => !directoryWatcher.scanning));
  }

  /**
   * Holds every thread of the thread pool until the returned function releases them, so that the `fs.readdir()`
   * and `fs.lstat()` calls that the watcher makes next wait in the queue. The returned function resolves when the
   * threads are free again. On Windows, the threads are only busy for a while (see `PBKDF2_ITERATIONS`).
   */
  function holdThreadPool(): () => Promise<void> {
    const threadCount: number = Number(process.env.UV_THREADPOOL_SIZE) || 4;
    const releaseAsync: () => Promise<void> = fifoPath
      ? holdThreadPoolWithFifo(fifoPath, threadCount)
      : keepThreadPoolBusy(threadCount);
    let releasePromise: Promise<void> | undefined;
    releaseThreadPoolAsync = () => (releasePromise ??= releaseAsync());
    return releaseThreadPoolAsync;
  }

  function holdThreadPoolWithFifo(fifo: string, threadCount: number): () => Promise<void> {
    // Opening a FIFO for reading blocks the thread until something opens the FIFO for writing.
    const fdPromises: Promise<number>[] = [];
    for (let i: number = 0; i < threadCount; i++) {
      fdPromises.push(
        new Promise<number>((resolve, reject) => {
          fs.open(fifo, 'r', (error, fd) => {
            if (error) {
              reject(error);
            } else {
              resolve(fd);
            }
          });
        })
      );
    }

    return async () => {
      // Opening a FIFO for both reading and writing doesn't block on Linux or macOS, and it releases the threads.
      // The FIFO stays open until every thread has opened it, so that none of them blocks again.
      const writerFd: number = fs.openSync(fifo, 'r+');
      try {
        for (const fd of await Promise.all(fdPromises)) {
          fs.closeSync(fd);
        }
      } finally {
        fs.closeSync(writerFd);
      }
    };
  }

  function keepThreadPoolBusy(threadCount: number): () => Promise<void> {
    const tasks: Promise<void>[] = [];
    for (let i: number = 0; i < threadCount; i++) {
      tasks.push(
        new Promise<void>((resolve, reject) => {
          crypto.pbkdf2('password', 'salt', PBKDF2_ITERATIONS, 64, 'sha512', (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        })
      );
    }

    return async () => {
      await Promise.all(tasks);
    };
  }

  /**
   * Waits until a `flushAsync()` call that was just made is waiting for pending events. It checks for them for the
   * first time on the second turn of the event loop after the call, so after three turns it is waiting.
   */
  async function waitForFlushToWaitAsync(): Promise<void> {
    for (let i: number = 0; i < 3; i++) {
      await setImmediateAsync();
    }
  }

  it('returns false before watch() is called', async () => {
    await expect(watchFileSystem.flushAsync()).resolves.toBe(false);
  });

  it('returns false and calls back nothing when nothing changed', async () => {
    const file: string = createFile('a.js');
    await watchAndWaitForScanAsync([file]);

    await expect(watchFileSystem.flushAsync()).resolves.toBe(false);

    await setTimeoutAsync(50);
    expect(flushes).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });

  itOnLinux('includes a file that was written just before the call', async () => {
    const file: string = createFile('a.js');
    await watchAndWaitForScanAsync([file]);
    const releaseAsync: () => Promise<void> = holdThreadPool();

    fs.writeFileSync(file, 'changed');
    const flushPromise: Promise<boolean> = watchFileSystem.flushAsync();
    await waitForFlushToWaitAsync();
    await releaseAsync();
    await expect(flushPromise).resolves.toBe(true);

    expect(flushes).toEqual([{ changes: [file], removals: [] }]);
    expect(purge).toHaveBeenCalledWith([file]);
    await setTimeoutAsync(50);
    expect(onChange).not.toHaveBeenCalled();
  });

  itOnLinux('includes a file whose event arrived before the call but is not recorded yet', async () => {
    const file: string = createFile('a.js');
    await watchAndWaitForScanAsync([file]);
    const releaseAsync: () => Promise<void> = holdThreadPool();

    fs.writeFileSync(file, 'changed');
    await waitForAsync(() =>
      getDirectoryWatchers().some((directoryWatcher) => directoryWatcher._activeEvents.size > 0)
    );
    expect(watchFileSystem.watcher!.aggregatedChanges.size).toBe(0);
    const flushPromise: Promise<boolean> = watchFileSystem.flushAsync();
    await waitForFlushToWaitAsync();
    await releaseAsync();
    await expect(flushPromise).resolves.toBe(true);

    expect(flushes).toEqual([{ changes: [file], removals: [] }]);
  });

  itOnLinux('includes a file that was written in the same poll phase as the call', async () => {
    const file: string = createFile('a.js');
    await watchAndWaitForScanAsync([file]);

    // An fs callback runs in the poll phase, after the event loop has collected the events that were ready, so
    // the event for this write can't arrive before the next poll phase.
    const flushPromise: Promise<boolean> = new Promise<boolean>((resolve, reject) => {
      fs.stat(file, (error) => {
        if (error) {
          reject(error);
        } else {
          fs.writeFileSync(file, 'changed');
          resolve(watchFileSystem.flushAsync());
        }
      });
    });

    await expect(flushPromise).resolves.toBe(true);
    expect(flushes).toEqual([{ changes: [file], removals: [] }]);
  });

  itOnLinux(
    'keeps the changes that the watcher reports while it waits, without calling onChange',
    async () => {
      const fileA: string = createFile('a.js');
      const fileB: string = createFile('b.js');
      await watchAndWaitForScanAsync([fileA, fileB]);
      let aggregatedCount: number = 0;
      watchFileSystem.watcher!.on('aggregated', () => {
        aggregatedCount++;
      });

      fs.writeFileSync(fileA, 'changed');
      await waitForAsync(() => watchFileSystem.watcher!.aggregatedChanges.has(fileA));
      const releaseAsync: () => Promise<void> = holdThreadPool();
      fs.writeFileSync(fileB, 'changed');
      const flushPromise: Promise<boolean> = watchFileSystem.flushAsync();
      // The watcher reports a.js when its 20 ms aggregate timeout ends, while flushAsync() still waits for b.js.
      await waitForAsync(() => aggregatedCount > 0);
      await releaseAsync();
      await expect(flushPromise).resolves.toBe(true);

      expect(flushes).toEqual([{ changes: [fileA, fileB].sort(), removals: [] }]);
      await setTimeoutAsync(50);
      expect(onChange).not.toHaveBeenCalled();
    }
  );

  itOnLinux(
    'starts the compilation after the changes it passes, so the next watch() does not report them again',
    async () => {
      const file: string = createFile('a.js');
      await watchAndWaitForScanAsync([file]);

      const reportedAgain: number[] = [];
      for (let i: number = 0; i < 10; i++) {
        fs.writeFileSync(file, `change ${i}`);
        await waitForAsync(() => watchFileSystem.watcher!.aggregatedChanges.has(file));
        await expect(watchFileSystem.flushAsync()).resolves.toBe(true);

        // When the compilation is done, webpack's Watching calls watch() again with the compilation's start time.
        // The new watcher reports every change that was recorded at or after that time, as "outdated on attach".
        watch([file], compilationStartTimes[i]);
        await setImmediateAsync();
        reportedAgain.push(watchFileSystem.watcher!.aggregatedChanges.size);
      }

      expect(reportedAgain).toEqual(new Array(10).fill(0));
      expect(flushes).toHaveLength(10);
      await setTimeoutAsync(50);
      expect(onChange).not.toHaveBeenCalled();
    }
  );

  it('includes a change that a scan in progress finds', async () => {
    const subfolder: string = path.join(folder, 'sub');
    fs.mkdirSync(subfolder);
    const file: string = path.join(subfolder, 'a.js');
    fs.writeFileSync(file, 'new');
    const releaseAsync: () => Promise<void> = holdThreadPool();

    // A start time before the file was written, as for a file that changed during the compilation.
    watch([file], Date.now() - 60000);
    expect(getDirectoryWatchers().some((directoryWatcher) => directoryWatcher.scanning)).toBe(true);
    const flushPromise: Promise<boolean> = watchFileSystem.flushAsync();
    await waitForFlushToWaitAsync();
    await releaseAsync();
    await expect(flushPromise).resolves.toBe(true);

    expect(flushes).toEqual([{ changes: [file], removals: [] }]);
  });

  it('returns false when the watcher is closed while it waits', async () => {
    const file: string = createFile('a.js');
    await watchAndWaitForScanAsync([file]);

    fs.writeFileSync(file, 'changed');
    const flushPromise: Promise<boolean> = watchFileSystem.flushAsync();
    watcher!.close();

    await expect(flushPromise).resolves.toBe(false);
    expect(flushes).toEqual([]);
  });

  it('stops waiting after 1 second', async () => {
    const file: string = createFile('a.js');
    await watchAndWaitForScanAsync([file]);
    const directoryWatcher: IDirectoryWatcherInternals = getDirectoryWatchers()[0];
    // An event whose fs.lstat() never finishes
    directoryWatcher._activeEvents.set('never-finishes.js', false);

    try {
      const startTime: number = performance.now();
      await expect(watchFileSystem.flushAsync()).resolves.toBe(false);
      const elapsedMs: number = performance.now() - startTime;

      expect(elapsedMs).toBeGreaterThanOrEqual(999);
      expect(elapsedMs).toBeLessThan(3000);
    } finally {
      directoryWatcher._activeEvents.delete('never-finishes.js');
    }
  });
});
