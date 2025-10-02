// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as readline from 'node:readline';
import { once } from 'node:events';
import { getRepoRoot } from '@rushstack/package-deps-hash';
import { AlreadyReportedError, Path, type FileSystemStats, FileSystem } from '@rushstack/node-core-library';
import { Colorize, type ITerminal } from '@rushstack/terminal';

import { Git } from './Git';
import type { IInputsSnapshot, GetInputsSnapshotAsyncFn } from './incremental/InputsSnapshot';
import type { RushConfiguration } from '../api/RushConfiguration';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';

export interface IProjectWatcherOptions {
  abortSignal: AbortSignal;
  getInputsSnapshotAsync: GetInputsSnapshotAsyncFn;
  debounceMs?: number;
  rushConfiguration: RushConfiguration;
  projectsToWatch: ReadonlySet<RushConfigurationProject>;
  terminal: ITerminal;
  initialSnapshot?: IInputsSnapshot | undefined;
}

export interface IProjectChangeResult {
  /**
   * The set of projects that have changed since the last iteration
   */
  changedProjects: ReadonlySet<RushConfigurationProject>;
  /**
   * Contains the git hashes for all tracked files in the repo
   */
  inputsSnapshot: IInputsSnapshot;
}

export interface IPromptGeneratorFunction {
  (isPaused: boolean): Iterable<string>;
}

interface IPathWatchOptions {
  recurse: boolean;
}

/**
 * This class is for incrementally watching a set of projects in the repository for changes.
 *
 * We are manually using fs.watch() instead of `chokidar` because all we want from the file system watcher is a boolean
 * signal indicating that "at least 1 file in a watched project changed". We then defer to getInputsSnapshotAsync (which
 * is responsible for change detection in all incremental builds) to determine what actually chanaged.
 *
 * Calling `waitForChange()` will return a promise that resolves when the package-deps of one or
 * more projects differ from the value the previous time it was invoked. The first time will always resolve with the full selection.
 */
export class ProjectWatcher {
  private readonly _abortSignal: AbortSignal;
  private readonly _getInputsSnapshotAsync: GetInputsSnapshotAsyncFn;
  private readonly _debounceMs: number;
  private readonly _repoRoot: string;
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _projectsToWatch: ReadonlySet<RushConfigurationProject>;
  private readonly _terminal: ITerminal;

  private _initialSnapshot: IInputsSnapshot | undefined;
  private _previousSnapshot: IInputsSnapshot | undefined;
  private _forceChangedProjects: Map<RushConfigurationProject, string> = new Map();
  private _resolveIfChanged: undefined | (() => Promise<void>);
  private _onAbort: undefined | (() => void);
  private _getPromptLines: undefined | IPromptGeneratorFunction;

  private _lastStatus: string | undefined;
  private _renderedStatusLines: number;

  public isPaused: boolean = false;

  public constructor(options: IProjectWatcherOptions) {
    const {
      abortSignal,
      getInputsSnapshotAsync: snapshotProvider,
      debounceMs = 1000,
      rushConfiguration,
      projectsToWatch,
      terminal,
      initialSnapshot: initialState
    } = options;

    this._abortSignal = abortSignal;
    abortSignal.addEventListener('abort', () => {
      this._onAbort?.();
    });
    this._debounceMs = debounceMs;
    this._rushConfiguration = rushConfiguration;
    this._projectsToWatch = projectsToWatch;
    this._terminal = terminal;

    const gitPath: string = new Git(rushConfiguration).getGitPathOrThrow();
    this._repoRoot = Path.convertToSlashes(getRepoRoot(rushConfiguration.rushJsonFolder, gitPath));
    this._resolveIfChanged = undefined;
    this._onAbort = undefined;

    this._initialSnapshot = initialState;
    this._previousSnapshot = initialState;

    this._renderedStatusLines = 0;
    this._getPromptLines = undefined;
    this._getInputsSnapshotAsync = snapshotProvider;
  }

  public pause(): void {
    this.isPaused = true;
    this._setStatus('Project watcher paused.');
  }

