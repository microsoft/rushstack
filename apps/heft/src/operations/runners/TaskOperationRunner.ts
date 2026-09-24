// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Hash } from 'node:crypto';

import type { IOperationRunner, IOperationRunnerContext } from '@rushstack/operation-graph';
import { OperationStatus } from '@rushstack/operation-graph/lib/OperationStatus';
import { AlreadyReportedError, InternalError } from '@rushstack/node-core-library';

import type { HeftTask } from '../../pluginFramework/HeftTask';
import type { ICopyOperation } from '../../plugins/CopyFilesPlugin';
import type {
  HeftTaskSession,
  IHeftTaskFileOperations,
  IHeftTaskRunHookOptions,
  IHeftTaskRunIncrementalHookOptions
} from '../../pluginFramework/HeftTaskSession';
import type { HeftPhaseSession } from '../../pluginFramework/HeftPhaseSession';
import type { InternalHeftSession } from '../../pluginFramework/InternalHeftSession';
import type { GlobFn, IGlobOptions } from '../../plugins/FileGlobSpecifier';
import type {
  IWatchedFileState,
  IWatchFileSystem,
  WatchFileSystemAdapter
} from '../../utilities/WatchFileSystemAdapter';

// The modules below are only needed for specific features (file operations, watch mode, globbing), so they
// are loaded on first use to keep them out of the startup path.
type CopyFilesPluginModule = typeof import('../../plugins/CopyFilesPlugin');
type DeleteFilesPluginModule = typeof import('../../plugins/DeleteFilesPlugin');
type FileGlobSpecifierModule = typeof import('../../plugins/FileGlobSpecifier');
type WatchFileSystemAdapterModule = typeof import('../../utilities/WatchFileSystemAdapter');

let _copyFilesPluginModulePromise: Promise<CopyFilesPluginModule> | undefined;
let _deleteFilesPluginModulePromise: Promise<DeleteFilesPluginModule> | undefined;
let _watchModulesPromise: Promise<[WatchFileSystemAdapterModule, FileGlobSpecifierModule]> | undefined;
let _fastGlobPromise: Promise<GlobFn> | undefined;

function loadCopyFilesPluginModuleAsync(): Promise<CopyFilesPluginModule> {
  return (_copyFilesPluginModulePromise ??= import('../../plugins/CopyFilesPlugin'));
}

function loadDeleteFilesPluginModuleAsync(): Promise<DeleteFilesPluginModule> {
  return (_deleteFilesPluginModulePromise ??= import('../../plugins/DeleteFilesPlugin'));
}

function loadWatchModulesAsync(): Promise<[WatchFileSystemAdapterModule, FileGlobSpecifierModule]> {
  return (_watchModulesPromise ??= Promise.all([
    import('../../utilities/WatchFileSystemAdapter'),
    import('../../plugins/FileGlobSpecifier')
  ]));
}

/**
 * Loads "fast-glob" the first time a plugin globs, and then forwards to it.
 */
const globAsync: GlobFn = async (
  pattern: string | string[],
  options?: IGlobOptions | undefined
): Promise<string[]> => {
  const glob: GlobFn = await (_fastGlobPromise ??= import('fast-glob').then((fastGlob) => fastGlob.glob));
  return await glob(pattern, options);
};

export interface ITaskOperationRunnerOptions {
  internalHeftSession: InternalHeftSession;
  task: HeftTask;
}

/**
 * Log out a start message, run a provided function, and log out an end message
 */
export async function runAndMeasureAsync<T = void>(
  fn: () => Promise<T>,
  startMessageFn: () => string,
  endMessageFn: () => string,
  logFn: (message: string) => void
): Promise<T> {
  logFn(startMessageFn());
  const startTime: number = performance.now();
  try {
    return await fn();
  } finally {
    const endTime: number = performance.now();
    logFn(`${endMessageFn()} (${endTime - startTime}ms)`);
  }
}

