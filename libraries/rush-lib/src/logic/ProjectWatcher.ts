// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as readline from 'node:readline';
import { once } from 'node:events';

import { getRepoRoot } from '@rushstack/package-deps-hash';
import { Path } from '@rushstack/node-core-library';
import { Colorize, type ITerminal } from '@rushstack/terminal';

import { Git } from './Git';
import type { IInputsSnapshot } from './incremental/InputsSnapshot';
import type { RushConfiguration } from '../api/RushConfiguration';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import type { IOperationGraph, IOperationGraphIterationOptions } from '../pluginFramework/PhasedCommandHooks';
import type { Operation } from './operations/Operation';
import { OperationStatus } from './operations/OperationStatus';

export interface IProjectWatcherOptions {
  graph: IOperationGraph;
  debounceMs: number;
  rushConfiguration: RushConfiguration;
  terminal: ITerminal;
  /** Initial inputs snapshot; required so watcher can enumerate nested folders immediately */
  initialSnapshot: IInputsSnapshot;
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
  private readonly _debounceMs: number;
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _terminal: ITerminal;
  private readonly _graph: IOperationGraph;

  private _repoRoot: string | undefined;
  private _watchers: Map<string, fs.FSWatcher> | undefined;
  private _closePromises: Promise<void>[] = [];
  private _debounceHandle: NodeJS.Timeout | undefined;
  private _isWatching: boolean = false;
  private _lastStatus: string | undefined;
  private _renderedStatusLines: number = 0;
  private _lastSnapshot: IInputsSnapshot | undefined;
  private _stdinListening: boolean = false;
  private _stdinHadRawMode: boolean | undefined;
  private _onStdinDataBound: ((chunk: Buffer | string) => void) | undefined;

  public constructor(options: IProjectWatcherOptions) {
    const { graph, debounceMs, rushConfiguration, terminal, initialSnapshot } = options;
    this._graph = graph;
    this._debounceMs = debounceMs;
    this._rushConfiguration = rushConfiguration;
    this._terminal = terminal;
    this._lastSnapshot = initialSnapshot; // Seed snapshot

    const gitPath: string = new Git(rushConfiguration).getGitPathOrThrow();
    this._repoRoot = Path.convertToSlashes(getRepoRoot(rushConfiguration.rushJsonFolder, gitPath));

    // Initialize stdin listener early so keybinds are available immediately
    this._ensureStdin();

    // Capture snapshot (if provided) prior to executing next iteration (will replace initial snapshot)
    this._graph.hooks.beforeExecuteIterationAsync.tapPromise(
      'ProjectWatcher',
      async (
        records: ReadonlyMap<Operation, unknown>,
        iterationOptions: IOperationGraphIterationOptions
      ): Promise<void> => {
        this.clearStatus();
        this._lastSnapshot = iterationOptions.inputsSnapshot;
        await this._stopWatchingAsync();
      }
    );

    // Start watching once execution loop enters waiting state
    this._graph.hooks.onWaitingForChanges.tap('ProjectWatcher', () => {
      this._startWatching();
    });

    // Dispose stdin listener when session aborts
    this._graph.abortController.signal.addEventListener(
      'abort',
      () => {
        this._disposeStdin();
      },
      { once: true }
    );
  }

  public clearStatus(): void {
    this._renderedStatusLines = 0;
  }

  public rerenderStatus(): void {
    this._setStatus(this._lastStatus ?? 'Waiting for changes...');
  }