  public resume(): void {
    this.isPaused = false;
    this._setStatus('Project watcher resuming...');
    if (this._resolveIfChanged) {
      this._resolveIfChanged().catch(() => {
        // Suppress unhandled promise rejection error
      });
    }
  }

  public invalidateProject(project: RushConfigurationProject, reason: string): boolean {
    if (this._forceChangedProjects.has(project)) {
      return false;
    }

    this._forceChangedProjects.set(project, reason);
    return true;
  }

  public invalidateAll(reason: string): void {
    for (const project of this._projectsToWatch) {
      this.invalidateProject(project, reason);
    }
  }

  public clearStatus(): void {
    this._renderedStatusLines = 0;
  }

  public rerenderStatus(): void {
    this._setStatus(this._lastStatus ?? 'Waiting for changes...');
  }

  public setPromptGenerator(promptGenerator: IPromptGeneratorFunction): void {
    this._getPromptLines = promptGenerator;
  }

  /**
   * Waits for a change to the package-deps of one or more of the selected projects, since the previous invocation.
   * Will return immediately the first time it is invoked, since no state has been recorded.
   * If no change is currently present, watches the source tree of all selected projects for file changes.
   * `waitForChange` is not allowed to be called multiple times concurrently.
   */
  public async waitForChangeAsync(onWatchingFiles?: () => void): Promise<IProjectChangeResult> {
    if (this.isPaused) {
      this._setStatus(`Project watcher paused.`);
      await new Promise<void>((resolve) => {
        this._resolveIfChanged = async () => resolve();
      });
    }

    const initialChangeResult: IProjectChangeResult = await this._computeChangedAsync();
    // Ensure that the new state is recorded so that we don't loop infinitely
    this._commitChanges(initialChangeResult.inputsSnapshot);
    if (initialChangeResult.changedProjects.size) {
      // We can't call `clear()` here due to the async tick in the end of _computeChanged
      for (const project of initialChangeResult.changedProjects) {
        this._forceChangedProjects.delete(project);
      }
      // TODO: _forceChangedProjects might be non-empty here, which will result in an immediate rerun after the next
      // run finishes. This is suboptimal, but the latency of _computeChanged is probably high enough that in practice
      // all invalidations will have been picked up already.
      return initialChangeResult;
    }

    const previousState: IInputsSnapshot = initialChangeResult.inputsSnapshot;
    const repoRoot: string = Path.convertToSlashes(this._rushConfiguration.rushJsonFolder);

    // Map of path to whether config for the path
    const pathsToWatch: Map<string, IPathWatchOptions> = new Map();

    // Node 12 supports the "recursive" parameter to fs.watch only on win32 and OSX
    // https://nodejs.org/docs/latest-v12.x/api/fs.html#fs_caveats
    const useNativeRecursiveWatch: boolean = os.platform() === 'win32' || os.platform() === 'darwin';

    if (useNativeRecursiveWatch) {
      // Watch the root non-recursively
      pathsToWatch.set(repoRoot, { recurse: false });

      // Watch the rush config folder non-recursively
      pathsToWatch.set(Path.convertToSlashes(this._rushConfiguration.commonRushConfigFolder), {
        recurse: false
      });

      for (const project of this._projectsToWatch) {
        // Use recursive watch in individual project folders
        pathsToWatch.set(Path.convertToSlashes(project.projectFolder), { recurse: true });
      }
    } else {
      for (const project of this._projectsToWatch) {
        const projectState: ReadonlyMap<string, string> =
          previousState.getTrackedFileHashesForOperation(project);

        const prefixLength: number = project.projectFolder.length - repoRoot.length - 1;
        // Watch files in the root of the project, or
        for (const pathToWatch of ProjectWatcher._enumeratePathsToWatch(projectState.keys(), prefixLength)) {
          pathsToWatch.set(`${this._repoRoot}/${pathToWatch}`, { recurse: true });
        }
      }
    }

    if (this._abortSignal.aborted) {
      return initialChangeResult;
    }

    const watchers: Map<string, fs.FSWatcher> = new Map();
    const closePromises: Promise<void>[] = [];

    const watchedResult: IProjectChangeResult = await new Promise(
      (resolve: (result: IProjectChangeResult) => void, reject: (err: Error) => void) => {
        let timeout: NodeJS.Timeout | undefined;
        let terminated: boolean = false;

        const terminal: ITerminal = this._terminal;

        const debounceMs: number = this._debounceMs;

        const abortSignal: AbortSignal = this._abortSignal;

        this.clearStatus();

        this._onAbort = function onAbort(): void {
          if (timeout) {
            clearTimeout(timeout);
          }
          terminated = true;
          resolve(initialChangeResult);
        };

        if (abortSignal.aborted) {
          return this._onAbort();
        }

        const resolveIfChanged: () => Promise<void> = (this._resolveIfChanged = async (): Promise<void> => {
          timeout = undefined;
          if (terminated) {
            return;
          }

          try {
            if (this.isPaused) {
              this._setStatus(`Project watcher paused.`);
              return;
            }

            this._setStatus(`Evaluating changes to tracked files...`);
            const result: IProjectChangeResult = await this._computeChangedAsync();
            this._setStatus(`Finished analyzing.`);

            // Need an async tick to allow for more file system events to be handled
            process.nextTick(() => {
              if (timeout) {
                // If another file has changed, wait for another pass.
                this._setStatus(`More file changes detected, aborting.`);
                return;
              }

              // Since there are multiple async ticks since the projects were enumerated in _computeChanged,
              // more could have been added in the interaval. Check and debounce.
              for (const project of this._forceChangedProjects.keys()) {
                if (!result.changedProjects.has(project)) {
                  this._setStatus(`More invalidations occurred, aborting.`);
                  timeout = setTimeout(resolveIfChanged, debounceMs);
                  return;
                }
              }

              this._commitChanges(result.inputsSnapshot);

              const hasForcedChanges: boolean = this._forceChangedProjects.size > 0;
              if (hasForcedChanges) {
                this._setStatus(
                  `Projects were invalidated: ${Array.from(new Set(this._forceChangedProjects.values())).join(
                    ', '
                  )}`
                );
                this.clearStatus();
              }
              this._forceChangedProjects.clear();

              if (result.changedProjects.size) {
                terminated = true;
                terminal.writeLine();
                resolve(result);
              } else {
                this._setStatus(`No changes detected to tracked files.`);
              }
            });
          } catch (err) {
            // eslint-disable-next-line require-atomic-updates
            terminated = true;
            terminal.writeLine();
            reject(err as NodeJS.ErrnoException);
          }
        });

        for (const [pathToWatch, { recurse }] of pathsToWatch) {
          addWatcher(pathToWatch, recurse);
        }

        if (onWatchingFiles) {
          onWatchingFiles();
        }

        this._setStatus(`Waiting for changes...`);

        function onError(err: Error): void {
          if (terminated) {
            return;
          }

          terminated = true;
          terminal.writeLine();
          reject(err);
        }

        function addWatcher(watchedPath: string, recursive: boolean): void {
          if (watchers.has(watchedPath)) {
            return;
          }
          const listener: fs.WatchListener<string> = changeListener(watchedPath, recursive);
          const watcher: fs.FSWatcher = fs.watch(
            watchedPath,
            {
              encoding: 'utf-8',
              recursive: recursive && useNativeRecursiveWatch,
              signal: abortSignal
            },
            listener
          );
          watchers.set(watchedPath, watcher);
          watcher.once('error', (err) => {
            watcher.close();
            onError(err);
          });
          closePromises.push(
            once(watcher, 'close').then(() => {
              watchers.delete(watchedPath);
              watcher.removeAllListeners();
              watcher.unref();
            })
          );
        }

        function innerListener(
          root: string,
          recursive: boolean,
          event: string,
          fileName: string | null
        ): void {
          try {
            if (terminated) {
              return;
            }

            if (fileName === '.git' || fileName === 'node_modules') {
              return;
            }

            // Handling for added directories
            if (recursive && !useNativeRecursiveWatch) {
              const decodedName: string = fileName ? fileName.toString() : '';
              const normalizedName: string = decodedName && Path.convertToSlashes(decodedName);
              const fullName: string = normalizedName && `${root}/${normalizedName}`;

              if (fullName && !watchers.has(fullName)) {
                try {
                  const stat: FileSystemStats = FileSystem.getStatistics(fullName);
                  if (stat.isDirectory()) {
                    addWatcher(fullName, true);
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

            timeout = setTimeout(resolveIfChanged, debounceMs);
          } catch (err) {
            terminated = true;
            terminal.writeLine();
            reject(err as NodeJS.ErrnoException);
          }
        }

        function changeListener(root: string, recursive: boolean): fs.WatchListener<string> {
          return innerListener.bind(0, root, recursive);
        }
      }
    ).finally(() => {
      this._onAbort = undefined;
      this._resolveIfChanged = undefined;
    });

    this._terminal.writeDebugLine(`Closing watchers...`);

    for (const watcher of watchers.values()) {
      watcher.close();
    }

    await Promise.all(closePromises);
    this._terminal.writeDebugLine(`Closed ${closePromises.length} watchers`);

    return watchedResult;
  }

  private _setStatus(status: string): void {
    const statusLines: string[] = [
      `[${this.isPaused ? 'PAUSED' : 'WATCHING'}] Watch Status: ${status}`,
      ...(this._getPromptLines?.(this.isPaused) ?? [])
    ];

    if (this._renderedStatusLines > 0) {
      readline.cursorTo(process.stdout, 0);
      readline.moveCursor(process.stdout, 0, -this._renderedStatusLines);
      readline.clearScreenDown(process.stdout);
    }
    this._renderedStatusLines = statusLines.length;
    this._lastStatus = status;

    this._terminal.writeLine(Colorize.bold(Colorize.cyan(statusLines.join('\n'))));
  }

  /**
   * Determines which, if any, projects (within the selection) have new hashes for files that are not in .gitignore
   */
  private async _computeChangedAsync(): Promise<IProjectChangeResult> {
    const currentSnapshot: IInputsSnapshot | undefined = await this._getInputsSnapshotAsync();

    if (!currentSnapshot) {
      throw new AlreadyReportedError();
    }

    const previousSnapshot: IInputsSnapshot | undefined = this._previousSnapshot;

    if (!previousSnapshot) {
      return {
        changedProjects: this._projectsToWatch,
        inputsSnapshot: currentSnapshot
      };
    }

    const changedProjects: Set<RushConfigurationProject> = new Set();
    for (const project of this._projectsToWatch) {
      const previous: ReadonlyMap<string, string> | undefined =
        previousSnapshot.getTrackedFileHashesForOperation(project);
      const current: ReadonlyMap<string, string> | undefined =
        currentSnapshot.getTrackedFileHashesForOperation(project);

      if (ProjectWatcher._haveProjectDepsChanged(previous, current)) {
        // May need to detect if the nature of the change will break the process, e.g. changes to package.json
        changedProjects.add(project);
      }
    }

    for (const project of this._forceChangedProjects.keys()) {
      changedProjects.add(project);
    }

    return {
      changedProjects,
      inputsSnapshot: currentSnapshot
    };
  }

  private _commitChanges(state: IInputsSnapshot): void {
    this._previousSnapshot = state;
    if (!this._initialSnapshot) {
      this._initialSnapshot = state;
    }
  }

  /**
   * Tests for inequality of the passed Maps. Order invariant.
   *
   * @returns `true` if the maps are different, `false` otherwise
   */
  private static _haveProjectDepsChanged(
    prev: ReadonlyMap<string, string> | undefined,
    next: ReadonlyMap<string, string> | undefined
  ): boolean {
    if (!prev && !next) {
      return false;
    }

    if (!prev || !next) {
      return true;
    }

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
