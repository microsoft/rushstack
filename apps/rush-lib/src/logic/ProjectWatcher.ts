// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'fs';
import * as os from 'os';
import { once } from 'events';
import { Path, ITerminal } from '@rushstack/node-core-library';

import { ProjectChangeAnalyzer } from './ProjectChangeAnalyzer';
import { RushConfiguration } from '../api/RushConfiguration';
import { RushConfigurationProject } from '../api/RushConfigurationProject';

export interface IProjectWatcherOptions {
  debounceMilliseconds?: number;
  rushConfiguration: RushConfiguration;
  projectsToWatch: ReadonlySet<RushConfigurationProject>;
  terminal: ITerminal;
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
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _projectsToWatch: ReadonlySet<RushConfigurationProject>;
  private readonly _terminal: ITerminal;

  private _initialState: ProjectChangeAnalyzer | undefined;
  private _previousState: ProjectChangeAnalyzer | undefined;

  public constructor(options: IProjectWatcherOptions) {
    const { debounceMilliseconds = 1000, rushConfiguration, projectsToWatch, terminal } = options;

    this._debounceMilliseconds = debounceMilliseconds;
    this._rushConfiguration = rushConfiguration;
    this._projectsToWatch = projectsToWatch;
    this._terminal = terminal;
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

    for (const project of this._projectsToWatch) {
      const projectState: Map<string, string> = (await previousState._tryGetProjectDependenciesAsync(
        project,
        this._terminal
      ))!;
      const projectFolder: string = project.projectRelativeFolder;
      // Watch files in the root of the project, or
      for (const fileName of projectState.keys()) {
        for (const pathToWatch of ProjectWatcher._enumeratePathsToWatch(
          fileName,
          projectFolder,
          useNativeRecursiveWatch
        )) {
          pathsToWatch.add(`${repoRoot}/${pathToWatch}`);
        }
      }
    }

    const watchers: Map<string, fs.FSWatcher> = new Map();

    const watchedResult: IProjectChangeResult = await new Promise(
      (resolve: (result: IProjectChangeResult) => void, reject: (err: Error) => void) => {
        let timeout: NodeJS.Timeout | undefined;
        let terminated: boolean = false;

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

        const onError = (err: Error): void => {
          if (terminated) {
            return;
          }

          terminated = true;
          reject(err);
        };

        const addWatcher = (
          watchedPath: string,
          listener: (event: string, fileName: string | Buffer) => void
        ): void => {
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
        };

        const changeListener = (event: string, fileName: string | Buffer): void => {
          try {
            if (terminated) {
              return;
            }

            // Handling for added directories
            if (!useNativeRecursiveWatch) {
              const decodedName: string = fileName && fileName.toString();
              const normalizedName: string = decodedName && Path.convertToSlashes(decodedName);

              if (normalizedName && !watchers.has(normalizedName)) {
                try {
                  const stat: fs.Stats = fs.statSync(fileName);
                  if (stat.isDirectory()) {
                    addWatcher(normalizedName, changeListener);
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

            timeout = setTimeout(resolveIfChanged, this._debounceMilliseconds);
          } catch (err) {
            terminated = true;
            reject(err as NodeJS.ErrnoException);
          }
        };

        for (const pathToWatch of pathsToWatch) {
          addWatcher(pathToWatch, changeListener);
        }

        if (onWatchingFiles) {
          onWatchingFiles();
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

  private static *_enumeratePathsToWatch(
    path: string,
    projectRelativeFolder: string,
    useNativeRecursiveWatch: boolean
  ): Iterable<string> {
    const rootSlashIndex: number = path.indexOf('/', projectRelativeFolder.length + 2);

    if (rootSlashIndex < 0) {
      yield path;
      return;
    }

    yield path.slice(0, rootSlashIndex);

    if (useNativeRecursiveWatch) {
      // Only need the root folder if fs.watch can be called with recursive: true
      return;
    }

    let slashIndex: number = path.lastIndexOf('/');
    while (slashIndex > rootSlashIndex) {
      yield path.slice(0, slashIndex);
      slashIndex = path.lastIndexOf('/', slashIndex - 1);
    }
  }
}
