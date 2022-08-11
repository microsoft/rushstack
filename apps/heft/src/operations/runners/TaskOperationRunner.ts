// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { performance } from 'perf_hooks';
import { AlreadyReportedError } from '@rushstack/node-core-library';

import { OperationStatus } from '../OperationStatus';
import { copyFilesAsync, type ICopyOperation } from '../../plugins/CopyFilesPlugin';
import type { IOperationRunner, IOperationRunnerContext } from '../IOperationRunner';
import type { HeftTask } from '../../pluginFramework/HeftTask';
import type {
  HeftTaskSession,
  IChangedFileState,
  IHeftTaskRunHookOptions
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

    if (taskSession.parameters.watch) {
      return await this._executeTaskIncrementalAsync(taskSession);
    } else {
      return await this._executeTaskAsync(taskSession);
    }
  }

  private async _executeTaskAsync(taskSession: HeftTaskSession): Promise<OperationStatus> {
    // Exit the task early if cancellation is requested
    if (this._options.cancellationToken.isCancellationRequested) {
      return OperationStatus.Cancelled;
    }

    if (taskSession.hooks.run.isUsed()) {
      const startTime: number = performance.now();
      taskSession.logger.terminal.writeVerboseLine('Starting task execution');

      const copyOperations: ICopyOperation[] = [];

      // Create the options and provide a utility method to obtain paths to copy
      const runHookOptions: IHeftTaskRunHookOptions = {
        addCopyOperations: (...copyOperationsToAdd: ICopyOperation[]) =>
          copyOperations.push(...copyOperationsToAdd)
      };

      // Run the plugin run hook
      try {
        await taskSession.hooks.run.promise(runHookOptions);
      } catch (e: unknown) {
        // Log out using the task logger, and return an error status
        if (!(e instanceof AlreadyReportedError)) {
          taskSession.logger.emitError(e as Error);
        }
        return OperationStatus.Failure;
      }

      // If the task was cancelled during the run hook, exit early
      if (this._options.cancellationToken.isCancellationRequested) {
        return OperationStatus.Cancelled;
      }

      // Copy the files if any were specified
      if (copyOperations.length) {
        await copyFilesAsync(copyOperations, taskSession.logger);
      }

      taskSession.logger.terminal.writeVerboseLine(
        `Finished task execution (${performance.now() - startTime}ms)`
      );
    } else {
      taskSession.logger.terminal.writeVerboseLine('Task execution skipped, no implementation provided');
    }

    return OperationStatus.Success;
  }

  private async _executeTaskIncrementalAsync(taskSession: HeftTaskSession): Promise<OperationStatus> {
    if (taskSession.hooks.runIncremental.isUsed()) {
      throw new Error('Not implemented');
    } else {
      // If there is no incremental run hook, fall back to the normal run hook
      return await this._executeTaskAsync(taskSession);
    }
  }
}
