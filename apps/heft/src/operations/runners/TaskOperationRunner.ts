// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { performance } from 'perf_hooks';
import { AlreadyReportedError } from '@rushstack/node-core-library';

import { OperationStatus } from '../OperationStatus';
import { copyFilesAsync, type ICopyOperation } from '../../plugins/CopyFilesPlugin';
import type { IOperationRunner, IOperationRunnerContext } from '../IOperationRunner';
import type { HeftTask } from '../../pluginFramework/HeftTask';
import type { HeftTaskSession, IHeftTaskRunHookOptions } from '../../pluginFramework/HeftTaskSession';
import type { HeftPhaseSession } from '../../pluginFramework/HeftPhaseSession';
import type { InternalHeftSession } from '../../pluginFramework/InternalHeftSession';
import type { HeftPhase } from '../../pluginFramework/HeftPhase';

/**
 *
 */
export interface ITaskOperationRunnerOptions {
  /**
   *
   */
  internalHeftSession: InternalHeftSession;

  /**
   * The task to execute.
   */
  phase: HeftPhase;

  /**
   * The task to execute.
   */
  task: HeftTask;

  /**
   *
   */
  production: boolean;

  /**
   *
   */
  verbose: boolean;
}

/**
 *
 */
export class TaskOperationRunner implements IOperationRunner {
  private readonly _options: ITaskOperationRunnerOptions;

  public readonly silent: boolean = false;

  public get name(): string {
    return `Task "${this._options.task.taskName}" of phase "${this._options.phase.phaseName}"`;
  }

  public get groupName(): string {
    return this._options.phase.phaseName;
  }

  public constructor(options: ITaskOperationRunnerOptions) {
    this._options = options;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    const { internalHeftSession, task, phase, production, verbose } = this._options;
    const phaseSession: HeftPhaseSession = internalHeftSession.getSessionForPhase(phase);
    const taskSession: HeftTaskSession = phaseSession.getSessionForTask(task);

    if (taskSession.hooks.run.isUsed()) {
      const startTime: number = performance.now();
      taskSession.logger.terminal.writeVerboseLine('Starting task execution');

      const copyOperations: ICopyOperation[] = [];

      // Create the options and provide a utility method to obtain paths to copy
      const runHookOptions: IHeftTaskRunHookOptions = {
        production,
        verbose,
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

      // Copy the files if any were specified
      if (copyOperations.length) {
        await copyFilesAsync(copyOperations, taskSession.logger);
      }

      taskSession.logger.terminal.writeVerboseLine(
        `Finished task execution (${performance.now() - startTime}ms)`
      );
    }

    return OperationStatus.Success;
  }
}
