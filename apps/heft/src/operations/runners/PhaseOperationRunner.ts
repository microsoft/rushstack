// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { performance } from 'perf_hooks';
import { AlreadyReportedError } from '@rushstack/node-core-library';

import { OperationStatus } from '../OperationStatus';
import { deleteFilesAsync, type IDeleteOperation } from '../../plugins/DeleteFilesPlugin';
import type { IOperationRunner, IOperationRunnerContext } from '../IOperationRunner';
import type { HeftPhase } from '../../pluginFramework/HeftPhase';
import type { HeftPhaseSession } from '../../pluginFramework/HeftPhaseSession';
import type { HeftTaskSession, IHeftTaskCleanHookOptions } from '../../pluginFramework/HeftTaskSession';
import type { InternalHeftSession } from '../../pluginFramework/InternalHeftSession';

export interface IPhaseOperationRunnerOptions {
  internalHeftSession: InternalHeftSession;
  phase: HeftPhase;
}

export class PhaseOperationRunner implements IOperationRunner {
  public readonly silent: boolean = true;

  private readonly _options: IPhaseOperationRunnerOptions;

  public get name(): string {
    return `Phase "${this._options.phase.phaseName}"`;
  }

  public constructor(options: IPhaseOperationRunnerOptions) {
    this._options = options;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    const { internalHeftSession, phase } = this._options;
    const { clean, cleanCache, watch } = internalHeftSession.parameterManager.defaultParameters;

    // Load and apply the plugins for this phase only
    const phaseSession: HeftPhaseSession = internalHeftSession.getSessionForPhase(phase);
    const { phaseLogger, cleanLogger, cleanHook } = phaseSession;
    phaseLogger.terminal.writeVerboseLine('Applying task plugins');
    await phaseSession.applyPluginsAsync();

    // Avoid running the phase operation when in watch mode
    if (watch) {
      return OperationStatus.Success;
    }

    // Run the clean hook
    if (clean) {
      const startTime: number = performance.now();

      // Grab the additional clean operations from the phase
      cleanLogger.terminal.writeVerboseLine('Starting clean');
      const deleteOperations: IDeleteOperation[] = [...phase.cleanAdditionalFiles];

      // Delete all temp folders for tasks by default
      for (const task of phase.tasks) {
        const taskSession: HeftTaskSession = phaseSession.getSessionForTask(task);
        deleteOperations.push({ sourcePath: taskSession.tempFolder });

        // Also delete the cache folder if requested
        if (cleanCache) {
          deleteOperations.push({ sourcePath: taskSession.cacheFolder });
        }
      }

      // Create the options and provide a utility method to obtain paths to delete
      const cleanHookOptions: IHeftTaskCleanHookOptions = {
        addDeleteOperations: (...deleteOperationsToAdd: IDeleteOperation[]) =>
          deleteOperations.push(...deleteOperationsToAdd)
      };

      // Run the plugin clean hook
      if (cleanHook.isUsed()) {
        try {
          await cleanHook.promise(cleanHookOptions);
        } catch (e: unknown) {
          // Log out using the clean logger, and return an error status
          if (!(e instanceof AlreadyReportedError)) {
            cleanLogger.emitError(e as Error);
          }
          return OperationStatus.Failure;
        }
      }

      // Delete the files if any were specified
      if (deleteOperations.length) {
        await deleteFilesAsync(deleteOperations, cleanLogger);
      }

      cleanLogger.terminal.writeVerboseLine(`Finished clean (${performance.now() - startTime}ms)`);
    }

    // Return success and allow for the TaskOperationRunner to execute tasks
    return OperationStatus.Success;
  }
}
