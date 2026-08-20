// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { once } from 'node:events';

import type { RushConfiguration } from '@microsoft/rush-lib';

import type { IWorkspaceInvalidationWatcher } from './WorkspaceSession';

export interface IWorkspaceSessionFileWatcherOptions {
  readonly onError?: (error: Error) => void;
  readonly rushConfiguration: RushConfiguration;
  readonly watchFactory?: WorkspaceWatchFactory;
}

interface IWatchPath {
  readonly folderPath: string;
  readonly recursive: boolean;
}

type WorkspaceWatchFactory = (
  folderPath: string,
  options: { encoding: 'utf8'; recursive: boolean },
  listener: fs.WatchListener<string>
) => fs.FSWatcher;

const PATH_SEGMENT_SEPARATOR_REGEXP: RegExp = /[\\/]/;

export class WorkspaceSessionFileWatcher implements IWorkspaceInvalidationWatcher {
  readonly #onError: ((error: Error) => void) | undefined;
  readonly #watchFactory: WorkspaceWatchFactory;
  readonly #watchPaths: ReadonlyArray<IWatchPath>;
  readonly #watchers: Set<fs.FSWatcher> = new Set();
  #onInvalidation: ((changedPath?: string) => void) | undefined;
  #disposed: boolean = false;

  public constructor(options: IWorkspaceSessionFileWatcherOptions) {
    this.#onError = options.onError;
    this.#watchFactory = options.watchFactory ?? fs.watch;
    this.#watchPaths = getWatchPaths(options.rushConfiguration);
  }

  public async startAsync(onInvalidation: (changedPath?: string) => void): Promise<void> {
    if (this.#disposed) {
      throw new Error('The workspace watcher has already been disposed.');
    }
    if (this.#onInvalidation) {
      throw new Error('The workspace watcher has already been started.');
    }

    this.#onInvalidation = onInvalidation;
    for (const watchPath of this.#watchPaths) {
      this.#watchers.add(this.#createWatcher(watchPath));
    }
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    const closePromises: Promise<unknown>[] = [];
    for (const watcher of this.#watchers) {
      closePromises.push(once(watcher, 'close'));
      watcher.close();
    }
    await Promise.all(closePromises);
    this.#watchers.clear();
    this.#onInvalidation = undefined;
  }

  #createWatcher(watchPath: IWatchPath): fs.FSWatcher {
    const watcher: fs.FSWatcher = this.#watchFactory(
      watchPath.folderPath,
      { encoding: 'utf8', recursive: watchPath.recursive },
      (eventType: string, filename: string | null) => {
        void eventType;
        const changedFilename: string | undefined = filename ?? undefined;
        if (!isIgnoredPath(changedFilename)) {
          this.#onInvalidation?.(
            changedFilename === undefined
              ? undefined
              : path.resolve(watchPath.folderPath, changedFilename)
          );
        }
      }
    );
    watcher.on('error', (error: Error) => {
      this.#onInvalidation?.();
      this.#onError?.(error);
    });
    watcher.once('close', () => this.#watchers.delete(watcher));
    watcher.unref();
    return watcher;
  }
}

function getWatchPaths(rushConfiguration: RushConfiguration): ReadonlyArray<IWatchPath> {
  const recursiveFolders: Set<string> = new Set([rushConfiguration.commonRushConfigFolder]);
  for (const subspace of rushConfiguration.subspaces) {
    recursiveFolders.add(subspace.getSubspaceConfigFolderPath());
  }
  for (const project of rushConfiguration.projects) {
    recursiveFolders.add(project.projectFolder);
  }
  return [
    { folderPath: rushConfiguration.rushJsonFolder, recursive: false },
    ...Array.from(recursiveFolders, (folderPath: string) => ({ folderPath, recursive: true }))
  ];
}

function isIgnoredPath(filename: string | undefined): boolean {
  if (filename === undefined) {
    return false;
  }
  return filename
    .split(PATH_SEGMENT_SEPARATOR_REGEXP)
    .some((segment: string) => segment === '.git' || segment === 'node_modules');
}
