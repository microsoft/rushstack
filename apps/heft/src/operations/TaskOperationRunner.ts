// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { performance } from 'perf_hooks';

import { OperationStatus } from './OperationStatus';
import type { IOperationRunner, IOperationRunnerContext } from './IOperationRunner';
import type { HeftTask } from '../pluginFramework/HeftTask';
import type { HeftTaskSession, IHeftTaskRunHookOptions } from '../pluginFramework/HeftTaskSession';
import type { HeftPhaseSession } from '../pluginFramework/HeftPhaseSession';
import type { IPhaseOperationRunnerOptions } from './PhaseOperationRunner';

/**
 *
 */
export interface ITaskOperationRunnerOptions extends IPhaseOperationRunnerOptions {
  /**
   * The task to execute.
   */
  task: HeftTask;
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
    const { internalHeftSession, task, phase, production } = this._options;
    const phaseSession: HeftPhaseSession = internalHeftSession.getSessionForPhase(phase);
    const taskSession: HeftTaskSession = phaseSession.getSessionForTask(task);

    if (taskSession.hooks.run.isUsed()) {
      const startTime: number = performance.now();
      taskSession.logger.terminal.writeVerboseLine('Starting task execution');
      const runHookOptions: IHeftTaskRunHookOptions = { production };
      await taskSession.hooks.run.promise(runHookOptions);
      taskSession.logger.terminal.writeVerboseLine(
        `Finished task execution (${performance.now() - startTime}ms)`
      );
    }

    return OperationStatus.Success;
  }
}
