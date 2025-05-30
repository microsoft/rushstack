// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { OperationBuildCache } from '@rushstack/rush-sdk';
import type {
  BuildCacheConfiguration,
  IExecuteOperationsContext,
  ILogger,
  IOperationExecutionResult,
  IPhasedCommand,
  IRushPlugin,
  Operation,
  OperationExecutionRecord,
  RushSession
} from '@rushstack/rush-sdk';

const PLUGIN_NAME: 'RushBridgeCachePlugin' = 'RushBridgeCachePlugin';

export class BridgeCachePlugin implements IRushPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public apply(session: RushSession): void {
    const isSetCacheOnly: boolean = process.argv.includes('--set-cache-only');
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
      // tracks the projects being targeted by the command (--to, --only etc.)
      const targetProjects: Set<Operation> = new Set<Operation>();

      // cancel the actual operations. We don't want to run the command, just cache the output folders on disk
      command.hooks.createOperations.tap(
        { name: PLUGIN_NAME, stage: Number.MAX_SAFE_INTEGER },
        (operations: Set<Operation>): Set<Operation> => {
          operations.forEach((operation: Operation) => {
            if (operation.enabled) {
              targetProjects.add(operation);
            }
          });
          return cancelOperations(operations);
        }
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

          await this._setCacheAsync(
            session,
            context.buildCacheConfiguration,
            recordByOperation,
            targetProjects
          );
        }
      );
    });
  }

  private async _setCacheAsync(
    session: RushSession,
    buildCacheConfiguration: BuildCacheConfiguration,
    recordByOperation: Map<Operation, IOperationExecutionResult>,
    targetProjects: Set<Operation>
  ): Promise<void> {
    const logger: ILogger = session.getLogger(PLUGIN_NAME);

    recordByOperation.forEach(
      async (operationExecutionResult: IOperationExecutionResult, operation: Operation) => {
        const { associatedProject, associatedPhase } = operation;

        // omit operations that aren't targeted, or packages without a command for this phase
        const hasCommand: boolean = !!associatedProject.packageJson.scripts?.[associatedPhase.name];
        if (!targetProjects.has(operation) || !hasCommand) {
          return;
        }

        const projectBuildCache: OperationBuildCache = OperationBuildCache.forOperation(
          operationExecutionResult as OperationExecutionRecord,
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
          process.exit(1);
        }
      }
    );
  }
}
