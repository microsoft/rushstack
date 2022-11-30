// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';
import { performance } from 'perf_hooks';
import glob from 'fast-glob';
import {
  AlreadyReportedError,
  Colors,
  ConsoleTerminalProvider,
  InternalError,
  Path,
  type ITerminal,
  type IPackageJson
} from '@rushstack/node-core-library';
import type {
  CommandLineFlagParameter,
  CommandLineParameterProvider,
  CommandLineStringListParameter
} from '@rushstack/ts-command-line';
import type * as chokidar from 'chokidar';

import type { IHeftSessionWatchOptions, InternalHeftSession } from '../pluginFramework/InternalHeftSession';
import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { LoggingManager } from '../pluginFramework/logging/LoggingManager';
import type { MetricsCollector } from '../metrics/MetricsCollector';
import { Selection } from '../utilities/Selection';
import { GitUtilities } from '../utilities/GitUtilities';
import { HeftParameterManager } from '../pluginFramework/HeftParameterManager';
import {
  OperationExecutionManager,
  type IOperationExecutionManagerOptions
} from '../operations/OperationExecutionManager';
import { Operation } from '../operations/Operation';
import { TaskOperationRunner, runAndMeasureAsync } from '../operations/runners/TaskOperationRunner';
import { PhaseOperationRunner } from '../operations/runners/PhaseOperationRunner';
import { LifecycleOperationRunner } from '../operations/runners/LifecycleOperationRunner';
import type { HeftPhase } from '../pluginFramework/HeftPhase';
import type { IHeftAction, IHeftActionOptions } from '../cli/actions/IHeftAction';
import type { HeftTask } from '../pluginFramework/HeftTask';
import type { LifecycleOperationRunnerType } from '../operations/runners/LifecycleOperationRunner';
import type { IChangedFileState } from '../pluginFramework/HeftTaskSession';
import { CancellationToken, CancellationTokenSource } from '../pluginFramework/CancellationToken';
import { FileEventListener } from '../utilities/FileEventListener';
import { Constants } from '../utilities/Constants';
import { StaticFileSystemAdapter } from '../pluginFramework/StaticFileSystemAdapter';
import type { GlobSyncFn, IPartialGlobOptions } from '../plugins/FileGlobSpecifier';

export interface IHeftActionRunnerOptions extends IHeftActionOptions {
  action: IHeftAction;
}

interface IWaitForSourceChangesOptions {
  readonly terminal: ITerminal;
  readonly watcher: chokidar.FSWatcher;
  readonly watchOptions: IHeftSessionWatchOptions;
  readonly git: GitUtilities;
  readonly changedFiles: Map<string, IChangedFileState>;
  readonly staticFileSystemAdapter: StaticFileSystemAdapter;
}

const INITIAL_CHANGE_STATE: '0' = '0';
const IS_WINDOWS: boolean = process.platform === 'win32';

