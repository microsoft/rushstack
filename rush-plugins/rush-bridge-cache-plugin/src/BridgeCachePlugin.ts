// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { BuildCacheConfiguration, ProjectBuildCache } from '@rushstack/rush-sdk';
import type {
  ILogger,
  IOperationExecutionResult,
  IPhasedCommand,
  IRushPlugin,
  Operation,
  RushConfiguration,
  RushSession
} from '@rushstack/rush-sdk';

const PLUGIN_NAME: 'RushBridgeCachePlugin' = 'RushBridgeCachePlugin';

export class BridgeCachePlugin implements IRushPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public apply(session: RushSession, rushConfiguration: RushConfiguration): void {
    // klutzy. Better way?
    const actionName: string = process.argv[2];

    // const isSetCacheOnly: boolean = process.argv.includes('--set-cache-only'); // has to be allowed for ANY phased command, or be customizable
    // if (!isSetCacheOnly) {
    //   return;
    // }

    // tracks the projects being targeted by the command (--to, --only etc.)
    const targetProjects: string[] = [];

    const cancelOperations = (operations: Set<Operation>): Set<Operation> => {
      operations.forEach((operation: Operation) => {
        if (operation.enabled) {
          targetProjects.push(operation.associatedProject.packageName);
        }

        operation.enabled = false;
      });
      return operations;
    };

    session.hooks.runPhasedCommand
      .for(actionName)
      .tapPromise(PLUGIN_NAME, async (command: IPhasedCommand) => {
        // cancel the actual operations. We don't want to actually run the command, just cache the output folders from a previous run
        command.hooks.createOperations.tap(
          { name: PLUGIN_NAME, stage: Number.MAX_SAFE_INTEGER },
          cancelOperations
        );

        // now populate the cache for each operation
        command.hooks.beforeExecuteOperations.tap(
          PLUGIN_NAME,
          async (recordByOperation: Map<Operation, IOperationExecutionResult>): Promise<void> => {
            await this._setCacheAsync(session, rushConfiguration, recordByOperation, targetProjects);
          }
        );
      });
  }

  private async _setCacheAsync(
    session: RushSession,
    rushConfiguration: RushConfiguration,
    recordByOperation: Map<Operation, IOperationExecutionResult>,
    targetProjects: string[]
  ): Promise<void> {
    const logger: ILogger = session.getLogger(PLUGIN_NAME);

    // const isSetCacheOnly: boolean = process.argv.includes('--set-cache-only');

    recordByOperation.forEach(
      async (operationExecutionResult: IOperationExecutionResult, operation: Operation) => {
        const { associatedProject, associatedPhase, settings } = operation;

        if (!targetProjects.includes(associatedProject.packageName)) {
          return;
        }

        const buildCacheConfiguration: BuildCacheConfiguration | undefined =
          await BuildCacheConfiguration.tryLoadAsync(logger.terminal, rushConfiguration, session);

        if (!buildCacheConfiguration) {
          return;
        }

        const projectBuildCache: ProjectBuildCache = ProjectBuildCache.getProjectBuildCache({
          project: associatedProject,
          projectOutputFolderNames: settings?.outputFolderNames || [],
          buildCacheConfiguration,
          terminal: logger.terminal,
          operationStateHash: operationExecutionResult.getStateHash(),
          phaseName: associatedPhase.name
        });

        const success: boolean = await projectBuildCache.trySetCacheEntryAsync(logger.terminal);

        // eslint-disable-next-line no-console
        console.log('- setting cache for', {
          success,
          name: associatedPhase.name,
          package: associatedProject.packageName
        });
      }
    );
  }
}
