// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Async, FileSystem } from '@rushstack/node-core-library';
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

type CacheAction = typeof CACHE_ACTION_READ | typeof CACHE_ACTION_WRITE;

export interface IBridgeCachePluginOptions {
  readonly actionParameterName: string;
  readonly requireOutputFoldersParameterName: string | undefined;
}

export class BridgeCachePlugin implements IRushPlugin {
  public readonly pluginName: string = PLUGIN_NAME;
  private readonly _actionParameterName: string;
  private readonly _requireOutputFoldersParameterName: string | undefined;

  public constructor(options: IBridgeCachePluginOptions) {
    this._actionParameterName = options.actionParameterName;
    this._requireOutputFoldersParameterName = options.requireOutputFoldersParameterName;

    if (!this._actionParameterName) {
      throw new Error(
        'The "actionParameterName" option must be provided for the BridgeCachePlugin. Please see the plugin README for details.'
      );
    }
  }

  public apply(session: RushSession): void {
    session.hooks.runAnyPhasedCommand.tapPromise(PLUGIN_NAME, async (command: IPhasedCommand) => {
      const logger: ILogger = session.getLogger(PLUGIN_NAME);

      let cacheAction: CacheAction | undefined;
      let requireOutputFolders: boolean = false;

      // cancel the actual operations. We don't want to run the command, just cache the output folders on disk
      command.hooks.createOperations.tap(
        { name: PLUGIN_NAME, stage: Number.MAX_SAFE_INTEGER },
        (operations: Set<Operation>, context: ICreateOperationsContext): Set<Operation> => {
          const { customParameters } = context;
          cacheAction = this._getCacheAction(customParameters);

          if (cacheAction !== undefined) {
            if (!context.buildCacheConfiguration?.buildCacheEnabled) {
              throw new Error(
                `The build cache must be enabled to use the "${this._actionParameterName}" parameter.`
              );
            }

            for (const operation of operations) {
              operation.enabled = false;
            }

            requireOutputFolders = this._isRequireOutputFoldersFlagSet(customParameters);
          }

          return operations;
        }
      );
      // populate the cache for each operation
      command.hooks.beforeExecuteOperations.tapPromise(
        PLUGIN_NAME,
        async (
          recordByOperation: Map<Operation, IOperationExecutionResult>,
          context: IExecuteOperationsContext
        ): Promise<void> => {
          const { buildCacheConfiguration } = context;
          const { terminal } = logger;

          if (cacheAction === undefined) {
            return;
          }

          if (!buildCacheConfiguration?.buildCacheEnabled) {
            throw new Error(
              `The build cache must be enabled to use the "${this._actionParameterName}" parameter.`
            );
          }

          const filteredOperations: Set<IOperationExecutionResult> = new Set();
          for (const operationExecutionResult of recordByOperation.values()) {
            if (!operationExecutionResult.operation.isNoOp) {
              filteredOperations.add(operationExecutionResult);
            }
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
                  terminal.writeLine(`Cache key: ${projectBuildCache.cacheId}`);
                } else {
                  terminal.writeWarningLine(
                    `Operation "${operation.name}": Outputs could not be restored from the build cache.`
                  );
                }
              } else if (cacheAction === CACHE_ACTION_WRITE) {
                // if the require output folders flag has been passed, skip populating the cache if any of the expected output folders does not exist
                if (
                  requireOutputFolders &&
                  operation.settings?.outputFolderNames &&
                  operation.settings?.outputFolderNames?.length > 0
                ) {
                  const projectFolder: string = operation.associatedProject?.projectFolder;
                  const missingFolders: string[] = [];
                  operation.settings.outputFolderNames.forEach((outputFolderName: string) => {
                    if (!FileSystem.exists(`${projectFolder}/${outputFolderName}`)) {
                      missingFolders.push(outputFolderName);
                    }
                  });
                  if (missingFolders.length > 0) {
                    terminal.writeWarningLine(
                      `Operation "${operation.name}": The following output folders do not exist: "${missingFolders.join('", "')}". Skipping cache population.`
                    );
                    return;
                  }
                }

                const success: boolean = await projectBuildCache.trySetCacheEntryAsync(terminal);
                if (success) {
                  ++successCount;
                  terminal.writeLine(
                    `Operation "${operation.name}": Existing outputs have been successfully written to the build cache."`
                  );
                  terminal.writeLine(`Cache key: ${projectBuildCache.cacheId}`);
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

  private _getCacheAction(
    customParameters: ReadonlyMap<string, CommandLineParameter>
  ): CacheAction | undefined {
    const cacheActionParameter: CommandLineParameter | undefined = customParameters.get(
      this._actionParameterName
    );

    if (cacheActionParameter) {
      if (cacheActionParameter.kind !== CommandLineParameterKind.Choice) {
        throw new Error(
          `The parameter "${this._actionParameterName}" must be a choice. Please check the plugin configuration.`
        );
      }

      if (
        cacheActionParameter.alternatives.size !== 2 ||
        !cacheActionParameter.alternatives.has(CACHE_ACTION_READ) ||
        !cacheActionParameter.alternatives.has(CACHE_ACTION_WRITE)
      ) {
        throw new Error(
          `The parameter "${this._actionParameterName}" must have exactly two choices: "${CACHE_ACTION_READ}" and "${CACHE_ACTION_WRITE}". Please check the plugin configuration.`
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

  private _isRequireOutputFoldersFlagSet(
    customParameters: ReadonlyMap<string, CommandLineParameter>
  ): boolean {
    if (!this._requireOutputFoldersParameterName) {
      return false;
    }

    const requireOutputFoldersParam: CommandLineParameter | undefined = customParameters.get(
      this._requireOutputFoldersParameterName
    );

    if (!requireOutputFoldersParam) {
      return false;
    }

    if (requireOutputFoldersParam.kind !== CommandLineParameterKind.Flag) {
      throw new Error(`The parameter "${this._requireOutputFoldersParameterName}" must be a flag.`);
    }

    return requireOutputFoldersParam.value;
  }
}
