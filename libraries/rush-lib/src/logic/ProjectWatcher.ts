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
import type { IOperationGraph, IOperationGraphIterationOptions } from './operations/IOperationGraph';
import type { IOperationExecutionResult } from './operations/IOperationExecutionResult';
import type { Operation } from './operations/Operation';
import { OperationStatus } from './operations/OperationStatus';

export interface IProjectWatcherOptions {
  graph: IOperationGraph;
  debounceMs: number;
  rushConfiguration: RushConfiguration;
  terminal: ITerminal;
  renderStatusInPlace?: boolean;
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

const KEY_QUIT: 'q' = 'q';
const KEY_ABORT: 'a' = 'a';
const KEY_INVALIDATE: 'i' = 'i';
const KEY_CLOSE_RUNNERS: 'x' = 'x';
const KEY_DEBUG: 'd' = 'd';
const KEY_VERBOSE: 'v' = 'v';
const KEY_PAUSE_RESUME: 'w' = 'w';
const KEY_BUILD: 'b' = 'b';
const KEY_PARALLELISM_UP: '+' = '+';
const KEY_PARALLELISM_DOWN: '-' = '-';

const KEYBIND_HELP: string =
  `[${KEY_QUIT}]quit [${KEY_ABORT}]abort-iteration [${KEY_INVALIDATE}]invalidate ` +
  `[${KEY_CLOSE_RUNNERS}]close-runners [${KEY_DEBUG}]debug [${KEY_VERBOSE}]verbose ` +
  `[${KEY_PAUSE_RESUME}]pause/resume [${KEY_BUILD}]build [${KEY_PARALLELISM_UP}/${KEY_PARALLELISM_DOWN}]parallelism`;

/**
 * The invalidation reason of the `i` keybind (and of rush-serve-plugin's `invalidate` command). It only marks
 * operations as stale; a separate build command runs them. Any other invalidation, such as an IPC runner's
 * `requestRun`, asks for the operations to run again, so the watcher queues an iteration for it.
 */
const MANUAL_INVALIDATION_REASON: 'manual-invalidation' = 'manual-invalidation';

/**
 * The statuses of an execution record that has not started executing in its iteration.
 */
const NOT_STARTED_STATUSES: ReadonlySet<OperationStatus> = new Set([
  OperationStatus.Waiting,
  OperationStatus.Ready,
  OperationStatus.Queued
]);

/**
 * An operation's request to run again, kept until an iteration that could serve it has finished.
 */
interface IRunRequest {
  readonly reason: string | undefined;
  /**
   * The id of the first iteration whose run of the operation starts after the request.
   */
  readonly servedByIterationId: number;
}

/**
 * Watches a set of projects in the repository for file changes and triggers
 * rebuild iterations on the operation graph. Also queues an iteration when an operation
 * asks to run again, for example when an IPC runner's process sends `requestRun`.
 *
 * Uses `fs.watch()` rather than `chokidar` because only a boolean "something changed"
 * signal is needed; actual change detection is deferred to `getInputsSnapshotAsync`.
 */
export class ProjectWatcher {
  readonly #debounceMs: number;
  readonly #rushConfiguration: RushConfiguration;
  readonly #terminal: ITerminal;
  readonly #graph: IOperationGraph;
  readonly #renderStatusInPlace: boolean;

  #repoRoot: string | undefined;
  #watchers: Map<string, fs.FSWatcher> | undefined;
  #closePromises: Promise<void>[] = [];
  #debounceHandle: NodeJS.Timeout | undefined;
  #isWatching: boolean = false;
  #lastStatus: string | undefined;
  #renderedStatusLines: number = 0;
  #lastSnapshot: IInputsSnapshot | undefined;
  #stdinListening: boolean = false;
  #stdinHadRawMode: boolean | undefined;
  #onStdinDataBound: ((chunk: Buffer | string) => void) | undefined;
  /**
   * The records of the iteration that most recently started executing, until the graph next goes idle.
   */
  #iterationRecords: ReadonlyMap<Operation, IOperationExecutionResult> | undefined;
  #lastIterationId: number = 0;
  readonly #runRequests: Map<Operation, IRunRequest> = new Map();
  /**
   * What the pending debounce will queue an iteration for.
   */
  #hasQueuedFileChange: boolean = false;
  readonly #queuedRunRequests: Set<string> = new Set();

