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

export class WorkspaceSessionFileWatcher implements IWorkspaceInvalidationWatcher {
  private readonly _onError: ((error: Error) => void) | undefined;
  private readonly _watchFactory: WorkspaceWatchFactory;
  private readonly _watchPaths: ReadonlyArray<IWatchPath>;
  private readonly _watchers: Set<fs.FSWatcher> = new Set();
  private _onInvalidation: ((changedPath?: string) => void) | undefined;
  private _disposed: boolean = false;

  public constructor(options: IWorkspaceSessionFileWatcherOptions) {
    this._onError = options.onError;
    this._watchFactory = options.watchFactory ?? fs.watch;
    this._watchPaths = getWatchPaths(options.rushConfiguration);
  }

  public async startAsync(onInvalidation: (changedPath?: string) => void): Promise<void> {
    if (this._disposed) {
      throw new Error('The workspace watcher has already been disposed.');
    }
    if (this._onInvalidation) {
      throw new Error('The workspace watcher has already been started.');
    }

    this._onInvalidation = onInvalidation;
    try {
      for (const watchPath of this._watchPaths) {
        this._watchers.add(this._createWatcher(watchPath));
      }
    } catch (error) {
      await this.disposeAsync();
      throw error;
    }
  }

  public async disposeAsync(): Promise<void> {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    const closePromises: Promise<unknown>[] = [];
    for (const watcher of this._watchers) {
      closePromises.push(once(watcher, 'close'));
      watcher.close();
    }
    await Promise.all(closePromises);
    this._watchers.clear();
    this._onInvalidation = undefined;
  }

  private _createWatcher(watchPath: IWatchPath): fs.FSWatcher {
    const watcher: fs.FSWatcher = this._watchFactory(
      watchPath.folderPath,
      { encoding: 'utf8', recursive: watchPath.recursive },
      (eventType: string, filename: string | null) => {
        void eventType;
        const changedFilename: string | undefined = filename ?? undefined;
        if (!isIgnoredPath(changedFilename)) {
          this._onInvalidation?.(
            changedFilename === undefined
              ? undefined
              : path.resolve(watchPath.folderPath, changedFilename)
          );
        }
      }
    );
    watcher.on('error', (error: Error) => {
      this._onInvalidation?.();
      this._onError?.(error);
    });
    watcher.once('close', () => this._watchers.delete(watcher));
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
    .split(/[\\/]/)
    .some((segment: string) => segment === '.git' || segment === 'node_modules');
}
