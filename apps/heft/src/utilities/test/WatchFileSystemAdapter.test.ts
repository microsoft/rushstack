// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import Watchpack from 'watchpack';

import { Async } from '@rushstack/node-core-library';

import { watchGlobAsync } from '../../plugins/FileGlobSpecifier';
import { type IWatchedFileState, WatchFileSystemAdapter } from '../WatchFileSystemAdapter';

const RUN_REQUEST_TIMEOUT_MS: number = 5000;
// Long enough for a watcher to finish its first scan, and for events to arrive
const SETTLE_MS: number = 250;
const TEST_TIMEOUT_MS: number = 30000;
// An hour ago, plus some milliseconds so that watchpack sees the file system's timestamps are precise. Files get
// old mtimes so that a new watcher doesn't report a file as changed just because it was written right before
// the watcher started.
const BASE_MTIME_MS: number = Math.floor(Date.now() / 1000) * 1000 - 3600 * 1000 + 123;

interface IRunOptions {
  watch?: boolean;
  beforeWatch?: () => void;
}

interface IRun {
  changed: string[];
  isRunRequested(): boolean;
  waitForRunRequestAsync(): Promise<boolean>;
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

    beforeWatch?.();

    let requested: boolean = false;
    let onRequest: (() => void) | undefined;
    if (watch) {
      adapter.watch(() => {
        requested = true;
        onRequest?.();
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
        })
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
});
