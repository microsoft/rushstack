// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as TTypescript from 'typescript';

/**
 * The type of `TTypescript.System.watchFile`.
 */
export type WatchFileFunction = NonNullable<TTypescript.System['watchFile']>;

/**
 * The parts of the TypeScript API that {@link createExistenceAwareWatchFile} uses. TypeScript 3.7 and older have no
 * `WatchFileKind`.
 */
export type ExistenceAwareWatchFileTypeScript = Pick<typeof TTypescript, 'FileWatcherEventKind'> &
  Partial<Pick<typeof TTypescript, 'WatchFileKind'>>;

// TypeScript's `PollingInterval.Medium`, which it uses for missing files. Only used if the caller passes no interval.
const DEFAULT_MISSING_FILE_POLLING_INTERVAL_MS: number = 500;

/**
 * Wraps a TypeScript system's `watchFile`, so that a watcher reports `Created` or `Deleted`, instead of `Changed`,
 * when the watched file appeared or disappeared since the watcher's last event, and so that a watcher reports
 * `Created` when a missing file comes back, even if the system's watcher doesn't notice. Returns `undefined` if the
 * system can't watch files, and the system's own `watchFile` if TypeScript has no `WatchFileKind`.
 *
 * @remarks
 * A watch program acts on a missing file only when the file's watcher reports `Created`, and a watch program that was
 * created from a list of root files has no other way to notice that a missing root file is back. Without that event,
 * a root file that was missing when the program was updated stays "not found" (TS6053) until the process restarts.
 * TypeScript's `useFsEventsOnParentDirectory` file watcher doesn't always report it:
 *
 * - Except on macOS, it reports every event as `Changed`.
 *
 * - It watches the file's folder. If the folder was deleted, it watches the folder again only after the folder is
 *   back, and it reports nothing about the files that were written to the folder before then.
 *
 * So while the file is missing, the returned watcher also polls for it with TypeScript's polling file watcher, at the
 * caller's polling interval, or every 500 ms if the caller didn't pass one.
 *
 * TypeScript 3.7 and older have no `WatchFileKind`, so a watcher can't ask them for a polling file watcher.
 */
export function createExistenceAwareWatchFile(
  ts: ExistenceAwareWatchFileTypeScript,
  system: Pick<TTypescript.System, 'fileExists' | 'watchFile'>
): WatchFileFunction | undefined {
  const { watchFile: baseWatchFile } = system;
  const { WatchFileKind } = ts;
  if (!baseWatchFile || !WatchFileKind) {
    return baseWatchFile;
  }

  const { Created, Changed, Deleted } = ts.FileWatcherEventKind;
  const { PriorityPollingInterval } = WatchFileKind;
  return (
    fileName: string,
    callback: TTypescript.FileWatcherCallback,
    pollingInterval?: number,
    options?: TTypescript.WatchOptions
  ): TTypescript.FileWatcher => {
    let existed: boolean = system.fileExists(fileName);
    let closed: boolean = false;
    let missingFileWatcher: TTypescript.FileWatcher | undefined;

    const updateMissingFileWatcher = (): void => {
      if (existed || closed) {
        missingFileWatcher?.close();
        missingFileWatcher = undefined;
      } else if (!missingFileWatcher) {
        missingFileWatcher = baseWatchFile.call(
          system,
          fileName,
          (eventFileName: string, eventKind: TTypescript.FileWatcherEventKind, modifiedTime?: Date): void => {
            if (!existed && !closed && system.fileExists(fileName)) {
              existed = true;
              updateMissingFileWatcher();
              callback(eventFileName, Created, modifiedTime);
            }
          },
          pollingInterval ?? DEFAULT_MISSING_FILE_POLLING_INTERVAL_MS,
          { ...options, watchFile: PriorityPollingInterval }
        );
      }
    };

    const watcher: TTypescript.FileWatcher = baseWatchFile.call(
      system,
      fileName,
      (eventFileName: string, eventKind: TTypescript.FileWatcherEventKind, modifiedTime?: Date): void => {
        const exists: boolean = system.fileExists(fileName);
        let reportedEventKind: TTypescript.FileWatcherEventKind = eventKind;
        if (eventKind === Changed && exists !== existed) {
          reportedEventKind = exists ? Created : Deleted;
        }

        existed = exists;
        updateMissingFileWatcher();
        callback(eventFileName, reportedEventKind, modifiedTime);
      },
      pollingInterval,
      options
    );
    updateMissingFileWatcher();

    return {
      close: (): void => {
        closed = true;
        watcher.close();
        updateMissingFileWatcher();
      }
    };
  };
}

/**
 * Returns a copy of a TypeScript system with the given overrides, whose `watchFile` is what
 * {@link createExistenceAwareWatchFile} returns for the system.
 */
export function createSystemWithExistenceAwareWatchFile<
  TSystem extends Pick<TTypescript.System, 'fileExists' | 'watchFile'>
>(
  ts: ExistenceAwareWatchFileTypeScript,
  system: TSystem,
  overrides: Partial<Omit<TSystem, 'watchFile'>>
): TSystem {
  return {
    ...system,
    ...overrides,
    // So that a watch program notices when a missing root file comes back
    watchFile: createExistenceAwareWatchFile(ts, system)
  };
}