export class TaskOperationRunner implements IOperationRunner {
  readonly #options: ITaskOperationRunnerOptions;

  #fileOperations: IHeftTaskFileOperations | undefined = undefined;
  #copyConfigHash: string | undefined;
  #watchFileSystemAdapter: WatchFileSystemAdapter | undefined = undefined;

  public readonly silent: boolean = false;

  public get name(): string {
    const { taskName, parentPhase } = this.#options.task;
    return `Task ${JSON.stringify(taskName)} of phase ${JSON.stringify(parentPhase.phaseName)}`;
  }

  public constructor(options: ITaskOperationRunnerOptions) {
    this.#options = options;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    const { internalHeftSession, task } = this.#options;
    const { parentPhase } = task;
    const phaseSession: HeftPhaseSession = internalHeftSession.getSessionForPhase(parentPhase);
    const taskSession: HeftTaskSession = phaseSession.getSessionForTask(task);
    return await this.#executeTaskAsync(context, taskSession);
  }

  async #executeTaskAsync(
    context: IOperationRunnerContext,
    taskSession: HeftTaskSession
  ): Promise<OperationStatus> {
    const { abortSignal, requestRun } = context;
    const { hooks, logger } = taskSession;

    // Need to clear any errors or warnings from the previous invocation, particularly
    // if this is an immediate rerun
    logger.resetErrorsAndWarnings();

    const rootFolderPath: string = this.#options.internalHeftSession.heftConfiguration.buildFolderPath;
    const isWatchMode: boolean = taskSession.parameters.watch && !!requestRun;

    const { terminal } = logger;

    // Exit the task early if cancellation is requested
    if (abortSignal.aborted) {
      return OperationStatus.Aborted;
    }

    // These modules are only used in watch mode, where they are accessed synchronously below.
    const watchModules: [WatchFileSystemAdapterModule, FileGlobSpecifierModule] | undefined = isWatchMode
      ? await loadWatchModulesAsync()
      : undefined;

    if (!this.#fileOperations && hooks.registerFileOperations.isUsed()) {
      const fileOperations: IHeftTaskFileOperations = await hooks.registerFileOperations.promise({
        copyOperations: new Set(),
        deleteOperations: new Set()
      });

      let copyConfigHash: string | undefined;
      const { copyOperations } = fileOperations;
      if (copyOperations.size > 0) {
        const [{ asAbsoluteCopyOperation, asRelativeCopyOperation }, { createHash }] = await Promise.all([
          loadCopyFilesPluginModuleAsync(),
          import('node:crypto')
        ]);
        // Do this here so that we only need to do it once for each Heft invocation
        const hasher: Hash | undefined = createHash('sha256');
        const absolutePathCopyOperations: Set<ICopyOperation> = new Set();
        for (const copyOperation of fileOperations.copyOperations) {
          // The paths in the `fileOperations` object may be either absolute or relative
          // For execution we need absolute paths.
          const absoluteOperation: ICopyOperation = asAbsoluteCopyOperation(rootFolderPath, copyOperation);
          absolutePathCopyOperations.add(absoluteOperation);

          // For portability of the hash we need relative paths.
          const portableCopyOperation: ICopyOperation = asRelativeCopyOperation(
            rootFolderPath,
            absoluteOperation
          );
          hasher.update(JSON.stringify(portableCopyOperation));
        }
        fileOperations.copyOperations = absolutePathCopyOperations;
        copyConfigHash = hasher.digest('base64');
      }

      this.#fileOperations = fileOperations;
      this.#copyConfigHash = copyConfigHash;
    }

    const shouldRunIncremental: boolean = isWatchMode && hooks.runIncremental.isUsed();
    let watchFileSystemAdapter: WatchFileSystemAdapter | undefined;
    const getWatchFileSystemAdapter = (): WatchFileSystemAdapter => {
      if (!watchFileSystemAdapter) {
        if (!watchModules) {
          throw new InternalError(`The WatchFileSystemAdapter is only available in watch mode.`);
        }
        watchFileSystemAdapter = this.#watchFileSystemAdapter ||= new watchModules[0].WatchFileSystemAdapter();
        watchFileSystemAdapter.setBaseline();
      }
      return watchFileSystemAdapter;
    };

    const shouldRun: boolean = hooks.run.isUsed() || shouldRunIncremental;
    if (!shouldRun && !this.#fileOperations) {
      terminal.writeVerboseLine('Task execution skipped, no implementation provided');
      return OperationStatus.NoOp;
    }

    const runResult: OperationStatus = shouldRun
      ? await runAndMeasureAsync(
          async (): Promise<OperationStatus> => {
            // Create the options and provide a utility method to obtain paths to copy
            const runHookOptions: IHeftTaskRunHookOptions = {
              abortSignal,
              globAsync
            };

            // Run the plugin run hook
            try {
              if (shouldRunIncremental) {
                const runIncrementalHookOptions: IHeftTaskRunIncrementalHookOptions = {
                  ...runHookOptions,
                  watchGlobAsync: (
                    pattern: string | string[],
                    options: IGlobOptions = {}
                  ): Promise<Map<string, IWatchedFileState>> => {
                    return watchModules![1].watchGlobAsync(pattern, {
                      ...options,
                      fs: getWatchFileSystemAdapter()
                    });
                  },
                  get watchFs(): IWatchFileSystem {
                    return getWatchFileSystemAdapter();
                  },
                  requestRun: requestRun!
                };
                await hooks.runIncremental.promise(runIncrementalHookOptions);
              } else {
                await hooks.run.promise(runHookOptions);
              }
            } catch (e) {
              // Log out using the task logger, and return an error status
              if (!(e instanceof AlreadyReportedError)) {
                logger.emitError(e as Error);
              }
              return OperationStatus.Failure;
            }

            if (abortSignal.aborted) {
              return OperationStatus.Aborted;
            }

            return OperationStatus.Success;
          },
          () => `Starting ${shouldRunIncremental ? 'incremental ' : ''}task execution`,
          () => {
            const finishedWord: string = abortSignal.aborted ? 'Aborted' : 'Finished';
            return `${finishedWord} ${shouldRunIncremental ? 'incremental ' : ''}task execution`;
          },
          terminal.writeVerboseLine.bind(terminal)
        )
      : // This branch only occurs if only file operations are defined.
        OperationStatus.Success;

    if (this.#fileOperations) {
      const { copyOperations, deleteOperations } = this.#fileOperations;
      const copyConfigHash: string | undefined = this.#copyConfigHash;

      const shouldDelete: boolean = deleteOperations.size > 0;
      const [copyFilesPluginModule, deleteFilesPluginModule] = await Promise.all([
        copyConfigHash ? loadCopyFilesPluginModuleAsync() : undefined,
        shouldDelete ? loadDeleteFilesPluginModuleAsync() : undefined
      ]);

      await Promise.all([
        copyConfigHash
          ? copyFilesPluginModule!.copyFilesAsync(
              copyOperations,
              logger.terminal,
              `${taskSession.tempFolderPath}/file-copy.json`,
              copyConfigHash,
              isWatchMode ? getWatchFileSystemAdapter() : undefined
            )
          : Promise.resolve(),
        shouldDelete
          ? deleteFilesPluginModule!.deleteFilesAsync(rootFolderPath, deleteOperations, logger.terminal)
          : Promise.resolve()
      ]);
    }

    if (watchFileSystemAdapter) {
      if (!requestRun) {
        throw new InternalError(`watchFileSystemAdapter was initialized but requestRun is not defined!`);
      }
      watchFileSystemAdapter.watch(requestRun);
    }

    // Even if the entire process has completed, we should mark the operation as cancelled if
    // cancellation has been requested.
    if (abortSignal.aborted) {
      return OperationStatus.Aborted;
    }

    if (logger.hasErrors) {
      return OperationStatus.Failure;
    }

    return runResult;
  }
}
