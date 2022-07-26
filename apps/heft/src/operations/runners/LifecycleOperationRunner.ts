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
  HeftLifecycleSession,
  IHeftLifecycleCleanHookOptions,
  IHeftLifecycleToolStartHookOptions,
  IHeftLifecycleToolStopHookOptions
} from '../../pluginFramework/HeftLifecycleSession';

export type LifecycleOperationRunnerType = 'start' | 'stop';

/**
 *
 */
export interface ILifecycleOperationRunnerOptions {
  /**
   *
   */
  internalHeftSession: InternalHeftSession;

  /**
   *
   */
  type: LifecycleOperationRunnerType;

  /**
   *
   */
  clean: boolean;

  /**
   *
   */
  cleanCache: boolean;

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
export class LifecycleOperationRunner implements IOperationRunner {
  private readonly _options: ILifecycleOperationRunnerOptions;

  public readonly silent: boolean = true;

  public get name(): string {
    return `Lifecycle "${this._options.type}"`;
  }

  public get groupName(): string {
    return 'lifecycle';
  }

  public constructor(options: ILifecycleOperationRunnerOptions) {
    this._options = options;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    // Load and apply the plugins for this phase only
    const { internalHeftSession, type, production, clean, cleanCache, verbose } = this._options;
    const lifecycle: HeftLifecycle = internalHeftSession.lifecycle;
    const lifecycleLogger: ScopedLogger = internalHeftSession.loggingManager.requestScopedLogger(
      `lifecycle:${this._options.type}`
    );

    switch (type) {
      case 'start': {
        // We can only apply the plugins once, so only do it during the start operation
        lifecycleLogger.terminal.writeVerboseLine('Applying lifecycle plugins');
        await lifecycle.applyPluginsAsync();

        // Run the clean hook
        if (clean) {
          const startTime: number = performance.now();
          const cleanLogger: ScopedLogger =
            internalHeftSession.loggingManager.requestScopedLogger(`lifecycle:clean`);
          cleanLogger.terminal.writeVerboseLine('Starting clean');

          // Grab the additional clean operations from the phase
          const deleteOperations: IDeleteOperation[] = [];

          // Delete all temp folders for tasks by default
          for (const pluginDefinition of lifecycle.pluginDefinitions) {
            const lifecycleSession: HeftLifecycleSession =
              lifecycle.getSessionForPluginDefinition(pluginDefinition);
            deleteOperations.push({ sourcePath: lifecycleSession.tempFolder });

            // Also delete the cache folder if requested
            if (cleanCache) {
              deleteOperations.push({ sourcePath: lifecycleSession.cacheFolder });
            }
          }

          // Create the options and provide a utility method to obtain paths to delete
          const cleanHookOptions: IHeftLifecycleCleanHookOptions = {
            production,
            verbose,
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

        // Run the start hook
        if (lifecycle.hooks.toolStart.isUsed()) {
          const lifecycleToolStartHookOptions: IHeftLifecycleToolStartHookOptions = {
            production,
            verbose
          };
          await lifecycle.hooks.toolStart.promise(lifecycleToolStartHookOptions);
        }
        break;
      }
      case 'stop': {
        if (lifecycle.hooks.toolStop.isUsed()) {
          const lifeycleToolStopHookOptions: IHeftLifecycleToolStopHookOptions = {
            production,
            verbose
          };
          await lifecycle.hooks.toolStop.promise(lifeycleToolStopHookOptions);
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
