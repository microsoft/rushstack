// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { performance } from 'perf_hooks';
import { AlreadyReportedError, InternalError, LockFile, type ITerminal } from '@rushstack/node-core-library';

import { OperationStatus } from '../OperationStatus';
import { FileEventListener } from '../../utilities/FileEventListener';
import { HeftTask } from '../../pluginFramework/HeftTask';
import {
  copyFilesAsync,
  copyIncrementalFilesAsync,
  type ICopyOperation,
  type IIncrementalCopyOperation
} from '../../plugins/CopyFilesPlugin';
import { deleteFilesAsync, type IDeleteOperation } from '../../plugins/DeleteFilesPlugin';
import type { IOperationRunner, IOperationRunnerContext } from '../IOperationRunner';
import type {
  HeftTaskSession,
  IChangedFileState,
  IHeftTaskRunHookOptions,
  IHeftTaskRunIncrementalHookOptions
} from '../../pluginFramework/HeftTaskSession';
import type { HeftPhaseSession } from '../../pluginFramework/HeftPhaseSession';
import type { InternalHeftSession } from '../../pluginFramework/InternalHeftSession';
import type { CancellationToken } from '../../pluginFramework/CancellationToken';
import type { GlobFn, IGlobOptions } from '../../plugins/FileGlobSpecifier';

export interface ITaskOperationRunnerOptions {
  internalHeftSession: InternalHeftSession;
  task: HeftTask;
  cancellationToken: CancellationToken;
  changedFiles?: Map<string, IChangedFileState>;
  globChangedFilesAsyncFn?: GlobFn;
  fileEventListener?: FileEventListener;
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

/**
 * Create a lockfile and wait for it to appear in the watcher. This is done to ensure that all watched
 * files created prior to the creation of the lockfile are ingested and available before running
 * subsequent tasks.
 */
async function waitForLockFile(
  lockFileFolder: string,
  lockFileName: string,
  fileEventListener: FileEventListener,
  terminal: ITerminal
): Promise<void> {
  // Acquire the lock file and release it once the watcher has ingested it. Acquiring the lock file will
  // delete any existing lock file if present and create a new one. The file event listener will listen
  // for any event on the lock file and resolve the promise once it is seen, indicating that the watcher
  // has caught up to file events prior to the creation/deletion of the lock file.
  terminal.writeVerboseLine(`Synchronizing watcher using lock file ${JSON.stringify(lockFileName)}`);
  const lockFilePath: string = LockFile.getLockFilePath(lockFileFolder, lockFileName);
  const lockfileChangePromise: Promise<void> = fileEventListener.waitForEventAsync(lockFilePath);
  const taskOperationLockFile: LockFile | undefined = LockFile.tryAcquire(lockFileFolder, lockFileName);
  if (!taskOperationLockFile) {
    throw new InternalError(
      `Failed to acquire lock file ${JSON.stringify(lockFileName)}. Are multiple instances of ` +
        'Heft running?'
    );
  }
  await lockfileChangePromise;
  taskOperationLockFile.release();
}

export class TaskOperationRunner implements IOperationRunner {
  private readonly _options: ITaskOperationRunnerOptions;

  public readonly silent: boolean = false;

  public get name(): string {
    const { taskName, parentPhase } = this._options.task;
    return `Task ${JSON.stringify(taskName)} of phase ${JSON.stringify(parentPhase.phaseName)}`;
  }

  public constructor(options: ITaskOperationRunnerOptions) {
    this._options = options;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    const { internalHeftSession, task } = this._options;
    const { parentPhase } = task;
    const phaseSession: HeftPhaseSession = internalHeftSession.getSessionForPhase(parentPhase);
    const taskSession: HeftTaskSession = phaseSession.getSessionForTask(task);
    return await this._executeTaskAsync(taskSession);
  }

