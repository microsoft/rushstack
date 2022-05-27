// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { performance } from 'perf_hooks';
import { AlreadyReportedError } from '@rushstack/node-core-library';

import { OperationStatus } from './OperationStatus';
import { DeleteFilesPlugin, IDeleteOperation } from '../plugins/DeleteFilesPlugin';
import type { IOperationRunner, IOperationRunnerContext } from './IOperationRunner';
import type { HeftPhase } from '../pluginFramework/HeftPhase';
import type { HeftPhaseSession } from '../pluginFramework/HeftPhaseSession';
import type { IHeftTaskCleanHookOptions } from '../pluginFramework/HeftTaskSession';
import type { InternalHeftSession } from '../pluginFramework/InternalHeftSession';
import type { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';

/**
 *
 */
export interface IPhaseOperationRunnerOptions {
  /**
   *
   */
  internalHeftSession: InternalHeftSession;

  /**
   * The task to execute.
   */
  phase: HeftPhase;

  /**
   *
   */
  clean: boolean;

  /**
   *
   */
  production: boolean;
}

/**
 *
 */
export class PhaseOperationRunner implements IOperationRunner {
  private readonly _options: IPhaseOperationRunnerOptions;

  public readonly silent: boolean = false;

  public get name(): string {
    return `Phase "${this._options.phase.phaseName}"`;
  }

  public get groupName(): string {
    return this._options.phase.phaseName;
  }

  public constructor(options: IPhaseOperationRunnerOptions) {
    this._options = options;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    // Load and apply the plugins for this phase only
    const { internalHeftSession, phase, production, clean } = this._options;
    const phaseSession: HeftPhaseSession = internalHeftSession.getSessionForPhase(phase);
    const phaseLogger: ScopedLogger = phaseSession.loggingManager.requestScopedLogger(phase.phaseName);
    phaseLogger.terminal.writeVerboseLine('Applying task plugins');
    await phaseSession.applyPluginsAsync();

    // Run the clean hook
    if (clean && phaseSession.cleanHook.isUsed()) {
      const startTime: number = performance.now();
      const cleanLogger: ScopedLogger = phaseSession.loggingManager.requestScopedLogger(
        `${phase.phaseName}:clean`
      );
      cleanLogger.terminal.writeVerboseLine('Starting clean');

      // Create the options and provide a utility method to obtain paths to delete
      const deleteOperations: IDeleteOperation[] = [];
      const cleanHookOptions: IHeftTaskCleanHookOptions = {
        production,
        addDeleteOperations: (...deleteOperationsToAdd: IDeleteOperation[]) =>
          deleteOperations.push(...deleteOperationsToAdd)
      };

      try {
        await phaseSession.cleanHook.promise(cleanHookOptions);
      } catch (e: unknown) {
        // Log out using the clean logger, and return an error status
        if (!(e instanceof AlreadyReportedError)) {
          cleanLogger.emitError(e as Error);
        }
        return OperationStatus.Failure;
      }

      if (deleteOperations.length) {
        await DeleteFilesPlugin.deleteFilesAsync(deleteOperations, cleanLogger);
      }

      cleanLogger.terminal.writeVerboseLine(`Finished clean (${performance.now() - startTime}ms)`);
    }

    // Return success and allow for the TaskOperationRunner to execute tasks
    return OperationStatus.Success;
  }
}