  public constructor(options: IProjectWatcherOptions) {
    const {
      graph,
      debounceMs,
      rushConfiguration,
      terminal,
      initialSnapshot,
      renderStatusInPlace = true
    } = options;
    this.#graph = graph;
    this.#debounceMs = debounceMs;
    this.#rushConfiguration = rushConfiguration;
    this.#terminal = terminal;
    this.#renderStatusInPlace = renderStatusInPlace;
    this.#lastSnapshot = initialSnapshot; // Seed snapshot

    const gitPath: string = new Git(rushConfiguration).getGitPathOrThrow();
    this.#repoRoot = Path.convertToSlashes(getRepoRoot(rushConfiguration.rushJsonFolder, gitPath));

    // Initialize stdin listener early so keybinds are available immediately
    this.#ensureStdin();

    // Capture snapshot (if provided) prior to executing next iteration (will replace initial snapshot)
    graph.hooks.beforeExecuteIterationAsync.tapPromise(
      'ProjectWatcher',
      async (
        records: ReadonlyMap<Operation, IOperationExecutionResult>,
        iterationOptions: IOperationGraphIterationOptions
      ): Promise<void> => {
        this.clearStatus();
        this.#lastSnapshot = iterationOptions.inputsSnapshot;
        this.#iterationRecords = records;
        const firstRecord: IOperationExecutionResult | undefined = records.values().next().value;
        this.#lastIterationId = firstRecord?.iterationId ?? this.#lastIterationId;
        // This iteration serves the file changes and run requests that were waiting to queue one.
        this.#clearDebounce();
        await this.#stopWatchingAsync();
      }
    );

    // Start watching once execution loop enters waiting state
    graph.hooks.onIdle.tap('ProjectWatcher', () => {
      const iterationRecords: ReadonlyMap<Operation, IOperationExecutionResult> | undefined =
        this.#iterationRecords;
      this.#iterationRecords = undefined;
      this.#startWatching();
      if (iterationRecords) {
        this.#requeueUnservedRunRequests(iterationRecords);
      }
    });

    graph.hooks.onInvalidateOperations.tap(
      'ProjectWatcher',
      (operations: Iterable<Operation>, reason: string | undefined) => {
        this.#onInvalidateOperations(operations, reason);
      }
    );

    // Dispose stdin listener when session aborts
    graph.abortController.signal.addEventListener(
      'abort',
      () => {
        this.#clearDebounce();
        this.#disposeStdin();
      },
      { once: true }
    );
  }

  /**
   * Resets the rendered line count so the next status update does not attempt
   * to overwrite previously rendered lines.
   */
  public clearStatus(): void {
    this.#renderedStatusLines = 0;
  }

  /**
   * Re-renders the most recent status line (or a default) in place.
   */
  public rerenderStatus(): void {
    this.#setStatus(this.#lastStatus ?? 'Waiting for changes...');
  }

  /**
   * Renders the given status message to the terminal, preceded by mode indicators
   * and keybind help when stdin is active. Overwrites previously rendered status lines
   * when not mid-execution.
   */
  #setStatus(status: string): void {
    const graph: IOperationGraph = this.#graph;
    const isPaused: boolean = graph.pauseNextIteration === true;
    const hasScheduledIteration: boolean = graph.hasScheduledIteration;
    const modeLabel: string = isPaused ? 'PAUSED' : 'WATCHING';
    const pendingLabel: string = hasScheduledIteration ? ' PENDING' : '';
    const statusLines: string[] = [`[${modeLabel}${pendingLabel}] Watch Status: ${status}`];
    if (this.#stdinListening) {
      const lines: string[] = [];
      // First line: modes
      lines.push(
        ` debug:${graph.debugMode ? 'on' : 'off'} verbose:${!graph.quietMode ? 'on' : 'off'} parallel:${graph.parallelism}`
      );
      // Second line: keybind help kept concise to avoid overwhelming output
      lines.push(` keys(active): ${KEYBIND_HELP}`);
      statusLines.push(...lines.map((l) => `  ${l}`));
    }
    if (this.#renderStatusInPlace && graph.status !== OperationStatus.Executing) {
      // If rendering during execution, don't try to clean previous output.
      if (this.#renderedStatusLines > 0) {
        readline.cursorTo(process.stdout, 0);
        readline.moveCursor(process.stdout, 0, -this.#renderedStatusLines);
        readline.clearScreenDown(process.stdout);
      }
      this.#renderedStatusLines = statusLines.length;
    }
    this.#lastStatus = status;
    this.#terminal.writeLine(Colorize.bold(Colorize.cyan(statusLines.join('\n'))));
  }

