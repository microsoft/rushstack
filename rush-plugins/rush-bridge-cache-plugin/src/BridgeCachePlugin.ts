// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { _OperationBuildCache as OperationBuildCache } from '@rushstack/rush-sdk';
import type {
  BuildCacheConfiguration,
  IExecuteOperationsContext,
  ILogger,
  IOperationExecutionResult,
  IPhasedCommand,
  IRushPlugin,
  Operation,
  RushSession
} from '@rushstack/rush-sdk';

const PLUGIN_NAME: 'RushBridgeCachePlugin' = 'RushBridgeCachePlugin';

export interface IBridgeCachePluginOptions {
  readonly flagName: string;
}
export class BridgeCachePlugin implements IRushPlugin {
  public readonly pluginName: string = PLUGIN_NAME;
  private readonly _flagName: string;

  public constructor(options: IBridgeCachePluginOptions) {
    this._flagName = options.flagName;
  }

  public apply(session: RushSession): void {
    const isSetCacheOnly: boolean = process.argv.includes(this._flagName);
    if (!isSetCacheOnly) {
      return;
    }

    const cancelOperations = (operations: Set<Operation>): Set<Operation> => {
      operations.forEach((operation: Operation) => {
        operation.enabled = false;
      });
      return operations;
    };

    session.hooks.runAnyPhasedCommand.tapPromise(PLUGIN_NAME, async (command: IPhasedCommand) => {
      // cancel the actual operations. We don't want to run the command, just cache the output folders on disk
      command.hooks.createOperations.tap(
        { name: PLUGIN_NAME, stage: Number.MAX_SAFE_INTEGER },
        cancelOperations
      );

      // populate the cache for each operation
      command.hooks.beforeExecuteOperations.tap(
        PLUGIN_NAME,
        async (
          recordByOperation: Map<Operation, IOperationExecutionResult>,
          context: IExecuteOperationsContext
        ): Promise<void> => {
          if (!context.buildCacheConfiguration) {
            return;
          }

          await this._setCacheAsync(session, context.buildCacheConfiguration, recordByOperation);
        }
      );
    });
  }

  private async _setCacheAsync(
    session: RushSession,
    buildCacheConfiguration: BuildCacheConfiguration,
    recordByOperation: Map<Operation, IOperationExecutionResult>
  ): Promise<void> {
    const logger: ILogger = session.getLogger(PLUGIN_NAME);

    recordByOperation.forEach(
      async (operationExecutionResult: IOperationExecutionResult, operation: Operation) => {
        const { associatedProject, associatedPhase } = operation;

        if (operation.isNoOp) {
          return;
        }

        const projectBuildCache: OperationBuildCache = OperationBuildCache.forOperation(
          operationExecutionResult,
          {
            buildCacheConfiguration,
            terminal: logger.terminal
          }
        );

        const success: boolean = await projectBuildCache.trySetCacheEntryAsync(logger.terminal);

        if (success) {
          logger.terminal.writeLine(
            `Cache entry set for ${associatedPhase.name} (${associatedProject.packageName}) from previously generated output folders\n`
          );
        } else {
          logger.terminal.writeErrorLine(
            `Error creating a cache entry set for ${associatedPhase.name} (${associatedProject.packageName}) from previously generated output folders\n`
          );
        }
      }
    );
  }
}
