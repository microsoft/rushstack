// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import Watchpack from 'watchpack';

import { Async } from '@rushstack/node-core-library';

import { watchGlobAsync } from '../../plugins/FileGlobSpecifier';
import { type IWatchedFileState, type StatCallback, WatchFileSystemAdapter } from '../WatchFileSystemAdapter';

const RUN_REQUEST_TIMEOUT_MS: number = 5000;
// Long enough for a watcher to finish its first scan, and for events to arrive
const SETTLE_MS: number = 250;
const TEST_TIMEOUT_MS: number = 30000;
// An hour ago, plus some milliseconds so that watchpack sees the file system's timestamps are precise. Files get
// old mtimes so that a new watcher doesn't report a file as changed just because it was written right before
// the watcher started.
const BASE_MTIME_MS: number = Math.floor(Date.now() / 1000) * 1000 - 3600 * 1000 + 123;
// A new watcher reports a file whose mtime is later than the watcher's start time. A file that gets an mtime in
// the future is reported by the next run's watcher for certain.
const FUTURE_MTIME_OFFSET_MS: number = 60 * 1000;
// Long enough for file timestamps to show which of two events came first, even where they are coarse
const TIMESTAMP_GAP_MS: number = 20;
// A file that the glob doesn't match, in a folder that the glob reads
const NOTES_PATH: string = 'src/sub/notes.txt';

// Watchpack calls fs.lstat() through this graceful-fs instance
const watcherFs: typeof fs = jest.requireActual(
  require.resolve('graceful-fs', { paths: [path.dirname(require.resolve('watchpack/package.json'))] })
);
// The adapter's calls to fs.lstatSync() look up the function on this module when they are made
const nodeFs: typeof fs = jest.requireActual('node:fs');

interface IRunOptions {
  watch?: boolean;
  beforeWatch?: () => Promise<void> | void;
}

interface IRun {
  changed: string[];
  isRunRequested(): boolean;
  waitForRunRequestAsync(): Promise<boolean>;
  /**
   * Waits until the run's watcher has reported the path with the explanation, and has passed the report on
   * in an 'aggregated' event. Then waits SETTLE_MS more, so that later events can arrive. Returns false if the
   * watcher doesn't report the path.
   */
  waitForReportAsync(relativePath: string, explanation: string): Promise<boolean>;
}