// Use an async iterator to allow the caller to await for the next source file change.
// The iterator will update a provided map with changes unrelated to source files.
// When a source file changes, the iterator will yield.
async function* _waitForSourceChangesAsync(
  options: IWaitForSourceChangesOptions
): AsyncIterableIterator<void> {
  const { terminal, watcher, watchOptions, git } = options;
  const ignoredSourceFileGlobs: string[] = Array.from(watchOptions.ignoredSourceFileGlobs);
  const forbiddenSourceFileGlobs: string[] = Array.from(watchOptions.forbiddenSourceFileGlobs);
  const changedFileStats: Map<string, fs.Stats | undefined> = new Map();
  const seenFilePaths: Set<string> = new Set();
  const seenSourceFilePaths: Set<string> = new Set();
  let resolveFileChange: () => void;
  let rejectFileChange: (error: Error) => void;
  let fileChangePromise: Promise<void>;

  async function ingestFileChangesAsync(
    filePaths: Iterable<string>,
    ignoreForbidden: boolean = false,
    skipIgnoreCheck: boolean = false
  ): Promise<void> {
    // We can short-circuit the call to git if we already know all files have been seen.
    const unseenFilePaths: Set<string> = Selection.difference(filePaths, seenFilePaths);
    if (unseenFilePaths.size) {
      // Determine which files are ignored or otherwise and stash them away for later.
      // We can perform this check in one call to git to save time.
      const unseenIgnoredFilePaths: Set<string> = skipIgnoreCheck
        ? new Set()
        : await git.checkIgnore(unseenFilePaths);
      const unseenSourceFilePaths: Set<string> = Selection.difference(
        unseenFilePaths,
        unseenIgnoredFilePaths
      );
      if (unseenSourceFilePaths.size) {
        // Use a StaticFileSystemAdapter containing only the unseen source files to determine which files
        // are forbidden or ignored, allowing us to use in-memory globbing.
        const unseenSourceFileSystemAdapter: StaticFileSystemAdapter = new StaticFileSystemAdapter(
          unseenSourceFilePaths
        );
        const unseenSourceFileGlobOptions: glob.Options = {
          fs: unseenSourceFileSystemAdapter,
          cwd: watcher.options.cwd,
          absolute: true,
          dot: true
        };

        // Validate that all unseen source files are allowed for watch mode. We need to convert slashes from
        // the globber if on Windows, since the globber will return the paths with forward slashes.
        let forbiddenFilePaths: string[] = glob.sync(forbiddenSourceFileGlobs, unseenSourceFileGlobOptions);
        if (IS_WINDOWS) {
          forbiddenFilePaths = forbiddenFilePaths.map(Path.convertToBackslashes);
        }
        if (ignoreForbidden) {
          // If it's forbidden and we're ignoring forbidden files, remove from unseenFilePaths and
          // unseenSourceFilePaths so that we will ingest it as a new file on future changes.
          for (const forbiddenFilePath of forbiddenFilePaths) {
            unseenFilePaths.delete(forbiddenFilePath);
            unseenSourceFilePaths.delete(forbiddenFilePath);
          }
        } else if (forbiddenFilePaths.length) {
          // Error and report the first forbidden file for readability reasons
          throw new Error(
            `Changes to the file at path "${forbiddenFilePaths[0]}" are forbidden while running ` +
              `in watch mode.`
          );
        }

        // If the unseen source file is ignored, remove it from the set of unseenSourceFiles. This file
        // will then be treated as a non-source file and will not trigger rebuilds. We need to convert
        // slashes from the globber if on Windows, since the globber will return the paths with forward
        // slashes.
        let ignoredFilePaths: string[] = glob.sync(ignoredSourceFileGlobs, unseenSourceFileGlobOptions);
        if (IS_WINDOWS) {
          ignoredFilePaths = ignoredFilePaths.map(Path.convertToBackslashes);
        }
        for (const ignoredFilePath of ignoredFilePaths) {
          unseenSourceFilePaths.delete(ignoredFilePath);
        }
      }

      // Add the new files to the set of seen files
      for (const filePath of unseenFilePaths) {
        seenFilePaths.add(filePath);
      }

      // Add the new source files to the set of seen source files
      for (const sourceFilePath of unseenSourceFilePaths) {
        seenSourceFilePaths.add(sourceFilePath);
      }
    }
  }

  function generateChangeHash(filePath: string, fileStats?: fs.Stats): string | undefined {
    // watcher.options.alwaysStat is true, so we can use the stats object directly.
    // It should only be undefined when the file has been deleted.
    if (fileStats) {
      // Base the hash on the modification time, change time, size, and path
      return crypto
        .createHash('sha1')
        .update(filePath)
        .update(fileStats.mtimeMs.toString())
        .update(fileStats.ctimeMs.toString())
        .update(fileStats.size.toString())
        .digest('hex');
    } else {
      // File was deleted, return undefined for the change hash
      return undefined;
    }
  }

  function generateChangeState(filePath: string, stats?: fs.Stats): IChangedFileState {
    const version: string | undefined = generateChangeHash(filePath, stats);
    const isSourceFile: boolean = seenSourceFilePaths.has(filePath);
    return { isSourceFile, version };
  }

  function onChange(relativeFilePath: string, fileStats?: fs.Stats): void {
    // watcher.options.cwd is set below, use to resolve the absolute path
    const filePath: string = `${watcher.options.cwd!}${path.sep}${relativeFilePath}`;
    changedFileStats.set(filePath, fileStats);
    resolveFileChange();
  }

  function createFileChangePromise(): Promise<void> {
    return new Promise((resolve: () => void, reject: (error: Error) => void) => {
      resolveFileChange = resolve;
      rejectFileChange = reject;
    });
  }

  // Ingest the initial files and set their state. We want to ignore forbidden files
  // since they aren't being "changed", they're just being watched. We can also skip
  // the gitignore check, since we know that all initial files are unignored.
  const initialFilePaths: Set<string> = await git.getUnignoredFilesAsync();
  await ingestFileChangesAsync(initialFilePaths, /*ignoreForbidden:*/ true, /*skipIgnoreCheck:*/ true);
  for (const filePath of initialFilePaths) {
    const state: IChangedFileState = {
      ...generateChangeState(filePath),
      version: INITIAL_CHANGE_STATE
    };
    options.changedFiles.set(filePath, state);
    if (IS_WINDOWS) {
      // On Windows, we should also populate an entry for the non-backslash version of the path
      // since we can't be sure what format the path was provided in, and this map is provided
      // to the plugin.
      options.changedFiles.set(Path.convertToSlashes(filePath), state);
    }
    // Add the file to the filesystem adapter used for in-memory globbing
    options.staticFileSystemAdapter.addFile(filePath);
  }

  // Setup the promise to resolve when a file change is detected.
  fileChangePromise = createFileChangePromise();

  // Setup the watcher to resolve the promise when a file change is detected
  watcher.on('add', onChange);
  watcher.on('change', onChange);
  watcher.on('unlink', onChange);
  watcher.on('error', (error: Error) => rejectFileChange(error));

  // Yield the initial changes.
  yield;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Wait for the file change promise tick
    await fileChangePromise;

    // Clone the map so that we can hold on to the set of changed files
    const fileChangesToProcess: Map<string, fs.Stats | undefined> = new Map(changedFileStats);
    // Clear the map so that we can ensure the next time around will have only new changes
    changedFileStats.clear();
    // Reset the promise so that we can wait for the next change
    fileChangePromise = createFileChangePromise();

    // Process the file changes. In
    await ingestFileChangesAsync(fileChangesToProcess.keys());

    // Update the output map to contain the new file change state
    let containsSourceFiles: boolean = false;
    for (const [filePath, stats] of fileChangesToProcess) {
      const state: IChangedFileState = generateChangeState(filePath, stats);
      // Dedupe the changed files so that we don't emit the same file twice.
      const existingChange: IChangedFileState | undefined = options.changedFiles.get(filePath);
      if (!existingChange || existingChange.version !== state.version) {
        options.changedFiles.set(filePath, state);
        if (IS_WINDOWS) {
          // On Windows, we should also populate an entry for the non-backslash version of the path
          // since we can't be sure what format the path was provided in
          options.changedFiles.set(Path.convertToSlashes(filePath), state);
        }
        // Always add the file to the filesystem adapter used for in-memory globbing, regardless of
        // deletion state. This is because we are globbing for the existence of files in the
        // changedFiles map, not whether or not they exist on disk.
        options.staticFileSystemAdapter.addFile(filePath);
        if (state.isSourceFile) {
          terminal.writeVerboseLine(`Detected change to source file "${filePath}"`);
          containsSourceFiles = true;
        }
      }
    }

    // Finally, yield only if any source files were modified to avoid re-triggering when output
    // files are written. However, we will still update the change state in that case.
    if (containsSourceFiles) {
      yield;
    }
  }
}

