// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Async } from '@rushstack/node-core-library';
import { _OperationBuildCache as OperationBuildCache } from '@rushstack/rush-sdk';
import type {
  ICreateOperationsContext,
  IExecuteOperationsContext,
  ILogger,
  IOperationExecutionResult,
  IPhasedCommand,
  IRushPlugin,
  Operation,
  RushSession
} from '@rushstack/rush-sdk';
import { CommandLineParameterKind } from '@rushstack/ts-command-line';
import type { CommandLineParameter } from '@rushstack/ts-command-line';

const PLUGIN_NAME: 'RushBridgeCachePlugin' = 'RushBridgeCachePlugin';

const CACHE_ACTION_READ: 'read' = 'read';
const CACHE_ACTION_WRITE: 'write' = 'write';

type CacheAction = typeof CACHE_ACTION_READ | typeof CACHE_ACTION_WRITE | undefined;

export interface IBridgeCachePluginOptions {
  readonly actionParameterName: string;
}

export class BridgeCachePlugin implements IRushPlugin {
  public readonly pluginName: string = PLUGIN_NAME;
  private readonly _actionParameterName: string;

  public constructor(options: IBridgeCachePluginOptions) {
    this._actionParameterName = options.actionParameterName;

    if (!this._actionParameterName) {
      throw new Error(
        'The "actionParameterName" option must be provided for the BridgeCachePlugin. Please see the plugin README for details.'
      );
    }
  }

  public apply(session: RushSession): void {
    session.hooks.runAnyPhasedCommand.tapPromise(PLUGIN_NAME, async (command: IPhasedCommand) => {
      const logger: ILogger = session.getLogger(PLUGIN_NAME);

      let cacheAction: CacheAction = undefined;

      // cancel the actual operations. We don't want to run the command, just cache the output folders on disk
      command.hooks.createOperations.tap(
        { name: PLUGIN_NAME, stage: Number.MAX_SAFE_INTEGER },
        (operations: Set<Operation>, context: ICreateOperationsContext): Set<Operation> => {
          cacheAction = this._getCacheAction(context);

          if (cacheAction !== undefined) {
            if (!context.buildCacheConfiguration?.buildCacheEnabled) {
              throw new Error(
                `The build cache must be enabled to use the "${this._actionParameterName}" parameter.`
              );
            }

            for (const operation of operations) {
              operation.enabled = false;
            }
          }

          return operations;
        }
      );

      // populate the cache for each operation
      command.hooks.beforeExecuteOperations.tap(
        PLUGIN_NAME,
        async (
          recordByOperation: Map<Operation, IOperationExecutionResult>,
          context: IExecuteOperationsContext
        ): Promise<void> => {
          const { buildCacheConfiguration } = context;
          const { terminal } = logger;
          if (!buildCacheConfiguration?.buildCacheEnabled) {
            throw new Error(
              `The build cache must be enabled to use the "${this._actionParameterName}" parameter.`
            );
          }

          if (cacheAction === undefined) {
            return;
          }

          const filteredOperations: Set<IOperationExecutionResult> = new Set();
          for (const operationExecutionResult of recordByOperation.values()) {
            if (operationExecutionResult.operation.isNoOp) {
              continue;
            }
            filteredOperations.add(operationExecutionResult);
          }

          let successCount: number = 0;

          await Async.forEachAsync(
            filteredOperations,
            async (operationExecutionResult: IOperationExecutionResult) => {
              const projectBuildCache: OperationBuildCache = OperationBuildCache.forOperation(
                operationExecutionResult,
                {
                  buildCacheConfiguration,
                  terminal
                }
              );

              const { operation } = operationExecutionResult;

              if (cacheAction === CACHE_ACTION_READ) {
                const success: boolean = await projectBuildCache.tryRestoreFromCacheAsync(terminal);
                if (success) {
                  ++successCount;
                  terminal.writeLine(
                    `Operation "${operation.name}": Outputs have been restored from the build cache."`
                  );
                } else {
                  terminal.writeWarningLine(
                    `Operation "${operation.name}": Outputs could not be restored from the build cache.`
                  );
                }
              } else if (cacheAction === CACHE_ACTION_WRITE) {
                const success: boolean = await projectBuildCache.trySetCacheEntryAsync(terminal);
                if (success) {
                  ++successCount;
                  terminal.writeLine(
                    `Operation "${operation.name}": Existing outputs have been successfully written to the build cache."`
                  );
                } else {
                  terminal.writeErrorLine(
                    `Operation "${operation.name}": An error occurred while writing existing outputs to the build cache.`
                  );
                }
              }
            },
            {
              concurrency: context.parallelism
            }
          );

          terminal.writeLine(
            `Cache operation "${cacheAction}" completed successfully for ${successCount} out of ${filteredOperations.size} operations.`
          );
        }
      );
    });
  }

  private _getCacheAction(context: IExecuteOperationsContext): CacheAction {
    const cacheActionParameter: CommandLineParameter | undefined = context.customParameters.get(
      this._actionParameterName
    );
    if (cacheActionParameter) {
      if (cacheActionParameter.kind !== CommandLineParameterKind.Choice) {
        throw new Error(
          `The parameter "${this._actionParameterName}" must be a choice. Please check the plugin configuration.`
        );
      }

      const value: string | undefined = cacheActionParameter.value;
      switch (value) {
        case CACHE_ACTION_READ:
        case CACHE_ACTION_WRITE:
          return value;
        case undefined:
          return undefined;
        default:
          throw new Error(
            `The parameter "${this._actionParameterName}" must be one of: "${CACHE_ACTION_READ}" or "${CACHE_ACTION_WRITE}". Received: "${value}". Please check the plugin configuration.`
          );
      }
    }

    return undefined;
  }
}