describe(WatchFileSystemAdapter.name, () => {
  let rootFolder: string;
  let writeCount: number;
  let adapter: WatchFileSystemAdapter;
  let watchSpy: jest.SpyInstance;
  let collectSpy: jest.SpyInstance;
  let closeSpy: jest.SpyInstance;

  function writeFile(relativePath: string, mtimeMs?: number): void {
    const filePath: string = path.join(rootFolder, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeCount++;
    fs.writeFileSync(filePath, `export const value: number = ${writeCount};\n`);
    const mtime: Date = new Date(mtimeMs ?? BASE_MTIME_MS + writeCount * 1000);
    fs.utimesSync(filePath, mtime, mtime);
  }

  // Drives the adapter the way TaskOperationRunner does in watch mode
  async function runAsync(options: IRunOptions = {}): Promise<IRun> {
    const { watch = true, beforeWatch } = options;
    adapter.setBaseline();
    const states: Map<string, IWatchedFileState> = await watchGlobAsync('src/**/*.ts', {
      cwd: rootFolder,
      fs: adapter
    });
    const changed: string[] = [];
    for (const [file, state] of states) {
      if (state.changed) {
        changed.push(file);
      }
    }
    changed.sort();

    await beforeWatch?.();

    let requested: boolean = false;
    let onRequest: (() => void) | undefined;
    const watcherCount: number = watchSpy.mock.contexts.length;
    if (watch) {
      adapter.watch(() => {
        requested = true;
        onRequest?.();
      });
    }

    // The reports of the run's watcher, as of its last 'aggregated' event
    const reports: Set<string> = new Set();
    let onReports: (() => void) | undefined;
    const watcher: Watchpack | undefined = watchSpy.mock.contexts[watcherCount];
    if (watcher) {
      let newReports: string[] = [];
      watcher.on('change', (filePath: string, modifiedTime: number, explanation: string) => {
        newReports.push(`${explanation}: ${filePath}`);
      });
      watcher.on('remove', (filePath: string, explanation: string) => {
        newReports.push(`${explanation}: ${filePath}`);
      });
      // Runs after the adapter's listener, which the adapter added first
      watcher.on('aggregated', () => {
        for (const report of newReports) {
          reports.add(report);
        }
        newReports = [];
        onReports?.();
      });
    }

    return {
      changed,
      isRunRequested: () => requested,
      waitForRunRequestAsync: () =>
        new Promise<boolean>((resolve: (value: boolean) => void) => {
          if (requested) {
            resolve(true);
            return;
          }
          const timeout: NodeJS.Timeout = setTimeout(() => resolve(false), RUN_REQUEST_TIMEOUT_MS);
          onRequest = () => {
            clearTimeout(timeout);
            resolve(true);
          };
        }),
      waitForReportAsync: async (relativePath: string, explanation: string): Promise<boolean> => {
        const report: string = `${explanation}: ${path.join(rootFolder, relativePath)}`;
        const isReported: boolean = await new Promise<boolean>((resolve: (value: boolean) => void) => {
          const timeout: NodeJS.Timeout = setTimeout(() => resolve(false), RUN_REQUEST_TIMEOUT_MS);
          onReports = () => {
            if (reports.has(report)) {
              clearTimeout(timeout);
              resolve(true);
            }
          };
          onReports();
        });
        await Async.sleepAsync(SETTLE_MS);
        return isReported;
      }
    };
  }

  // The first run's watcher may request a run just because the folders are new, so tests only use it to start
  async function startAsync(): Promise<void> {
    writeFile('src/a.ts');
    writeFile('src/sub/b.ts');
    const run: IRun = await runAsync();
    expect(run.changed).toEqual(['src/a.ts', 'src/sub/b.ts']);
    await Async.sleepAsync(SETTLE_MS);
  }

  // Also writes the file at NOTES_PATH. Returns the second run, whose watcher has scanned the files without
  // requesting a run. The next run collects that watcher's times.
  async function startWatchingAsync(): Promise<IRun> {
    writeFile(NOTES_PATH);
    await startAsync();
    const run2: IRun = await runAsync();
    expect(run2.changed).toEqual([]);
    await Async.sleepAsync(SETTLE_MS);
    expect(run2.isRunRequested()).toBe(false);
    return run2;
  }

  // Gives the file a future mtime, and waits until the run's watcher has recorded the change. Returns the mtime.
  async function changeBeforeNextRunAsync(run: IRun, relativePath: string): Promise<number> {
    const mtimeMs: number = Date.now() + FUTURE_MTIME_OFFSET_MS;
    writeFile(relativePath, mtimeMs);
    expect(await run.waitForRunRequestAsync()).toBe(true);
    await Async.sleepAsync(SETTLE_MS);
    return mtimeMs;
  }

  // Replaces watchpack's fs.lstat(). The handler calls lstatAsync() to do the fs.lstat() and give watchpack the
  // result.
  function interceptWatcherLstat(handler: (filePath: string, lstatAsync: () => Promise<void>) => void): void {
    const lstat: (filePath: string, callback: StatCallback) => void = watcherFs.lstat;
    jest.spyOn(watcherFs, 'lstat').mockImplementation(((filePath: string, callback: StatCallback) => {
      handler(filePath, async () => {
        await new Promise<void>((resolve: () => void) => {
          lstat(filePath, (error, stats) => {
            callback(error, stats);
            resolve();
          });
        });
      });
    }) as unknown as typeof watcherFs.lstat);
  }

  // Holds watchpack's next fs.lstat() of the file, as a slow file system can. Resolves when watchpack calls it,
  // with a function that finishes it.
  function holdNextWatcherLstatAsync(relativePath: string): Promise<(() => void) | undefined> {
    const heldPath: string = path.join(rootFolder, relativePath);
    return new Promise((resolve: (finish: (() => void) | undefined) => void) => {
      const timeout: NodeJS.Timeout = setTimeout(() => resolve(undefined), RUN_REQUEST_TIMEOUT_MS);
      let isHolding: boolean = false;
      interceptWatcherLstat((filePath: string, lstatAsync: () => Promise<void>) => {
        if (filePath === heldPath && !isHolding) {
          isHolding = true;
          clearTimeout(timeout);
          resolve(() => {
            void lstatAsync();
          });
        } else {
          void lstatAsync();
        }
      });
    });
  }

  // Holds watchpack's fs.lstat() of the folder until watchpack has finished its fs.lstat() of each of the files
  function holdWatcherFolderLstat(relativeFolderPath: string, fileNames: string[]): void {
    const folderPath: string = path.join(rootFolder, relativeFolderPath);
    const unreadFiles: Set<string> = new Set(fileNames.map((name: string) => path.join(folderPath, name)));
    let finishFolderLstat: (() => Promise<void>) | undefined;
    const finishWhenFilesAreRead = (): void => {
      if (finishFolderLstat && unreadFiles.size === 0) {
        void finishFolderLstat();
        finishFolderLstat = undefined;
      }
    };
    interceptWatcherLstat((filePath: string, lstatAsync: () => Promise<void>) => {
      if (filePath === folderPath) {
        finishFolderLstat = lstatAsync;
        finishWhenFilesAreRead();
      } else {
        void lstatAsync().then(() => {
          unreadFiles.delete(filePath);
          finishWhenFilesAreRead();
        });
      }
    });
  }

  beforeEach(() => {
    rootFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'heft-watch-fs-'));
    writeCount = 0;
    watchSpy = jest.spyOn(Watchpack.prototype, 'watch');
    collectSpy = jest.spyOn(Watchpack.prototype, 'collectTimeInfoEntries');
    closeSpy = jest.spyOn(Watchpack.prototype, 'close');
    adapter = new WatchFileSystemAdapter();
  });

  afterEach(() => {
    for (const watcher of watchSpy.mock.contexts) {
      (watcher as Watchpack).close();
    }
    jest.restoreAllMocks();
    fs.rmSync(rootFolder, { recursive: true, force: true });
  });

  it(
    'requests a run when a watched file changes, and reports the file in that run',
    async () => {
      await startAsync();

      const run2: IRun = await runAsync();
      expect(run2.changed).toEqual([]);
      await Async.sleepAsync(SETTLE_MS);
      expect(run2.isRunRequested()).toBe(false);

      writeFile('src/sub/b.ts');
      expect(await run2.waitForRunRequestAsync()).toBe(true);
      const run3: IRun = await runAsync();
      expect(run3.changed).toEqual(['src/sub/b.ts']);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'requests another run for a file that changes while a run is in progress',
    async () => {
      await startAsync();

      // The file changes after the glob has read it, and before the run starts watching
      const run2: IRun = await runAsync({
        beforeWatch: () => writeFile('src/sub/b.ts', Date.now())
      });
      expect(run2.changed).toEqual([]);
      expect(await run2.waitForRunRequestAsync()).toBe(true);
      const run3: IRun = await runAsync();
      expect(run3.changed).toEqual(['src/sub/b.ts']);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'closes the previous watcher, after collecting its times, when the next run starts',
    async () => {
      writeFile('src/a.ts');
      await runAsync();
      expect(watchSpy).toHaveBeenCalledTimes(1);
      const watcher1: Watchpack = watchSpy.mock.contexts[0];
      expect(closeSpy).not.toHaveBeenCalled();

      await runAsync();
      expect(watchSpy).toHaveBeenCalledTimes(2);
      const watcher2: Watchpack = watchSpy.mock.contexts[1];
      expect(watcher2).not.toBe(watcher1);
      expect(collectSpy).toHaveBeenCalledTimes(1);
      expect(collectSpy.mock.contexts[0]).toBe(watcher1);
      expect(closeSpy).toHaveBeenCalledTimes(1);
      expect(closeSpy.mock.contexts[0]).toBe(watcher1);
      expect(collectSpy.mock.invocationCallOrder[0]).toBeLessThan(closeSpy.mock.invocationCallOrder[0]);

      await runAsync();
      expect(closeSpy).toHaveBeenCalledTimes(2);
      expect(closeSpy.mock.contexts[1]).toBe(watcher2);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'reports a file that changed after a run that did not start watching',
    async () => {
      await startAsync();

      // Like a run in which copying files fails, so that TaskOperationRunner never calls watch()
      const run2: IRun = await runAsync({ watch: false });
      expect(run2.changed).toEqual([]);

      writeFile('src/sub/b.ts');
      await Async.sleepAsync(SETTLE_MS);
      const run3: IRun = await runAsync();
      expect(run3.changed).toEqual(['src/sub/b.ts']);
    },
    TEST_TIMEOUT_MS
  );

  // On Linux, a watch stays on the deleted folder. Windows doesn't let a watched folder be recreated.
  (process.platform === 'linux' ? it : it.skip)(
    'reports a change in a folder that was deleted and recreated, in the run after the change',
    async () => {
      await startAsync();

      const run2: IRun = await runAsync();
      expect(run2.changed).toEqual([]);
      await Async.sleepAsync(SETTLE_MS);

      // Delete and recreate the folder, as switching branches can
      fs.rmSync(path.join(rootFolder, 'src/sub'), { recursive: true });
      writeFile('src/sub/b.ts');
      expect(await run2.waitForRunRequestAsync()).toBe(true);
      await Async.sleepAsync(SETTLE_MS);

      const run3: IRun = await runAsync();
      expect(run3.changed).toEqual(['src/sub/b.ts']);
      await Async.sleepAsync(SETTLE_MS);
      expect(run3.isRunRequested()).toBe(false);

      writeFile('src/sub/b.ts');
      expect(await run3.waitForRunRequestAsync()).toBe(true);
      const run4: IRun = await runAsync();
      expect(run4.changed).toEqual(['src/sub/b.ts']);
      await Async.sleepAsync(SETTLE_MS);

      const run5: IRun = await runAsync();
      expect(run5.changed).toEqual([]);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'does not request a run for a file that changed before the run, but does for a later change',
    async () => {
      const run2: IRun = await startWatchingAsync();
      await changeBeforeNextRunAsync(run2, NOTES_PATH);

      // The new watcher reports the file, because of its mtime. The glob doesn't match it, but the previous
      // watcher's times show that it hasn't changed since the run started.
      const run3: IRun = await runAsync();
      expect(run3.changed).toEqual([]);
      expect(await run3.waitForReportAsync(NOTES_PATH, 'scan (file)')).toBe(true);
      expect(run3.isRunRequested()).toBe(false);

      writeFile('src/sub/b.ts');
      expect(await run3.waitForRunRequestAsync()).toBe(true);
      const run4: IRun = await runAsync();
      expect(run4.changed).toEqual(['src/sub/b.ts']);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'does not request another run for a watched file that changed before the run started',
    async () => {
      const run2: IRun = await startWatchingAsync();
      await changeBeforeNextRunAsync(run2, 'src/sub/b.ts');

      const run3: IRun = await runAsync();
      expect(run3.changed).toEqual(['src/sub/b.ts']);
      expect(await run3.waitForReportAsync('src/sub/b.ts', 'scan (file)')).toBe(true);
      expect(run3.isRunRequested()).toBe(false);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'does not request another run for a file that the first run read',
    async () => {
      writeFile('src/b.ts', Date.now() + FUTURE_MTIME_OFFSET_MS);
      await Async.sleepAsync(TIMESTAMP_GAP_MS);

      // There is no previous watcher, so only the time that the run read is known
      const run1: IRun = await runAsync();
      expect(run1.changed).toEqual(['src/b.ts']);
      expect(await run1.waitForReportAsync('src/b.ts', 'scan (file)')).toBe(true);
      expect(run1.isRunRequested()).toBe(false);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'requests a run for a file that is written again during the run, with the same mtime',
    async () => {
      const run2: IRun = await startWatchingAsync();
      const mtimeMs: number = await changeBeforeNextRunAsync(run2, NOTES_PATH);

      const run3: IRun = await runAsync({
        // The wait makes the file's ctime later than the run's start
        beforeWatch: () => Async.sleepAsync(TIMESTAMP_GAP_MS).then(() => writeFile(NOTES_PATH, mtimeMs))
      });
      expect(run3.changed).toEqual([]);
      expect(await run3.waitForRunRequestAsync()).toBe(true);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'does not request a run for a file whose change the previous watcher had not finished reading',
    async () => {
      await startWatchingAsync();
      const lstatHeld: Promise<(() => void) | undefined> = holdNextWatcherLstatAsync(NOTES_PATH);
      writeFile(NOTES_PATH, Date.now() + FUTURE_MTIME_OFFSET_MS);
      const finishLstat: (() => void) | undefined = await lstatHeld;
      expect(finishLstat).toBeDefined();
      await Async.sleepAsync(TIMESTAMP_GAP_MS);

      // The run starts while the previous watcher still has the file's old time
      const run3: IRun = await runAsync();
      finishLstat?.();
      expect(run3.changed).toEqual([]);
      expect(await run3.waitForReportAsync(NOTES_PATH, 'scan (file)')).toBe(true);
      expect(run3.isRunRequested()).toBe(false);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'reports a watched file whose change the previous watcher had not finished reading, in that run',
    async () => {
      await startWatchingAsync();
      const lstatHeld: Promise<(() => void) | undefined> = holdNextWatcherLstatAsync('src/sub/b.ts');
      writeFile('src/sub/b.ts', Date.now() + FUTURE_MTIME_OFFSET_MS);
      const finishLstat: (() => void) | undefined = await lstatHeld;
      expect(finishLstat).toBeDefined();
      await Async.sleepAsync(TIMESTAMP_GAP_MS);

      const run3: IRun = await runAsync();
      finishLstat?.();
      expect(run3.changed).toEqual(['src/sub/b.ts']);
      expect(await run3.waitForReportAsync('src/sub/b.ts', 'scan (file)')).toBe(true);
      expect(run3.isRunRequested()).toBe(false);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'does not request a run when a folder that the run read is reported as its watcher is attached',
    async () => {
      const run2: IRun = await startWatchingAsync();
      await changeBeforeNextRunAsync(run2, NOTES_PATH);

      // The watcher of src attaches to the watcher of src/sub when its fs.lstat() of src/sub finishes. If
      // src/sub's watcher has read a file with a new time by then, the watcher reports src/sub.
      const run3: IRun = await runAsync({
        beforeWatch: () => holdWatcherFolderLstat('src/sub', ['b.ts', 'notes.txt'])
      });
      expect(run3.changed).toEqual([]);
      expect(await run3.waitForReportAsync('src/sub', 'watch (outdated on attach)')).toBe(true);
      expect(run3.isRunRequested()).toBe(false);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'requests a run for a file system event, even if the file looks unchanged',
    async () => {
      const run2: IRun = await startWatchingAsync();
      const mtimeMs: number = await changeBeforeNextRunAsync(run2, NOTES_PATH);
      const run3: IRun = await runAsync();
      expect(await run3.waitForReportAsync(NOTES_PATH, 'scan (file)')).toBe(true);

      // Where timestamps are coarse, a file's ctime may be earlier than the run's start, although the file
      // changed after it
      const notesPath: string = path.join(rootFolder, NOTES_PATH);
      const lstatSync: typeof fs.lstatSync = nodeFs.lstatSync;
      jest.spyOn(nodeFs, 'lstatSync').mockImplementation(((
        filePath: fs.PathLike,
        options?: fs.StatSyncOptions
      ) => {
        const stats: fs.Stats | undefined = lstatSync(filePath, options) as fs.Stats | undefined;
        if (stats && filePath === notesPath) {
          stats.ctimeMs = BASE_MTIME_MS;
        }
        return stats;
      }) as unknown as typeof fs.lstatSync);
      writeFile(NOTES_PATH, mtimeMs);
      expect(await run3.waitForRunRequestAsync()).toBe(true);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'requests a run for a watched file that is deleted during the run',
    async () => {
      await startWatchingAsync();

      const run3: IRun = await runAsync({
        beforeWatch: () => fs.unlinkSync(path.join(rootFolder, 'src/sub/b.ts'))
      });
      expect(run3.changed).toEqual([]);
      expect(await run3.waitForRunRequestAsync()).toBe(true);
    },
    TEST_TIMEOUT_MS
  );
});
