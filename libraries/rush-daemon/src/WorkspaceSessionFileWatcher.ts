// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  RushProjectConfiguration,
  type RushConfiguration,
  type RushConfigurationProject
} from '@microsoft/rush-lib';
import { NoOpTerminalProvider, Terminal } from '@rushstack/terminal';

import type { IWorkspaceInvalidationWatcher } from './WorkspaceSession';
import { createLinuxTreeWatcher, type LinuxTreeWatcher } from './LinuxTreeWatcher';

/** Options for the generation-owned workspace watcher. @beta */
export interface IWorkspaceSessionFileWatcherOptions {
  readonly onError?: (error: Error) => void;
  readonly rushConfiguration: RushConfiguration;
  readonly watchFactory?: WorkspaceWatchFactory;
  /** Initially observed projects. Omitted preserves the all-project behavior. */
  readonly projectNames?: Iterable<string>;
}

interface IWatchPath {
  readonly folderPath: string;
  readonly recursive: boolean;
  readonly project?: RushConfigurationProject;
}

/** Creates an individual filesystem watcher. @beta */
export type WorkspaceWatchFactory = (
  folderPath: string,
  options: { encoding: 'utf8'; recursive: boolean },
  listener: fs.WatchListener<string>
) => fs.FSWatcher;

const PATH_SEGMENT_SEPARATOR_REGEXP: RegExp = /[\\/]/;

/**
 * Keeps root/config observation permanent while allowing idle project watchers to be released.
 * Scope changes must be serialized with graph requests and generation disposal by the owner.
 * @beta
 */
export class WorkspaceSessionFileWatcher implements IWorkspaceInvalidationWatcher {
  readonly #onError: ((error: Error) => void) | undefined;
  readonly #watchFactory: WorkspaceWatchFactory | undefined;
  readonly #permanentPaths: ReadonlyArray<IWatchPath>;
  readonly #projectFolders: ReadonlyMap<string, string>;
  readonly #projects: ReadonlyMap<string, RushConfigurationProject>;
  readonly #initialProjectNames: ReadonlyArray<string>;
  readonly #watchers: Map<string, fs.FSWatcher> = new Map();
  readonly #closing: Map<fs.FSWatcher, Promise<void>> = new Map();
  #onInvalidation: ((changedPath?: string) => void) | undefined;
  #disposed: boolean = false;