  private async _executeTaskAsync(taskSession: HeftTaskSession): Promise<OperationStatus> {
    const { cancellationToken, changedFiles, globChangedFilesAsyncFn, fileEventListener } = this._options;
    const {
      hooks,
      logger: { terminal }
    } = taskSession;

    // Exit the task early if cancellation is requested
    if (cancellationToken.isCancelled) {
      return OperationStatus.Cancelled;
    }

    const shouldRunIncremental: boolean = taskSession.parameters.watch && hooks.runIncremental.isUsed();
    if (shouldRunIncremental && !changedFiles) {
      // We must have the changed files map provided if we are running in incremental mode
      throw new InternalError('changedFiles must be provided when watch is true');
    }

    const shouldRun: boolean = hooks.run.isUsed() || shouldRunIncremental;
    if (!shouldRun) {
      terminal.writeVerboseLine('Task execution skipped, no implementation provided');
      return OperationStatus.NoOp;
    }

    await runAndMeasureAsync(
      async () => {
        // Create the options and provide a utility method to obtain paths to copy
        const copyOperations: ICopyOperation[] = [];
        const incrementalCopyOperations: IIncrementalCopyOperation[] = [];
        const deleteOperations: IDeleteOperation[] = [];

        const runHookOptions: IHeftTaskRunHookOptions = {
          addCopyOperations: (copyOperationsToAdd: ICopyOperation[]) => {
            for (const copyOperation of copyOperationsToAdd) {
              copyOperations.push(copyOperation);
            }
          },
          addDeleteOperations: (deleteOperationsToAdd: IDeleteOperation[]) => {
            for (const deleteOperation of deleteOperationsToAdd) {
              deleteOperations.push(deleteOperation);
            }
          }
        };

        // Run the plugin run hook
        try {
          if (shouldRunIncremental) {
            const runIncrementalHookOptions: IHeftTaskRunIncrementalHookOptions = {
              ...runHookOptions,
              addCopyOperations: (incrementalCopyOperationsToAdd: IIncrementalCopyOperation[]) => {
                for (const incrementalCopyOperation of incrementalCopyOperationsToAdd) {
                  if (incrementalCopyOperation.onlyIfChanged) {
                    incrementalCopyOperations.push(incrementalCopyOperation);
                  } else {
                    copyOperations.push(incrementalCopyOperation);
                  }
                }
              },
              globChangedFilesAsync: globChangedFilesAsyncFn!,
              changedFiles: changedFiles!,
              cancellationToken: cancellationToken!
            };
            await hooks.runIncremental.promise(runIncrementalHookOptions);
          } else {
            await hooks.run.promise(runHookOptions);
          }
        } catch (e) {
          // Log out using the task logger, and return an error status
          if (!(e instanceof AlreadyReportedError)) {
            taskSession.logger.emitError(e as Error);
          }
          return OperationStatus.Failure;
        }

        const fileOperationPromises: Promise<void>[] = [];

        const globExistingChangedFilesFn: GlobFn = async (
          pattern: string | string[],
          options?: IGlobOptions
        ) => {
          // We expect specific options to be passed. If they aren't the provided options, we may not
          // find the changed files in the changedFiles map.
          if (!options?.absolute) {
            throw new InternalError('Options provided to globExistingChangedFilesFn were not expected.');
          }

          const globbedChangedFiles: string[] = await globChangedFilesAsyncFn!(pattern, options);

          // Filter out deletes, since we can't copy or delete an already deleted file
          return globbedChangedFiles.filter((changedFile: string) => {
            const changedFileState: IChangedFileState | undefined = changedFiles!.get(changedFile);
            return changedFileState && changedFileState.version !== undefined;
          });
        };

        // Copy the files if any were specified. Avoid checking the cancellation token here
        // since plugins may be tracking state changes and would have already considered
        // added copy operations as "processed" during hook execution.
        if (copyOperations.length) {
          fileOperationPromises.push(copyFilesAsync(copyOperations, taskSession.logger));
        }

        // Also incrementally copy files if any were specified. We know that globChangedFilesAsyncFn must
        // exist because incremental copy operations are only available in incremental mode.
        if (incrementalCopyOperations.length) {
          fileOperationPromises.push(
            copyIncrementalFilesAsync(
              incrementalCopyOperations,
              globExistingChangedFilesFn,
              taskSession.logger
            )
          );
        }

        // Delete the files if any were specified. Avoid checking the cancellation token here
        // for the same reasons as above.
        if (deleteOperations.length) {
          fileOperationPromises.push(deleteFilesAsync(deleteOperations, taskSession.logger.terminal));
        }

        if (fileOperationPromises.length) {
          await Promise.all(fileOperationPromises);
        }

        if (taskSession.parameters.watch) {
          if (!fileEventListener) {
            // The file event listener is used to watch for changes to the lockfile. Without it, watch mode could
            // go out of sync.
            throw new InternalError('fileEventListener must be provided when watch is true');
          }
          // The task temp folder is a unique and relevant name, so re-use it for the lock file name
          const lockFileName: string = path.basename(taskSession.tempFolderPath);
          await waitForLockFile(taskSession.tempFolderPath, lockFileName, fileEventListener, terminal);
        }
      },
      () => `Starting ${shouldRunIncremental ? 'incremental ' : ''}task execution`,
      () => {
        const finishedWord: string = cancellationToken.isCancelled ? 'Cancelled' : 'Finished';
        return `${finishedWord} ${shouldRunIncremental ? 'incremental ' : ''}task execution`;
      },
      terminal.writeVerboseLine.bind(terminal)
    );

    // Even if the entire process has completed, we should mark the operation as cancelled if
    // cancellation has been requested.
    return cancellationToken.isCancelled ? OperationStatus.Cancelled : OperationStatus.Success;
  }
}
