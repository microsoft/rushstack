// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { setImmediate as setImmediateAsync, setTimeout as setTimeoutAsync } from 'node:timers/promises';

/**
 * The longest time that {@link _waitForWatchpackPendingEventsAsync} waits for watchpack to finish recording
 * the file system events that it has received.
 */
const MAX_PENDING_EVENTS_WAIT_MS: number = 1000;
const PENDING_EVENTS_POLL_INTERVAL_MS: number = 1;

/**
 * A file system event that watchpack has received but has not finished recording.
 *
 * @internal
 */
export interface IWatchpackPendingFileEvent {
  /**
   * The full path of the file whose event is still being recorded.
   */
  filePath: string;
}

/**
 * The state of watchpack's pending file system events.
 *
 * @internal
 */
export interface IWatchpackPendingEventState {
  /**
   * True if any directory watcher is scanning, or if any file system event is still being recorded.
   */
  hasPendingEvents: boolean;

  /**
   * The file system events that watchpack has received but has not finished recording.
   */
  pendingFileEvents: ReadonlyArray<IWatchpackPendingFileEvent>;
}

/**
 * The fields of watchpack's internal `DirectoryWatcher` that show whether it is still recording a change.
 * They aren't part of watchpack's public API, so they are all optional.
 */
interface IDirectoryWatcherInternals {
  /**
   * The watched folder.
   */
  path?: string;

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
 * A watchpack instance with the internal state that this module inspects.
 */
interface IWatchpackWithInternals {
  watcherManager?: {
    directoryWatchers?: Map<string, IDirectoryWatcherInternals>;
  };
}

/**
 * Gets the file system events that watchpack has received but has not finished recording.
 *
 * @remarks
 * This helper centralizes the dependency on watchpack's internal `directoryWatchers` and `_activeEvents`
 * shapes. It returns `undefined` if those internals cannot be recognized, so callers that must not miss a
 * change can choose a conservative fallback.
 *
 * @internal
 */
export function _tryGetWatchpackPendingEventState(
  watcher: object | undefined
): IWatchpackPendingEventState | undefined {
  if (!watcher) {
    return {
      hasPendingEvents: false,
      pendingFileEvents: []
    };
  }

  const directoryWatchers: Map<string, IDirectoryWatcherInternals> | undefined = (
    watcher as IWatchpackWithInternals
  ).watcherManager?.directoryWatchers;
  if (!(directoryWatchers instanceof Map)) {
    return undefined;
  }

  let hasAnyPendingEvents: boolean = false;
  const pendingFileEvents: IWatchpackPendingFileEvent[] = [];
  for (const directoryWatcher of directoryWatchers.values()) {
    if (directoryWatcher.scanning) {
      hasAnyPendingEvents = true;
    }

    const { path: folderPath, _activeEvents: pendingNames } = directoryWatcher;
    if (!(pendingNames instanceof Map)) {
      continue;
    }

    if (pendingNames.size > 0) {
      hasAnyPendingEvents = true;
    }

    if (typeof folderPath !== 'string') {
      continue;
    }

    for (const name of pendingNames.keys()) {
      pendingFileEvents.push({
        filePath: path.join(folderPath, name)
      });
    }
  }

  return {
    hasPendingEvents: hasAnyPendingEvents,
    pendingFileEvents
  };
}

/**
 * Waits for watchpack to finish recording the file system events that it has already received.
 *
 * @remarks
 * Watchpack records a changed file only after an asynchronous `fs.lstat()` of it, so a caller can miss a
 * change if it reads aggregated changes before that `fs.lstat()` finishes. This method waits until the
 * directory watchers have no events or scans in progress, for up to 1 second. If watchpack's internals have an
 * unrecognized shape, this method waits for the same maximum instead of assuming that no events are pending.
 *
 * @internal
 */
export async function _waitForWatchpackPendingEventsAsync(
  getWatcher: () => object | undefined,
  hasChanges: () => boolean
): Promise<void> {
  // Let the event loop reach its poll phase, which delivers the OS events that were already queued when this
  // method was called. If this method was called during a poll phase, the first check phase comes before the
  // next poll phase, so it takes two turns.
  await setImmediateAsync();
  await setImmediateAsync();

  const deadline: number = performance.now() + MAX_PENDING_EVENTS_WAIT_MS;
  while (hasPendingEvents(getWatcher()) && performance.now() < deadline) {
    await setTimeoutAsync(PENDING_EVENTS_POLL_INTERVAL_MS);
  }

  if (hasChanges()) {
    const recordedTime: number = Date.now();
    while (Date.now() <= recordedTime) {
      await setTimeoutAsync(PENDING_EVENTS_POLL_INTERVAL_MS);
    }
  }
}

function hasPendingEvents(watcher: object | undefined): boolean {
  if (!watcher) {
    return false;
  }

  const pendingEventState: IWatchpackPendingEventState | undefined =
    _tryGetWatchpackPendingEventState(watcher);
  return pendingEventState ? pendingEventState.hasPendingEvents : true;
}
