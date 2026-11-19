// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';

import Watchpack from 'watchpack';

import {
  type IWatchpackPendingEventState,
  _tryGetWatchpackPendingEventState,
  _waitForWatchpackPendingEventsAsync
} from '../WatchpackUtilities';

const FOLDER_PATH: string = path.resolve('temp/test/WatchpackUtilities/src');

describe('WatchpackUtilities', () => {
  it('reports active file events and scans from watchpack internals', () => {
    const pendingEventState: IWatchpackPendingEventState | undefined = _tryGetWatchpackPendingEventState({
      watcherManager: {
        directoryWatchers: new Map([
          [
            FOLDER_PATH,
            {
              path: FOLDER_PATH,
              scanning: true,
              _activeEvents: new Map([['index.ts', true]])
            }
          ]
        ])
      }
    });

    expect(pendingEventState).toEqual({
      hasPendingEvents: true,
      pendingFileEvents: [
        {
          filePath: path.join(FOLDER_PATH, 'index.ts')
        }
      ]
    });
  });

  it.each([
    { field: 'path', directoryWatcher: { scanning: false, _activeEvents: new Map() } },
    { field: 'scanning', directoryWatcher: { path: FOLDER_PATH, _activeEvents: new Map() } },
    { field: '_activeEvents', directoryWatcher: { path: FOLDER_PATH, scanning: false } }
  ])('does not recognize a directory watcher without $field', ({ directoryWatcher }) => {
    expect(
      _tryGetWatchpackPendingEventState({
        watcherManager: { directoryWatchers: new Map([[FOLDER_PATH, directoryWatcher]]) }
      })
    ).toBeUndefined();
  });

  it('recognizes the directory watchers of a real watchpack watcher', () => {
    const folderPath: string = fs.mkdtempSync(path.join(os.tmpdir(), 'heft-watchpack-utilities-'));
    const watcher: Watchpack = new Watchpack({});
    try {
      watcher.watch({ directories: [folderPath], startTime: Date.now() });
      // watch() creates the folder's directory watcher, so the probe checks that watcher's fields.
      const { directoryWatchers } = (
        watcher as unknown as { watcherManager: { directoryWatchers: Map<string, object> } }
      ).watcherManager;
      expect(directoryWatchers.size).toBeGreaterThan(0);
      expect(_tryGetWatchpackPendingEventState(watcher)?.pendingFileEvents).toEqual([]);
    } finally {
      watcher.close();
      fs.rmSync(folderPath, { recursive: true, force: true });
    }
  });

  it('waits for the full pending-event window when watchpack internals are not recognized', async () => {
    const startTime: number = performance.now();

    await _waitForWatchpackPendingEventsAsync(
      () => ({}),
      () => false
    );

    const elapsedMs: number = performance.now() - startTime;
    expect(elapsedMs).toBeGreaterThanOrEqual(999);
    expect(elapsedMs).toBeLessThan(3000);
  });
});
