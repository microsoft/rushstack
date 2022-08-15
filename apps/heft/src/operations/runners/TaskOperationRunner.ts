// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { performance } from 'perf_hooks';
import { AlreadyReportedError, InternalError } from '@rushstack/node-core-library';

import { OperationStatus } from '../OperationStatus';
import { copyFilesAsync, type ICopyOperation } from '../../plugins/CopyFilesPlugin';
import type { IOperationRunner, IOperationRunnerContext } from '../IOperationRunner';
import type { HeftTask } from '../../pluginFramework/HeftTask';
import type {
  HeftTaskSession,
  IChangedFileState,
  IHeftTaskRunHookOptions,
  IHeftTaskRunIncrementalHookOptions
} from '../../pluginFramework/HeftTaskSession';
import type { HeftPhaseSession } from '../../pluginFramework/HeftPhaseSession';
import type { InternalHeftSession } from '../../pluginFramework/InternalHeftSession';
import type { CancellationToken } from '../../utilities/CancellationToken';

export interface ITaskOperationRunnerOptions {
  internalHeftSession: InternalHeftSession;
  task: HeftTask;
  cancellationToken: CancellationToken;
  changedFiles?: Map<string, IChangedFileState>;
}

export class TaskOperationRunner implements IOperationRunner {
  private readonly _options: ITaskOperationRunnerOptions;

  public readonly silent: boolean = false;

  public get name(): string {
    const { taskName, parentPhase } = this._options.task;
    return `Task "${taskName}" of phase "${parentPhase.phaseName}"`;
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
    const { cancellationToken, changedFiles } = this._options;

    // Exit the task early if cancellation is requested
    if (cancellationToken.isCancellationRequested) {
      return OperationStatus.Cancelled;
    }

    const shouldRunIncremental: boolean =
      taskSession.parameters.watch && taskSession.hooks.runIncremental.isUsed();

    // We must have the changed files map provided if we are running in incremental mode
    if (shouldRunIncremental && !changedFiles) {
      throw new InternalError('changedFiles must be provided when watch is true');
    }

    const shouldRun: boolean = taskSession.hooks.run.isUsed() || shouldRunIncremental;
    if (shouldRun) {
      const startTime: number = performance.now();
      taskSession.logger.terminal.writeVerboseLine(
        `Starting ${shouldRunIncremental ? 'incremental ' : ''}task execution`
      );

      // Create the options and provide a utility method to obtain paths to copy
      const copyOperations: ICopyOperation[] = [];
      const runHookOptions: IHeftTaskRunHookOptions = {
        addCopyOperations: (...copyOperationsToAdd: ICopyOperation[]) =>
          copyOperations.push(...copyOperationsToAdd)
      };

      // Run the plugin run hook
      try {
        if (shouldRunIncremental) {
          const runIncrementalHookOptions: IHeftTaskRunIncrementalHookOptions = {
            ...runHookOptions,
            changedFiles: changedFiles!
          };
          await taskSession.hooks.runIncremental.promise(runIncrementalHookOptions);
        } else {
          await taskSession.hooks.run.promise(runHookOptions);
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

      const finishedWord: string = cancellationToken.isCancellationRequested ? 'Cancelled' : 'Finished';
      taskSession.logger.terminal.writeVerboseLine(
        `${finishedWord} ${shouldRunIncremental ? 'incremental ' : ''}task execution ` +
          `(${performance.now() - startTime}ms)`
      );
    } else {
      taskSession.logger.terminal.writeVerboseLine('Task execution skipped, no implementation provided');
    }

    // Even if the entire process has completed, we should mark the operation as cancelled if
    // cancellation has been requested.
    return cancellationToken.isCancellationRequested ? OperationStatus.Cancelled : OperationStatus.Success;
  }
}
