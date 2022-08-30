// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { performance } from 'perf_hooks';
import { AlreadyReportedError, InternalError, LockFile } from '@rushstack/node-core-library';

import { OperationStatus } from '../OperationStatus';
import { FileEventListener } from '../../utilities/FileEventListener';
import { HeftTask } from '../../pluginFramework/HeftTask';
import { copyFilesAsync, type ICopyOperation } from '../../plugins/CopyFilesPlugin';
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

export interface ITaskOperationRunnerOptions {
  internalHeftSession: InternalHeftSession;
  task: HeftTask;
  cancellationToken: CancellationToken;
  changedFiles?: Map<string, IChangedFileState>;
  fileEventListener?: FileEventListener;
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
    const { cancellationToken, changedFiles, fileEventListener } = this._options;
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

    const startTime: number = performance.now();
    terminal.writeVerboseLine(`Starting ${shouldRunIncremental ? 'incremental ' : ''}task execution`);

    // Create the options and provide a utility method to obtain paths to copy
    const copyOperations: ICopyOperation[] = [];
    const deleteOperations: IDeleteOperation[] = [];
    const runHookOptions: IHeftTaskRunHookOptions = {
      addCopyOperations: (...copyOperationsToAdd: ICopyOperation[]) =>
        copyOperations.push(...copyOperationsToAdd),
      addDeleteOperations: (...deleteOperationsToAdd: IDeleteOperation[]) =>
        deleteOperations.push(...deleteOperationsToAdd)
    };

    // Run the plugin run hook
    try {
      if (shouldRunIncremental) {
        const runIncrementalHookOptions: IHeftTaskRunIncrementalHookOptions = {
          ...runHookOptions,
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

    // Copy the files if any were specified. Avoid checking the cancellation token here
    // since plugins may be tracking state changes and would have already considered
    // added copy operations as "processed" during hook execution.
    if (copyOperations.length) {
      await copyFilesAsync(copyOperations, taskSession.logger);
    }

    // Delete the files if any were specified. Avoid checking the cancellation token here
    // for the same reasons as above.
    if (deleteOperations.length) {
      await deleteFilesAsync(deleteOperations, taskSession.logger);
    }

    if (taskSession.parameters.watch) {
      if (!fileEventListener) {
        // The file event listener is used to watch for changes to the lockfile. Without it, watch mode could
        // go out of sync.
        throw new InternalError('fileEventListener must be provided when watch is true');
      }

      // The task temp folder is a unique and relevant name, so re-use it for the lock file name
      const lockFileName: string = path.basename(taskSession.tempFolderPath);

      // Create a lockfile and wait for it to appear in the watcher. This is done to ensure that all watched
      // files created by the task are ingested and available before running subsequent tasks. This can
      // appear as a create or a change, depending on if the lockfile is dirty.
      terminal.writeVerboseLine(`Synchronizing watcher using lock file ${JSON.stringify(lockFileName)}`);
      const lockFilePath: string = LockFile.getLockFilePath(taskSession.tempFolderPath, lockFileName);
      const lockfileChangePromise: Promise<void> = Promise.race([
        fileEventListener!.waitForChangeAsync(lockFilePath),
        fileEventListener!.waitForCreateAsync(lockFilePath)
      ]);
      const taskOperationLockFile: LockFile | undefined = LockFile.tryAcquire(
        taskSession.tempFolderPath,
        lockFileName
      );
      if (!taskOperationLockFile) {
        throw new InternalError(
          `Failed to acquire lock file ${JSON.stringify(lockFileName)}. Are multiple instances of ` +
            'Heft running?'
        );
      }
      await lockfileChangePromise;

      // We can save some time by avoiding deleting the lockfile
      taskOperationLockFile.release(/*deleteFile:*/ false);
    }

    const finishedWord: string = cancellationToken.isCancelled ? 'Cancelled' : 'Finished';
    terminal.writeVerboseLine(
      `${finishedWord} ${shouldRunIncremental ? 'incremental ' : ''}task execution ` +
        `(${performance.now() - startTime}ms)`
    );

    // Even if the entire process has completed, we should mark the operation as cancelled if
    // cancellation has been requested.
    return cancellationToken.isCancelled ? OperationStatus.Cancelled : OperationStatus.Success;
  }
}