export function initializeHeft(
  heftConfiguration: HeftConfiguration,
  terminal: ITerminal,
  isVerbose: boolean
): void {
  // Ensure that verbose is enabled on the terminal if requested. terminalProvider.verboseEnabled
  // should already be `true` if the `--debug` flag was provided. This is set in HeftCommandLineParser
  if (heftConfiguration.terminalProvider instanceof ConsoleTerminalProvider) {
    heftConfiguration.terminalProvider.verboseEnabled =
      heftConfiguration.terminalProvider.verboseEnabled || isVerbose;
  }

  // Log some information about the execution
  const projectPackageJson: IPackageJson = heftConfiguration.projectPackageJson;
  terminal.writeVerboseLine(`Project: ${projectPackageJson.name}@${projectPackageJson.version}`);
  terminal.writeVerboseLine(`Project build folder: ${heftConfiguration.buildFolderPath}`);
  if (heftConfiguration.rigConfig.rigFound) {
    terminal.writeVerboseLine(`Rig package: ${heftConfiguration.rigConfig.rigPackageName}`);
    terminal.writeVerboseLine(`Rig profile: ${heftConfiguration.rigConfig.rigProfile}`);
  }
  terminal.writeVerboseLine(`Heft version: ${heftConfiguration.heftPackageJson.version}`);
  terminal.writeVerboseLine(`Node version: ${process.version}`);
  terminal.writeVerboseLine('');
}