  public constructor(options: IWorkspaceSessionFileWatcherOptions) {
    this.#onError = options.onError;
    this.#watchFactory = options.watchFactory;
    this.#permanentPaths = getPermanentWatchPaths(options.rushConfiguration);
    this.#projects = new Map(
      options.rushConfiguration.projects.map((project) => [project.packageName, project])
    );
    this.#projectFolders = new Map(
      options.rushConfiguration.projects.map((project) => [project.packageName, project.projectFolder])
    );
    this.#initialProjectNames = [...(options.projectNames ?? this.#projectFolders.keys())];
    this.#validateProjects(this.#initialProjectNames);
  }

  /** Projects whose recursive observation is still resident, including pending/failed closes. */
  public get watchedProjectNames(): ReadonlySet<string> {
    return new Set(
      [...this.#projectFolders].filter(([, folder]) => this.#watchers.has(folder)).map(([name]) => name)
    );
  }

  public async startAsync(onInvalidation: (changedPath?: string) => void): Promise<void> {
    if (this.#disposed) {
      throw new Error('The workspace watcher has already been disposed.');
    }
    if (this.#onInvalidation) {
      throw new Error('The workspace watcher has already been started.');
    }

    this.#onInvalidation = onInvalidation;
    for (const watchPath of this.#permanentPaths) {
      this.#watchers.set(watchPath.folderPath, this.#createWatcher(watchPath));
    }
    // Permanent config folders are small; finish registering them before initialization is acknowledged.
    await Promise.all(
      Array.from(this.#watchers.values(), (watcher) => (watcher as Partial<LinuxTreeWatcher>).initialWalk)
    );
    this.watchProjects(this.#initialProjectNames);
  }

  /** Restores project observation without running scripts. Does not suppress watcher errors. */
  public watchProjects(projectNames: Iterable<string>): void {
    if (this.#disposed || !this.#onInvalidation) {
      throw new Error('Project observation requires a started, live workspace watcher.');
    }
    const names: string[] = [...projectNames];
    this.#validateProjects(names);
    for (const name of names) {
      const folderPath: string = this.#projectFolders.get(name)!;
      const existing: fs.FSWatcher | undefined = this.#watchers.get(folderPath);
      if (existing && this.#closing.has(existing)) {
        throw new Error(`Project watcher is still closing: ${name}`);
      }
      if (!existing) {
        this.#watchers.set(
          folderPath,
          this.#createWatcher({ folderPath, recursive: true, project: this.#projects.get(name) })
        );
        // Cover the observation gap without claiming an unknown graph/configuration mutation.
        this.#onInvalidation(folderPath);
      }
    }
  }

  /** Awaits close before removing accounting. Permanent root/config watchers are never removed. */
  public async unwatchProjectsAsync(projectNames: Iterable<string>): Promise<void> {
    const names: string[] = [...projectNames];
    this.#validateProjects(names);
    const permanentFolders: Set<string> = new Set(this.#permanentPaths.map((entry) => entry.folderPath));
    const watchers: Set<fs.FSWatcher> = new Set();
    for (const name of names) {
      const folder: string = this.#projectFolders.get(name)!;
      const watcher: fs.FSWatcher | undefined = this.#watchers.get(folder);
      if (watcher && !permanentFolders.has(folder)) watchers.add(watcher);
    }
    await this.#closeWatchersAsync(watchers);
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.#disposed = true;
    await this.#closeWatchersAsync(this.#watchers.values());
    this.#onInvalidation = undefined;
  }

  #validateProjects(names: Iterable<string>): void {
    for (const name of names) {
      if (!this.#projectFolders.has(name)) throw new Error(`Unknown watched project: ${name}`);
    }
  }

  async #closeWatchersAsync(watchers: Iterable<fs.FSWatcher>): Promise<void> {
    const results: PromiseSettledResult<void>[] = await Promise.allSettled(
      [...watchers].map((watcher) => this.#closeWatcherAsync(watcher))
    );
    const errors: unknown[] = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : []
    );
    if (errors.length) throw new AggregateError(errors, 'Failed to close workspace project watchers.');
  }

  #closeWatcherAsync(watcher: fs.FSWatcher): Promise<void> {
    const existing: Promise<void> | undefined = this.#closing.get(watcher);
    if (existing) return existing;
    const closing: Promise<void> = new Promise<void>((resolve, reject) => {
      function cleanup(): void {
        watcher.off('close', onClose);
        watcher.off('error', onError);
      }
      function onClose(): void {
        cleanup();
        resolve();
      }
      function onError(error: Error): void {
        cleanup();
        reject(error);
      }
      watcher.once('close', onClose);
      watcher.once('error', onError);
      try {
        watcher.close();
      } catch (error) {
        cleanup();
        reject(error);
      }
    }).finally(() => this.#closing.delete(watcher));
    this.#closing.set(watcher, closing);
    return closing;
  }

  #createWatcher(watchPath: IWatchPath): fs.FSWatcher {
    const listener: fs.WatchListener<string> = (eventType: string, filename: string | null) => {
      void eventType;
      const changedFilename: string | undefined = filename ?? undefined;
      if (!isIgnoredPath(changedFilename)) {
        this.#onInvalidation?.(
          changedFilename === undefined ? undefined : path.resolve(watchPath.folderPath, changedFilename)
        );
      }
    };
    const watchOptions: { encoding: 'utf8'; recursive: boolean } = {
      encoding: 'utf8',
      recursive: watchPath.recursive
    };
    const watcher: fs.FSWatcher = this.#watchFactory
      ? this.#watchFactory(watchPath.folderPath, watchOptions, listener)
      : createDefaultWatcher(watchPath, watchOptions, listener);
    watcher.on('error', (error: Error) => {
      this.#onInvalidation?.();
      if (this.#onError) this.#onError(error);
      else process.emitWarning(error, { code: 'RUSH_DAEMON_WATCHER_ERROR' });
    });
    watcher.once('close', () => {
      if (this.#watchers.get(watchPath.folderPath) === watcher) {
        this.#watchers.delete(watchPath.folderPath);
      }
    });
    watcher.unref();
    return watcher;
  }
}

/**
 * Node's recursive `fs.watch` on Linux walks the tree synchronously and adds one inotify watch per file,
 * including build outputs. On Linux, recursive observation uses per-directory watches from an async walk instead.
 */
function createDefaultWatcher(
  watchPath: IWatchPath,
  watchOptions: { encoding: 'utf8'; recursive: boolean },
  listener: fs.WatchListener<string>
): fs.FSWatcher {
  if (process.platform !== 'linux' || !watchPath.recursive) {
    return fs.watch(watchPath.folderPath, watchOptions, listener);
  }
  const project: RushConfigurationProject | undefined = watchPath.project;
  return createLinuxTreeWatcher(watchPath.folderPath, listener, {
    getExcludedFolderPathsAsync: project ? () => getProjectExcludedFolderPathsAsync(project) : undefined,
    reportInitialWalkCompletion: project !== undefined
  });
}

/** The project's `.rush/temp` folder plus every declared operation output folder. @internal */
export async function getProjectExcludedFolderPathsAsync(
  project: RushConfigurationProject
): Promise<ReadonlySet<string>> {
  const excluded: Set<string> = new Set([path.resolve(project.projectRushTempFolder)]);
  const terminal: Terminal = new Terminal(new NoOpTerminalProvider());
  const configuration: RushProjectConfiguration | undefined =
    await RushProjectConfiguration.tryLoadForProjectAsync(project, terminal);
  const projectFolder: string = path.resolve(project.projectFolder);
  for (const settings of configuration?.operationSettingsByOperationName.values() ?? []) {
    for (const outputFolderName of settings.outputFolderNames ?? []) {
      const outputFolder: string = path.resolve(projectFolder, outputFolderName);
      // Never prune the project folder itself or anything outside it.
      if (outputFolder.startsWith(projectFolder + path.sep)) excluded.add(outputFolder);
    }
  }
  return excluded;
}

function getPermanentWatchPaths(rushConfiguration: RushConfiguration): ReadonlyArray<IWatchPath> {
  const recursiveFolders: Set<string> = new Set([rushConfiguration.commonRushConfigFolder]);
  for (const subspace of rushConfiguration.subspaces) {
    recursiveFolders.add(subspace.getSubspaceConfigFolderPath());
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