  /**
   * Begins watching the file system for changes in all tracked project folders.
   * On platforms without native recursive watch support (Linux), enumerates nested
   * folders from the last snapshot to set up individual watchers.
   */
  #startWatching(): void {
    if (this.#isWatching) {
      return;
    }
    this.#isWatching = true;
    const sessionAbortSignal: AbortSignal = this.#graph.abortController.signal;
    const repoRoot: string = Path.convertToSlashes(this.#rushConfiguration.rushJsonFolder);
    const useNativeRecursiveWatch: boolean = os.platform() === 'win32' || os.platform() === 'darwin';
    const operations: ReadonlySet<Operation> = this.#graph.operations;

    const projectFolders: Set<string> = new Set();
    for (const op of operations) {
      projectFolders.add(Path.convertToSlashes(op.associatedProject.projectFolder));
    }

    // Derive nested folder list if on Linux (no native recursive) and snapshot available
    let foldersToWatch: Set<string> = new Set();
    if (!useNativeRecursiveWatch && this.#lastSnapshot) {
      for (const op of operations) {
        const { associatedProject: rushProject } = op;
        const tracked: ReadonlyMap<string, string> | undefined =
          this.#lastSnapshot.getTrackedFileHashesForOperation(rushProject);
        if (!tracked) {
          continue;
        }
        const prefixLength: number = rushProject.projectFolder.length - repoRoot.length - 1;
        for (const relPrefix of _enumeratePathsToWatch(tracked.keys(), prefixLength)) {
          foldersToWatch.add(`${this.#repoRoot}/${relPrefix}`);
        }
      }
    }
    if (!useNativeRecursiveWatch && foldersToWatch.size === 0) {
      // Fallback to project roots if snapshot missing
      foldersToWatch = projectFolders;
    }

    const watchers: Map<string, fs.FSWatcher> = (this.#watchers = new Map());

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
          (eventType, fileName) => this.#onFsEvent(fileName)
        );
        watchers.set(watchedPath, watcher);
        this.#closePromises.push(
          once(watcher, 'close').then(() => {
            watchers.delete(watchedPath);
            watcher.removeAllListeners();
            watcher.unref();
          })
        );
      } catch (e) {
        this.#terminal.writeDebugLine(`Failed to watch path ${watchedPath}: ${(e as Error).message}`);
      }
    };

    // Always watch repo root and common config
    addWatcher(repoRoot, false);
    addWatcher(Path.convertToSlashes(this.#rushConfiguration.commonRushConfigFolder), false);
    if (useNativeRecursiveWatch) {
      for (const folder of projectFolders) {
        addWatcher(folder, true);
      }
    } else {
      for (const folder of foldersToWatch) {
        addWatcher(folder, true);
      }
    }
    this.#setStatus('Waiting for changes...');
  }

  /**
   * Closes all active file system watchers and waits for their close events to settle.
   */
  async #stopWatchingAsync(): Promise<void> {
    if (!this.#isWatching) {
      return;
    }
    this.#isWatching = false;
    if (this.#debounceHandle) {
      clearTimeout(this.#debounceHandle);
      this.#debounceHandle = undefined;
    }
    if (this.#watchers) {
      for (const watcher of this.#watchers.values()) {
        watcher.close();
      }
    }
    await Promise.all(this.#closePromises);
    this.#closePromises = [];
    this.#watchers = undefined;
    this.#terminal.writeDebugLine('ProjectWatcher: watchers stopped');
  }

  /**
   * Handles a raw file system event by debouncing and scheduling an iteration.
   * Ignores changes to `.git` and `node_modules`.
   */
  #onFsEvent(fileName: string | null): void {
    if (fileName === '.git' || fileName === 'node_modules') {
      return;
    }
    this.#hasQueuedFileChange = true;
    this.#debounce();
  }

  /**
   * Queues an iteration after `debounceMs` without further file changes or run requests.
   */
  #debounce(): void {
    if (this.#graph.abortController.signal.aborted) {
      // The watch session has ended.
      return;
    }
    if (this.#debounceHandle) {
      clearTimeout(this.#debounceHandle);
    }
    this.#debounceHandle = setTimeout(() => this.#scheduleIteration(), this.#debounceMs);
  }

  #clearDebounce(): void {
    if (this.#debounceHandle) {
      clearTimeout(this.#debounceHandle);
      this.#debounceHandle = undefined;
    }
    this.#hasQueuedFileChange = false;
    this.#queuedRunRequests.clear();
  }

  /**
   * Schedules a new execution iteration on the graph in response to detected file changes
   * or run requests.
   */
  #scheduleIteration(): void {
    this.#debounceHandle = undefined;
    const runRequests: string[] = Array.from(this.#queuedRunRequests);
    const status: string =
      runRequests.length > 0 && !this.#hasQueuedFileChange
        ? `Run requested by ${runRequests.join(', ')}. Queuing new iteration...`
        : 'File change detected. Queuing new iteration...';
    this.#hasQueuedFileChange = false;
    this.#queuedRunRequests.clear();
    this.#setStatus(status);
    this.#graph
      .scheduleIterationAsync({})
      .catch((e: unknown) =>
        this.#terminal.writeErrorLine(`Failed to queue iteration: ${(e as Error).message}`)
      );
  }

  /**
   * Records operations that asked to run again. While the graph is idle, queues an iteration for them.
   * During an iteration, waits until the graph goes idle to check whether the iteration served them.
   */
  #onInvalidateOperations(operations: Iterable<Operation>, reason: string | undefined): void {
    if (reason === MANUAL_INVALIDATION_REASON) {
      return;
    }
    const isIdle: boolean = !this.#iterationRecords;
    for (const operation of operations) {
      this.#runRequests.set(operation, {
        reason,
        servedByIterationId: this.#getServingIterationId(operation)
      });
      if (isIdle) {
        this.#queuedRunRequests.add(reason ? `${operation.name} [${reason}]` : operation.name);
      }
    }
    if (isIdle) {
      this.#debounce();
    }
  }

  /**
   * Returns the id of the first iteration whose run of the operation would start after a request made now.
   */
  #getServingIterationId(operation: Operation): number {
    const record: IOperationExecutionResult | undefined = this.#iterationRecords?.get(operation);
    // A record that is already committed has finished, even if a deferred invalidation has reset it to Ready.
    const hasStarted: boolean =
      !record ||
      !NOT_STARTED_STATUSES.has(record.status) ||
      this.#graph.resultByOperation.get(operation) === record;
    return hasStarted ? this.#lastIterationId + 1 : this.#lastIterationId;
  }

  /**
   * Called when the graph goes idle after an iteration. Queues another iteration for each run request that
   * the iteration did not serve. The graph marks an invalidated operation's committed result as Ready, but
   * an iteration that was already running the operation then commits a newer result over it, so such a
   * request is invalidated again here.
   */
  #requeueUnservedRunRequests(iterationRecords: ReadonlyMap<Operation, IOperationExecutionResult>): void {
    const graph: IOperationGraph = this.#graph;
    // Operations whose result predates the request. They must be marked as stale again.
    const outdatedOperationsByReason: Map<string | undefined, Operation[]> = new Map();
    // Operations with no result, or whose result is still marked as stale. The next iteration runs them.
    const readyOperationsByReason: Map<string | undefined, Operation[]> = new Map();
    for (const [operation, { reason, servedByIterationId }] of this.#runRequests) {
      const result: IOperationExecutionResult | undefined = graph.resultByOperation.get(operation);
      const unmarkedResult: IOperationExecutionResult | undefined =
        result?.status === OperationStatus.Ready ? undefined : result;
      if (unmarkedResult && unmarkedResult.iterationId >= servedByIterationId) {
        continue;
      }
      const record: IOperationExecutionResult | undefined = iterationRecords.get(operation);
      if (record?.enabled && record.iterationId >= servedByIterationId) {
        // The operation was selected to run after the request, but did not produce a result, for example
        // because a dependency failed or the iteration was aborted. Do not retry it.
        continue;
      }
      const operationsByReason: Map<string | undefined, Operation[]> = unmarkedResult
        ? outdatedOperationsByReason
        : readyOperationsByReason;
      let group: Operation[] | undefined = operationsByReason.get(reason);
      if (!group) {
        group = [];
        operationsByReason.set(reason, group);
      }
      group.push(operation);
    }
    this.#runRequests.clear();
    for (const [reason, operations] of outdatedOperationsByReason) {
      // Fires onInvalidateOperations, which records the request again and queues an iteration.
      graph.invalidateOperations(operations, reason);
    }
    for (const [reason, operations] of readyOperationsByReason) {
      this.#onInvalidateOperations(operations, reason);
    }
  }

  /**
   * Sets up a raw-mode stdin listener so the user can interact with the watch session
   * via single-key keybinds. Captures the previous raw-mode state for restoration on dispose.
   */
  #ensureStdin(): void {
    if (this.#stdinListening || !process.stdin.isTTY) {
      return;
    }
    const stdin: NodeJS.ReadStream = process.stdin as NodeJS.ReadStream;
    // Node's ReadStream has an undocumented isRaw property when setRawMode has been used.
    // Capture it in a type-safe way.
    this.#stdinHadRawMode =
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
    const handler = (chunk: Buffer | string): void => this.#onStdinData(chunk.toString());
    stdin.on('data', handler);
    this.#onStdinDataBound = handler;
    this.#stdinListening = true;
  }

  /**
   * Removes the stdin listener and restores the previous raw-mode state.
   */
  #disposeStdin(): void {
    if (!this.#stdinListening) {
      return;
    }
    const stdin: NodeJS.ReadStream = process.stdin as NodeJS.ReadStream;
    if (this.#onStdinDataBound) {
      stdin.off('data', this.#onStdinDataBound);
      this.#onStdinDataBound = undefined;
    }
    try {
      stdin.setRawMode?.(!!this.#stdinHadRawMode);
    } catch {
      // ignore
    }
    stdin.unref();
    this.#stdinListening = false;
  }

  /**
   * Processes a chunk of stdin data, dispatching each character to the appropriate
   * keybind action on the operation graph.
   */
  #onStdinData(chunk: string): void {
    const graph: IOperationGraph = this.#graph;
    if (!chunk) return;
    for (const ch of chunk) {
      // Once aborted, only respond to Ctrl+C (force exit)
      if (graph.abortController.signal.aborted) {
        if (ch === '\u0003') {
          process.exit(1);
        }
        continue;
      }
      switch (ch) {
        case '\u0003':
        case KEY_QUIT: {
          this.#terminal.writeLine('Aborting watch session... (Ctrl+C to force exit)');
          graph.abortController.abort();
          break;
        }
        case KEY_ABORT: {
          void graph.abortCurrentIterationAsync().then(() => {
            this.#setStatus('Current iteration aborted');
          });
          break;
        }
        case KEY_INVALIDATE: {
          graph.invalidateOperations(undefined, MANUAL_INVALIDATION_REASON);
          this.#setStatus('All operations invalidated');
          break;
        }
        case KEY_CLOSE_RUNNERS: {
          void graph.closeRunnersAsync().then(() => {
            this.#setStatus('Closed all runners');
          });
          break;
        }
        case KEY_DEBUG: {
          graph.debugMode = !graph.debugMode;
          this.#setStatus(`Debug mode ${graph.debugMode ? 'enabled' : 'disabled'}`);
          break;
        }
        case KEY_VERBOSE: {
          graph.quietMode = !graph.quietMode;
          this.#setStatus(`Verbose mode ${!graph.quietMode ? 'enabled' : 'disabled'}`);
          break;
        }
        case KEY_PAUSE_RESUME: {
          graph.pauseNextIteration = !graph.pauseNextIteration;
          this.#setStatus(graph.pauseNextIteration ? 'Watch paused' : 'Watch resumed');
          break;
        }
        case KEY_PARALLELISM_UP:
        case '=': {
          this.#adjustParallelism(1);
          break;
        }
        case KEY_PARALLELISM_DOWN: {
          this.#adjustParallelism(-1);
          break;
        }
        case KEY_BUILD: {
          void graph.scheduleIterationAsync({ startTime: performance.now() }).then((queued) => {
            if (queued) {
              if (graph.pauseNextIteration === true) {
                void graph.executeScheduledIterationAsync();
              }
              this.#setStatus('Build iteration queued');
            } else {
              this.#setStatus('No work to queue');
            }
          });
          break;
        }
        default: {
          // ignore other keys
          break;
        }
      }
    }
  }

  /**
   * Adjusts the parallelism on the operation graph by the given delta
   * and reports the result.
   */
  #adjustParallelism(delta: number): void {
    const graph: IOperationGraph = this.#graph;
    const previous: number = graph.parallelism;
    graph.parallelism = previous + delta; // setter will clamp/normalize
    const effective: number = graph.parallelism;
    this.#setStatus(`Parallelism ${effective !== previous ? 'set to' : 'remains'} ${effective}`);
  }
}

/**
 * Given an iterable of repo-relative file paths, yields the set of directory prefixes
 * that should be watched to cover those files. Used on platforms without native recursive
 * watch support to enumerate nested folders.
 */
function* _enumeratePathsToWatch(paths: Iterable<string>, prefixLength: number): Iterable<string> {
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