export async function runWithLoggingAsync(
  fn: () => Promise<void>,
  action: IHeftAction,
  loggingManager: LoggingManager,
  terminal: ITerminal,
  metricsCollector: MetricsCollector,
  cancellationToken: CancellationToken
): Promise<void> {
  const startTime: number = performance.now();
  loggingManager.resetScopedLoggerErrorsAndWarnings();

  // Execute the action operations
  let encounteredError: boolean = false;
  try {
    await fn();
  } catch (e) {
    encounteredError = true;
    throw e;
  } finally {
    const warningStrings: string[] = loggingManager.getWarningStrings();
    const errorStrings: string[] = loggingManager.getErrorStrings();

    const wasCancelled: boolean = cancellationToken.isCancelled;
    const encounteredWarnings: boolean = warningStrings.length > 0 || wasCancelled;
    encounteredError = encounteredError || errorStrings.length > 0;

    await metricsCollector.recordAsync(
      action.actionName,
      {
        encounteredError
      },
      action.getParameterStringMap()
    );

    const duration: number = performance.now() - startTime;
    const finishedLoggingWord: string = encounteredError ? 'Failed' : wasCancelled ? 'Cancelled' : 'Finished';
    const finishedLoggingLine: string = `-------------------- ${finishedLoggingWord} (${
      Math.round(duration) / 1000
    }s) --------------------`;
    terminal.writeLine(
      Colors.bold(
        (encounteredError ? Colors.red : encounteredWarnings ? Colors.yellow : Colors.green)(
          finishedLoggingLine
        )
      )
    );

    if (warningStrings.length > 0) {
      terminal.writeWarningLine(
        `Encountered ${warningStrings.length} warning${warningStrings.length === 1 ? '' : 's'}`
      );
      for (const warningString of warningStrings) {
        terminal.writeWarningLine(`  ${warningString}`);
      }
    }

    if (errorStrings.length > 0) {
      terminal.writeErrorLine(
        `Encountered ${errorStrings.length} error${errorStrings.length === 1 ? '' : 's'}`
      );
      for (const errorString of errorStrings) {
        terminal.writeErrorLine(`  ${errorString}`);
      }
    }
  }

  if (encounteredError) {
    throw new AlreadyReportedError();
  }
}

export class HeftActionRunner {
  private readonly _action: IHeftAction;
  private readonly _terminal: ITerminal;
  private readonly _internalHeftSession: InternalHeftSession;
  private readonly _metricsCollector: MetricsCollector;
  private readonly _loggingManager: LoggingManager;
  private readonly _heftConfiguration: HeftConfiguration;
  private _chokidar: typeof chokidar | undefined;
  private _parameterManager: HeftParameterManager | undefined;

