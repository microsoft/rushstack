// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { performance } from 'perf_hooks';

import { OperationStatus } from '../OperationStatus';
import { deleteFilesAsync, type IDeleteOperation } from '../../plugins/DeleteFilesPlugin';
import type { IOperationRunner, IOperationRunnerContext } from '../IOperationRunner';
import type { HeftPhase } from '../../pluginFramework/HeftPhase';
import type { HeftPhaseSession } from '../../pluginFramework/HeftPhaseSession';
import type { HeftTaskSession } from '../../pluginFramework/HeftTaskSession';
import type { InternalHeftSession } from '../../pluginFramework/InternalHeftSession';

export interface IPhaseOperationRunnerOptions {
  internalHeftSession: InternalHeftSession;
  phase: HeftPhase;
}

export class PhaseOperationRunner implements IOperationRunner {
  public readonly silent: boolean = true;

  private readonly _options: IPhaseOperationRunnerOptions;

  public get name(): string {
    return `Phase ${JSON.stringify(this._options.phase.phaseName)}`;
  }

  public constructor(options: IPhaseOperationRunnerOptions) {
    this._options = options;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    const { internalHeftSession, phase } = this._options;
    const { clean, cleanCache, watch } = internalHeftSession.parameterManager.defaultParameters;

    // Load and apply the plugins for this phase only
    const phaseSession: HeftPhaseSession = internalHeftSession.getSessionForPhase(phase);
    const { phaseLogger, cleanLogger } = phaseSession;
    phaseLogger.terminal.writeVerboseLine('Applying task plugins');
    await phaseSession.applyPluginsAsync();

    if (watch) {
      // Avoid running the phase operation when in watch mode
      return OperationStatus.NoOp;
    }

    // Run the clean hook
    if (clean) {
      const startTime: number = performance.now();

      // Grab the additional clean operations from the phase
      cleanLogger.terminal.writeVerboseLine('Starting clean');
      const deleteOperations: IDeleteOperation[] = Array.from(phase.cleanFiles);

      // Delete all temp folders for tasks by default
      for (const task of phase.tasks) {
        const taskSession: HeftTaskSession = phaseSession.getSessionForTask(task);
        deleteOperations.push({ sourcePath: taskSession.tempFolderPath });

        // Also delete the cache folder if requested
        if (cleanCache) {
          deleteOperations.push({ sourcePath: taskSession.cacheFolderPath });
        }
      }

      // Delete the files if any were specified
      if (deleteOperations.length) {
        await deleteFilesAsync(deleteOperations, cleanLogger.terminal);
      }

      cleanLogger.terminal.writeVerboseLine(`Finished clean (${performance.now() - startTime}ms)`);
    }

    // Return success and allow for the TaskOperationRunner to execute tasks
    return OperationStatus.Success;
  }
}
