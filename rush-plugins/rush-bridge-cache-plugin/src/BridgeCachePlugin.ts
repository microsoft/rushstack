// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Async } from '@rushstack/node-core-library';
import { _OperationBuildCache as OperationBuildCache } from '@rushstack/rush-sdk';
import type {
  BuildCacheConfiguration,
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

export interface IBridgeCachePluginOptions {
  readonly flagName: string;
}

export class BridgeCachePlugin implements IRushPlugin {
  public readonly pluginName: string = PLUGIN_NAME;
  private readonly _flagName: string;

  public constructor(options: IBridgeCachePluginOptions) {
    this._flagName = options.flagName;

    if (!this._flagName) {
      throw new Error(
        'The "flagName" option must be provided for the BridgeCachePlugin. Please see the plugin README for details.'
      );
    }
  }

  public apply(session: RushSession): void {
    session.hooks.runAnyPhasedCommand.tapPromise(PLUGIN_NAME, async (command: IPhasedCommand) => {
      const logger: ILogger = session.getLogger(PLUGIN_NAME);

      // cancel the actual operations. We don't want to run the command, just cache the output folders on disk
      command.hooks.createOperations.tap(
        { name: PLUGIN_NAME, stage: Number.MAX_SAFE_INTEGER },
        (operations: Set<Operation>, context: ICreateOperationsContext): Set<Operation> => {
          const flagValue: boolean = this._getFlagValue(context);
          if (flagValue) {
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
          if (!context.buildCacheConfiguration) {
            return;
          }

          const flagValue: boolean = this._getFlagValue(context);
          if (flagValue) {
            await this._setCacheAsync(logger, context.buildCacheConfiguration, recordByOperation);
          }
        }
      );
    });
  }

  private _getFlagValue(context: IExecuteOperationsContext): boolean {
    const flagParam: CommandLineParameter | undefined = context.customParameters.get(this._flagName);
    if (flagParam) {
      if (flagParam.kind !== CommandLineParameterKind.Flag) {
        throw new Error(
          `The parameter "${this._flagName}" must be a flag. Please check the plugin configuration.`
        );
      }

      return flagParam.value;
    }

    return false;
  }

  private async _setCacheAsync(
    { terminal }: ILogger,
    buildCacheConfiguration: BuildCacheConfiguration,
    recordByOperation: Map<Operation, IOperationExecutionResult>
  ): Promise<void> {
    Async.forEachAsync(
      recordByOperation,
      async ([
        {
          associatedProject: { packageName },
          associatedPhase: { name: phaseName },
          isNoOp
        },
        operationExecutionResult
      ]) => {
        if (isNoOp) {
          return;
        }

        const projectBuildCache: OperationBuildCache = OperationBuildCache.forOperation(
          operationExecutionResult,
          {
            buildCacheConfiguration,
            terminal
          }
        );

        const success: boolean = await projectBuildCache.trySetCacheEntryAsync(terminal);

        if (success) {
          terminal.writeLine(
            `Cache entry set for ${phaseName} (${packageName}) from previously generated output folders`
          );
        } else {
          terminal.writeErrorLine(
            `Error creating a cache entry set for ${phaseName} (${packageName}) from previously generated output folders`
          );
        }
      },
      { concurrency: 5 }
    );
  }
}