  public constructor(options: IHeftActionRunnerOptions) {
    this._action = options.action;
    this._internalHeftSession = options.internalHeftSession;
    this._heftConfiguration = options.heftConfiguration;
    this._loggingManager = options.loggingManager;
    this._terminal = options.terminal;
    this._metricsCollector = options.metricsCollector;

    this._metricsCollector.setStartTime();
  }

  protected get parameterManager(): HeftParameterManager {
    if (!this._parameterManager) {
      throw new InternalError(`HeftActionRunner.defineParameters() has not been called.`);
    }
    return this._parameterManager;
  }

  public defineParameters(parameterProvider?: CommandLineParameterProvider | undefined): void {
    if (!this._parameterManager) {
      // Use the provided parameter provider if one was provided. This is used by the RunAction
      // to allow for the Heft plugin parameters to be applied as scoped parameters.
      parameterProvider = parameterProvider || this._action;
    } else {
      throw new InternalError(`HeftActionParameters.defineParameters() has already been called.`);
    }

    const verboseFlag: CommandLineFlagParameter = parameterProvider.defineFlagParameter({
      parameterLongName: Constants.verboseParameterLongName,
      parameterShortName: Constants.verboseParameterShortName,
      description: 'If specified, log information useful for debugging.'
    });
    const productionFlag: CommandLineFlagParameter = parameterProvider.defineFlagParameter({
      parameterLongName: Constants.productionParameterLongName,
      description: 'If specified, run Heft in production mode.'
    });
    const localesParameter: CommandLineStringListParameter = parameterProvider.defineStringListParameter({
      parameterLongName: Constants.localesParameterLongName,
      argumentName: 'LOCALE',
      description: 'Use the specified locale for this run, if applicable.'
    });

    let cleanFlag: CommandLineFlagParameter | undefined;
    let cleanCacheFlag: CommandLineFlagParameter | undefined;
    if (!this._action.watch) {
      // Only enable the clean flags in non-watch mode
      cleanFlag = parameterProvider.defineFlagParameter({
        parameterLongName: Constants.cleanParameterLongName,
        description: 'If specified, clean the outputs before running each phase.'
      });
      cleanCacheFlag = parameterProvider.defineFlagParameter({
        parameterLongName: Constants.cleanCacheParameterLongName,
        description:
          'If specified, clean the cache before running each phase. To use this flag, the ' +
          `${JSON.stringify(Constants.cleanParameterLongName)} flag must also be provided.`
      });
    }

    const parameterManager: HeftParameterManager = new HeftParameterManager({
      getIsDebug: () => this._internalHeftSession.debug,
      getIsVerbose: () => verboseFlag.value,
      getIsProduction: () => productionFlag.value,
      getIsWatch: () => this._action.watch,
      getLocales: () => localesParameter.values,
      getIsClean: () => !!cleanFlag?.value,
      getIsCleanCache: () => !!cleanCacheFlag?.value
    });

    // Add all the lifecycle parameters for the action
    for (const lifecyclePluginDefinition of this._internalHeftSession.lifecycle.pluginDefinitions) {
      parameterManager.addPluginParameters(lifecyclePluginDefinition);
    }

    // Add all the task parameters for the action
    for (const phase of this._action.selectedPhases) {
      for (const task of phase.tasks) {
        parameterManager.addPluginParameters(task.pluginDefinition);
      }
    }

    // Finalize and apply to the CommandLineParameterProvider
    parameterManager.finalizeParameters(parameterProvider);
    this._parameterManager = parameterManager;
  }

  public async executeAsync(): Promise<void> {
    // Set the parameter manager on the internal session, which is used to provide the selected
    // parameters to plugins. Set this in onExecute() since we now know that this action is being
    // executed, and the session should be populated with the executing parameters.
    this._internalHeftSession.parameterManager = this.parameterManager;

    initializeHeft(this._heftConfiguration, this._terminal, this.parameterManager.defaultParameters.verbose);

    if (this._action.watch) {
      await this._executeWatchAsync();
    } else {
      await this._executeOnceAsync();
    }
  }

