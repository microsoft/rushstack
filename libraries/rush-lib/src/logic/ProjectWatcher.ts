// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'fs';
import * as os from 'os';
import { once } from 'events';
import { getRepoRoot } from '@rushstack/package-deps-hash';
import { Path, ITerminal, FileSystemStats, FileSystem } from '@rushstack/node-core-library';

import { Git } from './Git';
import { ProjectChangeAnalyzer } from './ProjectChangeAnalyzer';
import { RushConfiguration } from '../api/RushConfiguration';
import { RushConfigurationProject } from '../api/RushConfigurationProject';

export interface IProjectWatcherOptions {
  debounceMilliseconds?: number;
  rushConfiguration: RushConfiguration;
  projectsToWatch: ReadonlySet<RushConfigurationProject>;
  terminal: ITerminal;
  initialState?: ProjectChangeAnalyzer | undefined;
}

export interface IProjectChangeResult {
  /**
   * The set of projects that have changed since the last iteration
   */
  changedProjects: ReadonlySet<RushConfigurationProject>;
  /**
   * Contains the git hashes for all tracked files in the repo
   */
  state: ProjectChangeAnalyzer;
}

/**
 * This class is for incrementally watching a set of projects in the repository for changes.
 *
 * We are manually using fs.watch() instead of `chokidar` because all we want from the file system watcher is a boolean
 * signal indicating that "at least 1 file in a watched project changed". We then defer to ProjectChangeAnalyzer (which
 * is responsible for change detection in all incremental builds) to determine what actually chanaged.
 *
 * Calling `waitForChange()` will return a promise that resolves when the package-deps of one or
 * more projects differ from the value the previous time it was invoked. The first time will always resolve with the full selection.
 */
export class ProjectWatcher {
  private readonly _debounceMilliseconds: number;
  private readonly _repoRoot: string;
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _projectsToWatch: ReadonlySet<RushConfigurationProject>;
  private readonly _terminal: ITerminal;

  private _initialState: ProjectChangeAnalyzer | undefined;
  private _previousState: ProjectChangeAnalyzer | undefined;

  public constructor(options: IProjectWatcherOptions) {
    const {
      debounceMilliseconds = 1000,
      rushConfiguration,
      projectsToWatch,
      terminal,
      initialState
    } = options;

    this._debounceMilliseconds = debounceMilliseconds;
    this._rushConfiguration = rushConfiguration;
    this._projectsToWatch = projectsToWatch;
    this._terminal = terminal;

    const gitPath: string = new Git(rushConfiguration).getGitPathOrThrow();
    this._repoRoot = Path.convertToSlashes(getRepoRoot(rushConfiguration.rushJsonFolder, gitPath));

    this._initialState = initialState;
    this._previousState = initialState;
  }

