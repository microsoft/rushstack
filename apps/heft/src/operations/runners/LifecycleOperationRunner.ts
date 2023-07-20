// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { performance } from 'perf_hooks';
import { AlreadyReportedError, InternalError } from '@rushstack/node-core-library';

import { deleteFilesAsync } from '../../plugins/DeleteFilesPlugin';
import { OperationStatus } from '../OperationStatus';
import type { IOperationRunner, IOperationRunnerContext } from '../IOperationRunner';
import type { InternalHeftSession } from '../../pluginFramework/InternalHeftSession';
import type { ScopedLogger } from '../../pluginFramework/logging/ScopedLogger';
import type { HeftLifecycle } from '../../pluginFramework/HeftLifecycle';
import type { IDeleteOperation } from '../../plugins/DeleteFilesPlugin';
import type {
  IHeftLifecycleCleanHookOptions,
  IHeftLifecycleToolStartHookOptions,
  IHeftLifecycleToolFinishHookOptions,
  IHeftLifecycleSession
} from '../../pluginFramework/HeftLifecycleSession';

export type LifecycleOperationRunnerType = 'clean' | 'start' | 'finish';

export interface ILifecycleOperationRunnerOptions {
  internalHeftSession: InternalHeftSession;
  type: LifecycleOperationRunnerType;
}

export class LifecycleOperationRunner implements IOperationRunner {
  public readonly silent: boolean = true;

  private readonly _options: ILifecycleOperationRunnerOptions;
  private _isClean: boolean = false;

  public get name(): string {
    return `Lifecycle ${JSON.stringify(this._options.type)}`;
  }

  public constructor(options: ILifecycleOperationRunnerOptions) {
    this._options = options;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    const { internalHeftSession, type } = this._options;
    const { clean, watch } = internalHeftSession.parameterManager.defaultParameters;

    // Load and apply the lifecycle plugins
    const lifecycle: HeftLifecycle = internalHeftSession.lifecycle;
    const lifecycleLogger: ScopedLogger = lifecycle.getLifecycleLoggerByType(undefined);
    await lifecycle.applyPluginsAsync(lifecycleLogger.terminal);

    const lifecycleTypeLogger: ScopedLogger = lifecycle.getLifecycleLoggerByType(type);

    switch (type) {
      case 'clean': {
        if (this._isClean || !clean) {
          return OperationStatus.NoOp;
        }

        const startTime: number = performance.now();
        lifecycleTypeLogger.terminal.writeVerboseLine('Starting clean');

        // Grab the additional clean operations from the phase
        const deleteOperations: IDeleteOperation[] = [];

        // Delete all temp folders for tasks by default
        for (const pluginDefinition of lifecycle.pluginDefinitions) {
          const lifecycleSession: IHeftLifecycleSession = await lifecycle.getSessionForPluginDefinitionAsync(
            pluginDefinition
          );
          deleteOperations.push({ sourcePath: lifecycleSession.tempFolderPath });
        }

        // Create the options and provide a utility method to obtain paths to delete
        const cleanHookOptions: IHeftLifecycleCleanHookOptions = {
          addDeleteOperations: (...deleteOperationsToAdd: IDeleteOperation[]) =>
            deleteOperations.push(...deleteOperationsToAdd)
        };

        // Run the plugin clean hook
        if (lifecycle.hooks.clean.isUsed()) {
          try {
            await lifecycle.hooks.clean.promise(cleanHookOptions);
          } catch (e: unknown) {
            // Log out using the clean logger, and return an error status
            if (!(e instanceof AlreadyReportedError)) {
              lifecycleTypeLogger.emitError(e as Error);
            }
            return OperationStatus.Failure;
          }
        }

        // Delete the files if any were specified
        if (deleteOperations.length) {
          const rootFolderPath: string = internalHeftSession.heftConfiguration.buildFolderPath;
          await deleteFilesAsync(rootFolderPath, deleteOperations, lifecycleTypeLogger.terminal);
        }

        // Ensure we only run the clean operation once
        this._isClean = true;

        lifecycleTypeLogger.terminal.writeVerboseLine(`Finished clean (${performance.now() - startTime}ms)`);
        break;
      }
      case 'start': {
        // Run the start hook
        if (lifecycle.hooks.toolStart.isUsed()) {
          if (watch) {
            // Avoid running the toolStart hooks if we're in watch mode
            lifecycleTypeLogger.terminal.writeVerboseLine(
              `Lifecycle plugins aren't currently supported in watch mode.`
            );
            return OperationStatus.NoOp;
          }

          const lifecycleToolStartHookOptions: IHeftLifecycleToolStartHookOptions = {};
          await lifecycle.hooks.toolStart.promise(lifecycleToolStartHookOptions);
        }
        break;
      }
      case 'finish': {
        if (lifecycle.hooks.toolFinish.isUsed()) {
          if (watch) {
            // Avoid running the toolFinish hooks if we're in watch mode
            lifecycleTypeLogger.terminal.writeWarningLine(
              `Lifecycle plugins aren't currently supported in watch mode.`
            );
            return OperationStatus.NoOp;
          }

          const lifeycleToolFinishHookOptions: IHeftLifecycleToolFinishHookOptions = {};
          await lifecycle.hooks.toolFinish.promise(lifeycleToolFinishHookOptions);
        }
        break;
      }
      default: {
        // Should never happen, but just in case
        throw new InternalError(`Unrecognized lifecycle type: ${this._options.type}`);
      }
    }

    // Return success and allow for the TaskOperationRunner to execute tasks
    return OperationStatus.Success;
  }
}