  private async _executeWatchAsync(): Promise<void> {
    const terminal: ITerminal = this._terminal;
    const watcherCwd: string = this._heftConfiguration.buildFolderPath;

    const watcher: chokidar.FSWatcher = await runAndMeasureAsync(
      async () => {
        const chokidarPkg: typeof chokidar = await this._ensureChokidarLoadedAsync();
        const watcherReadyPromise: Promise<chokidar.FSWatcher> = new Promise(
          (resolve: (watcher: chokidar.FSWatcher) => void, reject: (error: Error) => void) => {
            const watcher: chokidar.FSWatcher = chokidarPkg.watch(this._heftConfiguration.buildFolderPath, {
              persistent: true,
              // All watcher-returned file paths will be relative to the build folder. Chokidar on Windows
              // has some issues with watching when not using a cwd, causing the 'ready' event to never be
              // emitted, so we will have to manually resolve the absolute paths in the change handler.
              cwd: watcherCwd,
              // Ignore "node_modules" files and known-unimportant files
              ignored: ['node_modules/**'],
              // Debounce file write events within 100 ms of each other
              awaitWriteFinish: {
                stabilityThreshold: 100
              }
            });
            // Remove all listeners once the initial state is returned
            watcher.on('ready', () => resolve(watcher.removeAllListeners()));
            watcher.on('error', (error: Error) => reject(error));
          }
        );
        return await watcherReadyPromise;
      },
      () => `Starting watcher at path "${watcherCwd}"`,
      () => 'Finished starting watcher',
      terminal.writeVerboseLine.bind(terminal)
    );

    const git: GitUtilities = new GitUtilities(this._heftConfiguration.buildFolderPath);
    const changedFiles: Map<string, IChangedFileState> = new Map();
    const staticFileSystemAdapter: StaticFileSystemAdapter = new StaticFileSystemAdapter();
    const globChangedFilesFn: GlobSyncFn = (pattern: string | string[], options?: IPartialGlobOptions) => {
      return glob.sync(pattern, {
        fs: staticFileSystemAdapter,
        cwd: options?.cwd,
        absolute: options?.absolute,
        ignore: options?.ignore,
        dot: options?.dot
      });
    };

    // Create the async iterator. This will yield void when a changed source file is encountered, giving
    // us a chance to kill the current build and start a new one. Await the first iteration, since the
    // first iteration should be for the initial state.
    const iterator: AsyncIterator<void> = await runAndMeasureAsync(
      async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const iterator: AsyncIterator<void> = _waitForSourceChangesAsync({
          terminal,
          watcher,
          git,
          changedFiles,
          staticFileSystemAdapter,
          watchOptions: this._internalHeftSession.watchOptions
        });
        await iterator.next();
        return iterator;
      },
      () => 'Initializing watcher state',
      () => 'Finished initializing watcher state',
      terminal.writeVerboseLine.bind(terminal)
    );

    // The file event listener is used to allow task operations to wait for a file change before
    // progressing to the next task.
    const fileEventListener: FileEventListener = new FileEventListener(watcher);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Create the cancellation token which is passed to the incremental build.
      const cancellationTokenSource: CancellationTokenSource = new CancellationTokenSource();
      const cancellationToken: CancellationToken = cancellationTokenSource.token;

      // Start the incremental build and wait for a source file to change
      const sourceChangesPromise: Promise<true> = iterator.next().then(() => true);
      const executePromise: Promise<false> = this._executeOnceAsync(
        cancellationToken,
        changedFiles,
        globChangedFilesFn,
        fileEventListener
      ).then(() => false);

