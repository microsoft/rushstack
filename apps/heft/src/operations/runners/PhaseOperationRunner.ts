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
import type { ScopedLogger } from '../../pluginFramework/logging/ScopedLogger';

export interface IPhaseOperationRunnerOptions {
  internalHeftSession: InternalHeftSession;
  phase: HeftPhase;
  clean: boolean;
  cleanCache: boolean;
}

export class PhaseOperationRunner implements IOperationRunner {
  private readonly _options: IPhaseOperationRunnerOptions;

  public readonly silent: boolean = true;

  public get name(): string {
    return `Phase "${this._options.phase.phaseName}"`;
  }

  public constructor(options: IPhaseOperationRunnerOptions) {
    this._options = options;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    // Load and apply the plugins for this phase only
    const { internalHeftSession, phase, clean, cleanCache } = this._options;

    const phaseSession: HeftPhaseSession = internalHeftSession.getSessionForPhase(phase);
    const phaseLogger: ScopedLogger = phaseSession.loggingManager.requestScopedLogger(phase.phaseName);
    phaseLogger.terminal.writeVerboseLine('Applying task plugins');
    await phaseSession.applyPluginsAsync();

    // Run the clean hook
    if (clean) {
      const startTime: number = performance.now();
      const cleanLogger: ScopedLogger = phaseSession.loggingManager.requestScopedLogger(
        `${phase.phaseName}:clean`
      );
      cleanLogger.terminal.writeVerboseLine('Starting clean');

      // Grab the additional clean operations from the phase
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
      if (phaseSession.cleanHook.isUsed()) {
        try {
          await phaseSession.cleanHook.promise(cleanHookOptions);
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