  private _setStatus(status: string): void {
    const isPaused: boolean = this._graph.pauseNextIteration === true;
    const hasScheduledIteration: boolean = this._graph.hasScheduledIteration;
    const modeLabel: string = isPaused ? 'PAUSED' : 'WATCHING';
    const pendingLabel: string = hasScheduledIteration ? ' PENDING' : '';
    const statusLines: string[] = [`[${modeLabel}${pendingLabel}] Watch Status: ${status}`];
    if (this._stdinListening) {
      const em: IOperationGraph = this._graph;
      const lines: string[] = [];
      // First line: modes
      lines.push(
        ` debug:${em.debugMode ? 'on' : 'off'} verbose:${!em.quietMode ? 'on' : 'off'} parallel:${em.parallelism}`
      );
      // Second line: keybind help kept concise to avoid overwhelming output
      lines.push(
        ' keys(active): [q]quit [a]abort-iteration [i]invalidate [x]close-runners [d]debug ' +
          '[v]verbose [w]pause/resume [b]build [+/-]parallelism'
      );
      statusLines.push(...lines.map((l) => `  ${l}`));
    }
    if (this._graph.status !== OperationStatus.Executing) {
      // If rendering during execution, don't try to clean previous output.
      if (this._renderedStatusLines > 0) {
        readline.cursorTo(process.stdout, 0);
        readline.moveCursor(process.stdout, 0, -this._renderedStatusLines);
        readline.clearScreenDown(process.stdout);
      }
      this._renderedStatusLines = statusLines.length;
    }
    this._lastStatus = status;
    this._terminal.writeLine(Colorize.bold(Colorize.cyan(statusLines.join('\n'))));
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

  private _startWatching(): void {
    if (this._isWatching) {
      return;
    }
    this._isWatching = true;
    // leverage manager's abort controller so that aborting the session halts watchers
    const sessionAbortSignal: AbortSignal = this._graph.abortController.signal;
    const repoRoot: string = Path.convertToSlashes(this._rushConfiguration.rushJsonFolder);
    const useNativeRecursiveWatch: boolean = os.platform() === 'win32' || os.platform() === 'darwin';
    const operations: ReadonlySet<Operation> = this._graph.operations;

    const projectFolders: Set<string> = new Set();
    for (const op of operations) {
      projectFolders.add(Path.convertToSlashes(op.associatedProject.projectFolder));
    }

    // Derive nested folder list if on Linux (no native recursive) and snapshot available
    let foldersToWatch: Set<string> = new Set();
    if (!useNativeRecursiveWatch && this._lastSnapshot) {
      for (const op of operations) {
        const { associatedProject: rushProject } = op;
        const tracked: ReadonlyMap<string, string> | undefined =
          this._lastSnapshot.getTrackedFileHashesForOperation(rushProject);
        if (!tracked) {
          continue;
        }
        const prefixLength: number = rushProject.projectFolder.length - repoRoot.length - 1;
        for (const relPrefix of ProjectWatcher._enumeratePathsToWatch(tracked.keys(), prefixLength)) {
          foldersToWatch.add(`${this._repoRoot}/${relPrefix}`);
        }
      }
    }
    if (!useNativeRecursiveWatch && foldersToWatch.size === 0) {
      // Fallback to project roots if snapshot missing
      foldersToWatch = projectFolders;
    }

    const watchers: Map<string, fs.FSWatcher> = (this._watchers = new Map());

    const addWatcher = (watchedPath: string, recursive: boolean): void => {
      if (watchers.has(watchedPath)) {
        return;
      }
      try {
        const watcher: fs.FSWatcher = fs.watch(
          watchedPath,
          {
            encoding: 'utf-8',
            recursive: recursive && useNativeRecursiveWatch,
            signal: sessionAbortSignal
          },
          (eventType, fileName) => this._onFsEvent(watchedPath, fileName)
        );
        watchers.set(watchedPath, watcher);
        this._closePromises.push(
          once(watcher, 'close').then(() => {
            watchers.delete(watchedPath);
            watcher.removeAllListeners();
            watcher.unref();
          })
        );
      } catch (e) {
        this._terminal.writeDebugLine(`Failed to watch path ${watchedPath}: ${(e as Error).message}`);
      }
    };

    // Always watch repo root and common config
    addWatcher(repoRoot, false);
    addWatcher(Path.convertToSlashes(this._rushConfiguration.commonRushConfigFolder), false);
    if (useNativeRecursiveWatch) {
      for (const folder of projectFolders) {
        addWatcher(folder, true);
      }
    } else {
      for (const folder of foldersToWatch) {
        addWatcher(folder, true);
      }
    }
    this._setStatus('Waiting for changes...');
  }

  private async _stopWatchingAsync(): Promise<void> {
    if (!this._isWatching) {
      return;
    }
    this._isWatching = false;
    if (this._debounceHandle) {
      clearTimeout(this._debounceHandle);
      this._debounceHandle = undefined;
    }
    if (this._watchers) {
      for (const watcher of this._watchers.values()) {
        watcher.close();
      }
    }
    await Promise.all(this._closePromises);
    this._closePromises = [];
    this._watchers = undefined;
    this._terminal.writeDebugLine('ProjectWatcher: watchers stopped');
  }

  private _onFsEvent(root: string, fileName: string | null): void {
    if (fileName === '.git' || fileName === 'node_modules') {
      return;
    }
    if (this._debounceHandle) {
      clearTimeout(this._debounceHandle);
    }
    this._debounceHandle = setTimeout(() => this._scheduleIteration(), this._debounceMs);
  }

  private _scheduleIteration(): void {
    this._setStatus('File change detected. Queuing new iteration...');
    this._graph
      .scheduleIterationAsync({} as IOperationGraphIterationOptions)
      .catch((e: unknown) =>
        this._terminal.writeErrorLine(`Failed to queue iteration: ${(e as Error).message}`)
      );
  }

  /** Setup stdin listener for interactive keybinds */
  private _ensureStdin(): void {
    if (this._stdinListening || !process.stdin.isTTY) {
      return;
    }
    const stdin: NodeJS.ReadStream = process.stdin as NodeJS.ReadStream;
    // Node's ReadStream has an undocumented isRaw property when setRawMode has been used.
    // Capture it in a type-safe way.
    this._stdinHadRawMode =
      typeof (stdin as unknown as { isRaw?: boolean }).isRaw === 'boolean'
        ? (stdin as unknown as { isRaw?: boolean }).isRaw
        : undefined; // capture existing raw state
    try {
      stdin.setRawMode?.(true);
    } catch {
      // ignore if cannot set raw mode
    }
    stdin.resume();
    stdin.setEncoding('utf8');
    const handler = (chunk: Buffer | string): void => this._onStdinData(chunk.toString());
    stdin.on('data', handler);
    this._onStdinDataBound = handler;
    this._stdinListening = true;
  }

  private _disposeStdin(): void {
    if (!this._stdinListening) {
      return;
    }
    const stdin: NodeJS.ReadStream = process.stdin as NodeJS.ReadStream;
    if (this._onStdinDataBound) {
      stdin.off('data', this._onStdinDataBound);
      this._onStdinDataBound = undefined;
    }
    try {
      stdin.setRawMode?.(!!this._stdinHadRawMode);
    } catch {
      // ignore
    }
    stdin.unref();
    this._stdinListening = false;
  }

  private _onStdinData(chunk: string): void {
    const manager: IOperationGraph = this._graph;
    // Handle control characters
    if (!chunk) return;
    for (const ch of chunk) {
      switch (ch) {
        case 'q': // quit entire session
        case '\u0003': // Ctrl+C
          this._terminal.writeLine('Aborting watch session...');
          this._graph.abortController.abort();
          return; // stop processing further chars
        case 'a':
          void manager.abortCurrentIterationAsync().then(() => {
            this._setStatus('Current iteration aborted');
          });
          break;
        case 'i':
          manager.invalidateOperations(undefined, 'manual-invalidation');
          this._setStatus('All operations invalidated');
          break;
        case 'x':
          void manager.closeRunnersAsync().then(() => {
            this._setStatus('Closed all runners');
          });
          break;
        case 'd':
          manager.debugMode = !manager.debugMode;
          this._setStatus(`Debug mode ${manager.debugMode ? 'enabled' : 'disabled'}`);
          break;
        case 'v':
          manager.quietMode = !manager.quietMode;
          this._setStatus(`Verbose mode ${!manager.quietMode ? 'enabled' : 'disabled'}`);
          break;
        case 'w':
          // Toggle pauseNextIteration mode
          manager.pauseNextIteration = !manager.pauseNextIteration;
          this._setStatus(manager.pauseNextIteration ? 'Watch paused' : 'Watch resumed');
          break;
        case '+':
        case '=':
          this._adjustParallelism(1);
          break;
        case '-':
          this._adjustParallelism(-1);
          break;
        case 'b':
          // Queue and (if manual) execute
          void manager.scheduleIterationAsync({ startTime: performance.now() }).then((queued) => {
            if (queued) {
              if (manager.pauseNextIteration === true) {
                void manager.executeScheduledIterationAsync();
              }
              this._setStatus('Build iteration queued');
            } else {
              this._setStatus('No work to queue');
            }
          });
          break;
        default:
          // ignore other keys
          break;
      }
    }
  }

  private _adjustParallelism(delta: number): void {
    const manager: IOperationGraph = this._graph;
    const current: number = manager.parallelism;
    const requested: number = current + delta;
    manager.parallelism = requested; // setter will clamp/normalize
    const effective: number = manager.parallelism;
    if (effective !== current) {
      this._setStatus(`Parallelism set to ${effective}`);
    } else {
      this._setStatus(`Parallelism remains ${effective}`);
    }
  }
}
