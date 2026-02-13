// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import { OperationStatus } from './OperationStatus';
import type { IPhasedCommandPlugin, PhasedCommandHooks } from '../../pluginFramework/PhasedCommandHooks';
import type { IOperationRunnerContext } from './IOperationRunner';
import type { OperationExecutionRecord } from './OperationExecutionRecord';
import { getProjectLogFilePaths } from './ProjectLogWritable';

const PLUGIN_NAME: 'ShowExistingFailureLogsPlugin' = 'ShowExistingFailureLogsPlugin';

export interface IShowExistingFailureLogsPluginOptions {
  terminal: ITerminal;
}

/**
 * Plugin that replays existing failure logs without executing operations.
 * This is useful for reviewing failures from a previous run.
 */
export class ShowExistingFailureLogsPlugin implements IPhasedCommandPlugin {
  private readonly _options: IShowExistingFailureLogsPluginOptions;

  public constructor(options: IShowExistingFailureLogsPluginOptions) {
    this._options = options;
  }

  public apply(hooks: PhasedCommandHooks): void {
    hooks.beforeExecuteOperation.tapPromise(
      PLUGIN_NAME,
      async (runnerContext: IOperationRunnerContext): Promise<OperationStatus | undefined> => {
        const record: OperationExecutionRecord = runnerContext as OperationExecutionRecord;
        const { operation, _operationMetadataManager: operationMetadataManager } = record;

        const { associatedProject: project } = operation;

        // Get the path to the error log file
        const { error: errorLogPath } = getProjectLogFilePaths({
          project,
          logFilenameIdentifier: operation.logFilenameIdentifier
        });

        // Check if an error log exists from a previous run
        const errorLogExists: boolean = await FileSystem.existsAsync(errorLogPath);

        if (errorLogExists) {
          // Replay the failure log
          await runnerContext.runWithTerminalAsync(
            async (taskTerminal, terminalProvider) => {
              // Restore the operation logs
              await operationMetadataManager?.tryRestoreAsync({
                terminalProvider,
                terminal: taskTerminal,
                errorLogPath,
                cobuildContextId: undefined,
                cobuildRunnerId: undefined
              });
            },
            { createLogFile: false, logFileSuffix: '' }
          );

          // Return Failure status to indicate this operation had previously failed
          return OperationStatus.Failure;
        } else {
          // No error log exists, so this operation either succeeded or wasn't run
          // Return Skipped to silence it
          return OperationStatus.Skipped;
        }
      }
    );
  }
}