  /**
   * Waits for a change to the package-deps of one or more of the selected projects, since the previous invocation.
   * Will return immediately the first time it is invoked, since no state has been recorded.
   * If no change is currently present, watches the source tree of all selected projects for file changes.
   */
  public async waitForChange(onWatchingFiles?: () => void): Promise<IProjectChangeResult> {
    const initialChangeResult: IProjectChangeResult = await this._computeChanged();
    // Ensure that the new state is recorded so that we don't loop infinitely
    this._commitChanges(initialChangeResult.state);
    if (initialChangeResult.changedProjects.size) {
      return initialChangeResult;
    }

    const previousState: ProjectChangeAnalyzer = initialChangeResult.state;
    const repoRoot: string = Path.convertToSlashes(this._rushConfiguration.rushJsonFolder);

    const pathsToWatch: Set<string> = new Set();

    // Node 12 supports the "recursive" parameter to fs.watch only on win32 and OSX
    // https://nodejs.org/docs/latest-v12.x/api/fs.html#fs_caveats
    const useNativeRecursiveWatch: boolean = os.platform() === 'win32' || os.platform() === 'darwin';

    if (useNativeRecursiveWatch) {
      // Watch the entire repository; a single recursive watcher is cheap.
      pathsToWatch.add(this._repoRoot);
    } else {
      for (const project of this._projectsToWatch) {
        const projectState: Map<string, string> = (await previousState._tryGetProjectDependenciesAsync(
          project,
          this._terminal
        ))!;

        const prefixLength: number = project.projectFolder.length - repoRoot.length - 1;
        // Watch files in the root of the project, or
        for (const pathToWatch of ProjectWatcher._enumeratePathsToWatch(projectState.keys(), prefixLength)) {
          pathsToWatch.add(`${this._repoRoot}/${pathToWatch}`);
        }
      }
    }

    const watchers: Map<string, fs.FSWatcher> = new Map();

    const watchedResult: IProjectChangeResult = await new Promise(
      (resolve: (result: IProjectChangeResult) => void, reject: (err: Error) => void) => {
        let timeout: NodeJS.Timeout | undefined;
        let terminated: boolean = false;

        const debounceMilliseconds: number = this._debounceMilliseconds;

        const resolveIfChanged = async (): Promise<void> => {
          timeout = undefined;
          if (terminated) {
            return;
          }

          try {
            const result: IProjectChangeResult = await this._computeChanged();

            // Need an async tick to allow for more file system events to be handled
            process.nextTick(() => {
              if (timeout) {
                // If another file has changed, wait for another pass.
                return;
              }

              this._commitChanges(result.state);

              if (result.changedProjects.size) {
                terminated = true;
                resolve(result);
              }
            });
          } catch (err) {
            // eslint-disable-next-line require-atomic-updates
            terminated = true;
            reject(err as NodeJS.ErrnoException);
          }
        };

        for (const pathToWatch of pathsToWatch) {
          addWatcher(pathToWatch);
        }

        if (onWatchingFiles) {
          onWatchingFiles();
        }

        function onError(err: Error): void {
          if (terminated) {
            return;
          }

          terminated = true;
          reject(err);
        }

        function addWatcher(watchedPath: string): void {
          const listener: (event: string, fileName: string) => void = changeListener(watchedPath);
          const watcher: fs.FSWatcher = fs.watch(
            watchedPath,
            {
              encoding: 'utf-8',
              recursive: useNativeRecursiveWatch
            },
            listener
          );
          watchers.set(watchedPath, watcher);
          watcher.on('error', (err) => {
            watchers.delete(watchedPath);
            onError(err);
          });
        }

        function innerListener(root: string, event: string, fileName: string): void {
          try {
            if (terminated) {
              return;
            }

            // Handling for added directories
            if (!useNativeRecursiveWatch) {
              const decodedName: string = fileName && fileName.toString();
              const normalizedName: string = decodedName && Path.convertToSlashes(decodedName);
              const fullName: string = normalizedName && `${root}/${normalizedName}`;

              if (fullName && !watchers.has(fullName)) {
                try {
                  const stat: FileSystemStats = FileSystem.getStatistics(fullName);
                  if (stat.isDirectory()) {
                    addWatcher(fullName);
                  }
                } catch (err) {
                  const code: string | undefined = (err as NodeJS.ErrnoException).code;

                  if (code !== 'ENOENT' && code !== 'ENOTDIR') {
                    throw err;
                  }
                }
              }
            }

            // Use a timeout to debounce changes, e.g. bulk copying files into the directory while the watcher is running.
            if (timeout) {
              clearTimeout(timeout);
            }

            timeout = setTimeout(resolveIfChanged, debounceMilliseconds);
          } catch (err) {
            terminated = true;
            reject(err as NodeJS.ErrnoException);
          }
        }

        function changeListener(root: string): (event: string, fileName: string) => void {
          return innerListener.bind(0, root);
        }
      }
    );

    const closePromises: Promise<void>[] = [];
    for (const [watchedPath, watcher] of watchers) {
      closePromises.push(
        once(watcher, 'close').then(() => {
          watchers.delete(watchedPath);
        })
      );
      watcher.close();
    }

    await Promise.all(closePromises);

    return watchedResult;
  }

  /**
   * Determines which, if any, projects (within the selection) have new hashes for files that are not in .gitignore
   */
  private async _computeChanged(): Promise<IProjectChangeResult> {
    const state: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(this._rushConfiguration);

    const previousState: ProjectChangeAnalyzer | undefined = this._previousState;

    if (!previousState) {
      return {
        changedProjects: this._projectsToWatch,
        state
      };
    }

    const changedProjects: Set<RushConfigurationProject> = new Set();
    for (const project of this._projectsToWatch) {
      const [previous, current] = await Promise.all([
        previousState._tryGetProjectDependenciesAsync(project, this._terminal),
        state._tryGetProjectDependenciesAsync(project, this._terminal)
      ]);

      if (ProjectWatcher._haveProjectDepsChanged(previous!, current!)) {
        // May need to detect if the nature of the change will break the process, e.g. changes to package.json
        changedProjects.add(project);
      }
    }

    return {
      changedProjects,
      state
    };
  }

  private _commitChanges(state: ProjectChangeAnalyzer): void {
    this._previousState = state;
    if (!this._initialState) {
      this._initialState = state;
    }
  }

  /**
   * Tests for inequality of the passed Maps. Order invariant.
   *
   * @returns `true` if the maps are different, `false` otherwise
   */
  private static _haveProjectDepsChanged(prev: Map<string, string>, next: Map<string, string>): boolean {
    if (prev.size !== next.size) {
      return true;
    }

    for (const [key, value] of prev) {
      if (next.get(key) !== value) {
        return true;
      }
    }

    return false;
  }

  private static *_enumeratePathsToWatch(paths: Iterable<string>, prefixLength: number): Iterable<string> {
    for (const path of paths) {
      const rootSlashIndex: number = path.indexOf('/', prefixLength);

      if (rootSlashIndex < 0) {
        yield path;
        return;
      }

      yield path.slice(0, rootSlashIndex);

      let slashIndex: number = path.indexOf('/', rootSlashIndex + 1);
      while (slashIndex >= 0) {
        yield path.slice(0, slashIndex);
        slashIndex = path.indexOf('/', slashIndex + 1);
      }
    }
  }
}
