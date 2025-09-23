// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Async, FileSystem } from '@rushstack/node-core-library';
import {
  _OperationBuildCache as OperationBuildCache,
  OperationStatus,
  type Operation,
  type IOperationExecutionResult,
  type IOperationGraphIterationOptions
} from '@rushstack/rush-sdk';
import type {
  ILogger,
  IBaseOperationExecutionResult,
  IPhasedCommand,
  IRushPlugin,
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
      command.hooks.onGraphCreatedAsync.tap(PLUGIN_NAME, async (graph, context) => {
        const { customParameters, buildCacheConfiguration } = context;
        const cacheAction: CacheAction | undefined = this._getCacheAction(customParameters);

        if (cacheAction !== undefined) {
          if (!buildCacheConfiguration?.buildCacheEnabled) {
            throw new Error(
              `The build cache must be enabled to use the "${this._actionParameterName}" parameter.`
            );
          }

          const logger: ILogger = session.getLogger(PLUGIN_NAME);
          const { terminal } = logger;
          const requireOutputFolders: boolean = this._isRequireOutputFoldersFlagSet(customParameters);

          graph.hooks.beforeExecuteIterationAsync.tapPromise(
            PLUGIN_NAME,
            async (
              operationRecords: ReadonlyMap<Operation, IOperationExecutionResult>,
              iterationOptions: IOperationGraphIterationOptions
            ): Promise<OperationStatus | undefined> => {
              const filteredOperations: IBaseOperationExecutionResult[] = [];
              for (const record of operationRecords.values()) {
                if (!record.operation.isNoOp) {
                  filteredOperations.push(record);
                }
              }

              if (!filteredOperations.length) {
                return; // nothing to do, continue normal execution
              }

              let successCount: number = 0;
              await Async.forEachAsync(
                filteredOperations,
                async (operationExecutionResult: IBaseOperationExecutionResult) => {
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
                { concurrency: context.parallelism }
              );

              terminal.writeLine(
                `Cache operation "${cacheAction}" completed successfully for ${successCount} out of ${filteredOperations.length} operations.`
              );

              // Bail out with a status indicating success; treat cache read as FromCache.
              return cacheAction === CACHE_ACTION_READ ? OperationStatus.FromCache : OperationStatus.Success;
            }
          );
        }
      });
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
