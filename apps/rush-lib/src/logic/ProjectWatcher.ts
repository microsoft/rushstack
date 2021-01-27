// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FSWatcher } from 'chokidar';
import { PackageChangeAnalyzer } from './PackageChangeAnalyzer';
import { RushConfiguration } from '../api/RushConfiguration';
import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { Path } from '@rushstack/node-core-library';

export interface IProjectWatcherOptions {
  debounceMilliseconds?: number;
  rushConfiguration: RushConfiguration;
  selection: ReadonlySet<RushConfigurationProject>;
}

export interface IProjectChangeResult {
  changedProjects: ReadonlySet<RushConfigurationProject>;
  state: PackageChangeAnalyzer;
}

/**
 * This class is for incrementally watching a set of projects in the repository for changes.
 *
 * Calling `waitForChange()` will return a promise that resolves when the package-deps of one or
 * more projects differ from the value the previous time it was invoked. The first time will always resolve with the full selection.
 */
export class ProjectWatcher {
  private readonly _debounceMilliseconds: number;
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _selection: ReadonlySet<RushConfigurationProject>;

  private _initialState: PackageChangeAnalyzer | undefined;
  private _previousState: PackageChangeAnalyzer | undefined;

  public constructor(options: IProjectWatcherOptions) {
    const { debounceMilliseconds = 1000, rushConfiguration, selection } = options;

    this._debounceMilliseconds = debounceMilliseconds;
    this._rushConfiguration = rushConfiguration;
    this._selection = selection;
  }

  /**
   * Waits for a change to the package-deps of one or more of the selected projects, since the previous invocation.
   * Will return immediately the first time it is invoked, since no state has been recorded.
   * If no change is currently present, watches the source tree of all selected projects for file changes.
   */
  public async waitForChange(): Promise<IProjectChangeResult> {
    const initalChangeResult: IProjectChangeResult = this._computeChanged();
    if (initalChangeResult.changedProjects.size) {
      return initalChangeResult;
    }

    const watcher: FSWatcher = new FSWatcher({
      persistent: true,
      cwd: Path.convertToSlashes(this._rushConfiguration.rushJsonFolder),
      followSymlinks: false,
      ignoreInitial: true,
      ignored: /(?:^|[\\\/])node_modules/g,
      disableGlobbing: true,
      interval: 1000
    });

    for (const project of this._selection) {
      watcher.add(Path.convertToSlashes(project.projectFolder));
    }

    const watchedResult: IProjectChangeResult = await new Promise(
      (resolve: (result: IProjectChangeResult) => void, reject: (err: Error) => void) => {
        let timeout: NodeJS.Timeout | undefined;
        let terminated: boolean = false;

        const resolveIfChanged = (): void => {
          timeout = undefined;
          if (terminated) {
            return;
          }

          try {
            const result: IProjectChangeResult = this._computeChanged();
            if (result.changedProjects.size) {
              terminated = true;
              resolve(result);
            }
          } catch (err) {
            terminated = true;
            reject(err);
          }
        };

        watcher.on('all', () => {
          try {
            if (terminated) {
              return;
            }

            // Use a timeout to debounce changes, e.g. bulk copying files into the directory while the watcher is running.
            if (timeout) {
              clearTimeout(timeout);
            }

            timeout = setTimeout(resolveIfChanged, this._debounceMilliseconds);
          } catch (err) {
            terminated = true;
            reject(err);
          }
        });
      }
    );

    await watcher.close();

    return watchedResult;
  }

  private _computeChanged(): IProjectChangeResult {
    const state: PackageChangeAnalyzer = new PackageChangeAnalyzer(this._rushConfiguration);

    const previousState: PackageChangeAnalyzer | undefined = this._previousState;
    this._previousState = state;
    if (!this._initialState) {
      this._initialState = state;
    }

    if (!previousState) {
      return {
        changedProjects: this._selection,
        state
      };
    }

    const changedProjects: Set<RushConfigurationProject> = new Set();
    for (const project of this._selection) {
      const { packageName } = project;

      if (
        ProjectWatcher._haveProjectDepsChanged(
          previousState.getPackageDeps(packageName)!,
          state.getPackageDeps(packageName)!
        )
      ) {
        changedProjects.add(project);
      }
    }

    return {
      changedProjects,
      state
    };
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
}
