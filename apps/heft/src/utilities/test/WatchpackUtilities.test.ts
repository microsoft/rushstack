// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  type IWatchpackPendingEventState,
  _tryGetWatchpackPendingEventState,
  _waitForWatchpackPendingEventsAsync
} from '../WatchpackUtilities';

describe('WatchpackUtilities', () => {
  it('reports active file events and scans from watchpack internals', () => {
    const folderPath: string = path.resolve('temp/test/WatchpackUtilities/src');
    const pendingEventState: IWatchpackPendingEventState | undefined = _tryGetWatchpackPendingEventState({
      watcherManager: {
        directoryWatchers: new Map([
          [
            folderPath,
            {
              path: folderPath,
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
          filePath: path.join(folderPath, 'index.ts')
        }
      ]
    });
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