      try {
        // Whichever promise settles first will be the result of the race.
        const isSourceChange: boolean = await Promise.race([sourceChangesPromise, executePromise]);
        if (isSourceChange) {
          // If there's a source file change, we need to cancel the incremental build and wait for the
          // execution to finish before we begin execution again.
          cancellationTokenSource.cancel();
          this._terminal.writeLine(
            Colors.bold('Changes detected, cancelling and restarting incremental build...')
          );
          await executePromise;
        } else {
          // If the build is complete, clear the changed files map and await the next iteration. We
          // will continue to use the existing map if the build is not complete, since it may contain
          // unprocessed source changes for earlier tasks. Then, await the next source file change.
          changedFiles.clear();
          // Remove all files from the static file system adapter, since we only use it to glob for
          // the existence of files in the changedFiles map.
          staticFileSystemAdapter.removeAllFiles();
          this._terminal.writeLine(Colors.bold('Waiting for changes. Press CTRL + C to exit...'));
          this._terminal.writeLine('');
          await sourceChangesPromise;
        }
      } catch (e) {
        // Swallow AlreadyReportedErrors, since we likely have already logged them out to the terminal.
        // We also need to wait for source file changes here so that we don't continuously loop after
        // encountering an error.
        if (e instanceof AlreadyReportedError) {
          this._terminal.writeLine(Colors.bold('Waiting for changes. Press CTRL + C to exit...'));
          this._terminal.writeLine('');
          await sourceChangesPromise;
        } else {
          // We don't know where this error is coming from, throw
          throw e;
        }
      }

      // Write an empty line to the terminal for separation between iterations. We've already iterated
      // at this point, so log out that we're about to start a new run.
      this._terminal.writeLine('');
      this._terminal.writeLine(Colors.bold('Starting incremental build...'));
    }
  }

  private async _executeOnceAsync(
    cancellationToken?: CancellationToken,
    changedFiles?: Map<string, IChangedFileState>,
    globChangedFilesFn?: GlobSyncFn,
    fileEventListener?: FileEventListener
  ): Promise<void> {
    cancellationToken = cancellationToken || new CancellationToken();
    const operations: Set<Operation> = this._generateOperations(
      cancellationToken,
      changedFiles,
      globChangedFilesFn,
      fileEventListener
    );
    const operationExecutionManagerOptions: IOperationExecutionManagerOptions = {
      loggingManager: this._loggingManager,
      terminal: this._terminal,
      // TODO: Allow for running non-parallelized operations.
      parallelism: undefined
    };
    const executionManager: OperationExecutionManager = new OperationExecutionManager(
      operations,
      operationExecutionManagerOptions
    );

    // Execute the action operations
    await runWithLoggingAsync(
      executionManager.executeAsync.bind(executionManager),
      this._action,
      this._loggingManager,
      this._terminal,
      this._metricsCollector,
      cancellationToken
    );
  }

  private _generateOperations(
    cancellationToken: CancellationToken,
    changedFiles?: Map<string, IChangedFileState>,
    globChangedFilesFn?: GlobSyncFn,
    fileEventListener?: FileEventListener
  ): Set<Operation> {
    const { selectedPhases } = this._action;
    const {
      defaultParameters: { clean, cleanCache }
    } = this.parameterManager;

    if (cleanCache && !clean) {
      throw new Error(
        `The ${JSON.stringify(Constants.cleanCacheParameterLongName)} option can only be used in ` +
          `conjunction with ${JSON.stringify(Constants.cleanParameterLongName)}.`
      );
    }

    const operations: Map<string, Operation> = new Map();
    const startLifecycleOperation: Operation = this._getOrCreateLifecycleOperation('start', operations);
    const finishLifecycleOperation: Operation = this._getOrCreateLifecycleOperation('finish', operations);

    let hasWarnedAboutSkippedPhases: boolean = false;
    for (const phase of selectedPhases) {
      // Warn if any dependencies are excluded from the list of selected phases
      if (!hasWarnedAboutSkippedPhases) {
        for (const dependencyPhase of phase.dependencyPhases) {
          if (!selectedPhases.has(dependencyPhase)) {
            // Only write once, and write with yellow to make it stand out without writing a warning to stderr
            hasWarnedAboutSkippedPhases = true;
            this._terminal.writeLine(
              Colors.bold(
                'The provided list of phases does not contain all phase dependencies. You may need to run the ' +
                  'excluded phases manually.'
              )
            );
            break;
          }
        }
      }

      // Create operation for the phase start node
      const phaseOperation: Operation = this._getOrCreatePhaseOperation(phase, operations);
      // Set the 'start' lifecycle operation as a dependency of all phases to ensure the 'start' lifecycle
      // operation runs first
      phaseOperation.dependencies.add(startLifecycleOperation);
      // Set the phase operation as a dependency of the 'end' lifecycle operation to ensure the phase
      // operation runs first
      finishLifecycleOperation.dependencies.add(phaseOperation);

      // Create operations for each task
      for (const task of phase.tasks) {
        const taskOperation: Operation = this._getOrCreateTaskOperation(
          task,
          operations,
          cancellationToken,
          changedFiles,
          globChangedFilesFn,
          fileEventListener
        );
        // Set the phase operation as a dependency of the task operation to ensure the phase operation runs first
        taskOperation.dependencies.add(phaseOperation);
        // Set the 'start' lifecycle operation as a dependency of all tasks to ensure the 'start' lifecycle
        // operation runs first
        taskOperation.dependencies.add(startLifecycleOperation);
        // Set the task operation as a dependency of the 'stop' lifecycle operation to ensure the task operation
        // runs first
        finishLifecycleOperation.dependencies.add(taskOperation);

        // Set all dependency tasks as dependencies of the task operation
        for (const dependencyTask of task.dependencyTasks) {
          taskOperation.dependencies.add(
            this._getOrCreateTaskOperation(
              dependencyTask,
              operations,
              cancellationToken,
              changedFiles,
              globChangedFilesFn,
              fileEventListener
            )
          );
        }

        // Set all tasks in a in a phase as dependencies of the consuming phase
        for (const consumingPhase of phase.consumingPhases) {
          if (this._action.selectedPhases.has(consumingPhase)) {
            // Set all tasks in a dependency phase as dependencies of the consuming phase to ensure the dependency
            // tasks run first
            const consumingPhaseOperation: Operation = this._getOrCreatePhaseOperation(
              consumingPhase,
              operations
            );
            consumingPhaseOperation.dependencies.add(taskOperation);
          }
        }
      }
    }

    return new Set(operations.values());
  }

  private _getOrCreateLifecycleOperation(
    type: LifecycleOperationRunnerType,
    operations: Map<string, Operation>
  ): Operation {
    const key: string = `lifecycle.${type}`;

    let operation: Operation | undefined = operations.get(key);
    if (!operation) {
      operation = new Operation({
        groupName: 'lifecycle',
        runner: new LifecycleOperationRunner({ type, internalHeftSession: this._internalHeftSession })
      });
      operations.set(key, operation);
    }
    return operation;
  }

  private _getOrCreatePhaseOperation(phase: HeftPhase, operations: Map<string, Operation>): Operation {
    const key: string = phase.phaseName;

    let operation: Operation | undefined = operations.get(key);
    if (!operation) {
      // Only create the operation. Dependencies are hooked up separately
      operation = new Operation({
        groupName: phase.phaseName,
        runner: new PhaseOperationRunner({ phase, internalHeftSession: this._internalHeftSession })
      });
      operations.set(key, operation);
    }
    return operation;
  }

  private _getOrCreateTaskOperation(
    task: HeftTask,
    operations: Map<string, Operation>,
    cancellationToken: CancellationToken,
    changedFiles?: Map<string, IChangedFileState>,
    globChangedFilesFn?: GlobSyncFn,
    fileEventListener?: FileEventListener
  ): Operation {
    const key: string = `${task.parentPhase.phaseName}.${task.taskName}`;

    let operation: Operation | undefined = operations.get(key);
    if (!operation) {
      operation = new Operation({
        groupName: task.parentPhase.phaseName,
        runner: new TaskOperationRunner({
          internalHeftSession: this._internalHeftSession,
          task,
          cancellationToken,
          changedFiles,
          globChangedFilesFn,
          fileEventListener
        })
      });
      operations.set(key, operation);
    }
    return operation;
  }

  // Defer-load chokidar to avoid loading it until it's actually needed
  private async _ensureChokidarLoadedAsync(): Promise<typeof chokidar> {
    if (!this._chokidar) {
      this._chokidar = await import('chokidar');
    }
    return this._chokidar;
  }
}
