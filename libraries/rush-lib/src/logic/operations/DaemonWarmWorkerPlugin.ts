// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  ICreateOperationsContext,
  IOperationGraphContext,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import type { IOperationGraph } from './IOperationGraph';
import type { IOperationExecutionResult } from './IOperationExecutionResult';
import type { IOperationRunnerContext } from './IOperationRunner';
import type { Operation } from './Operation';
import type { OperationStatus } from './OperationStatus';
import {
  PLUGIN_NAME as ShellOperationPluginName,
  formatCommand,
  getCustomParameterValuesByOperation,
  getDisplayName,
  type ICustomParameterValuesForOperation
} from './ShellOperationRunnerPlugin';
import { WarmWorkerOperationRunner } from './WarmWorkerOperationRunner';

const PLUGIN_NAME: 'DaemonWarmWorkerPlugin' = 'DaemonWarmWorkerPlugin';

// Before the default stage, so that a worker that must not be reused is closed before CacheableOperationPlugin
// restores the operation's outputs, and before the Rush daemon notes which runners were active.
const PREPARE_STAGE: number = -1;

/**
 * Runs the operations whose settings set `allowDaemonWarmWorker` and whose projects define a
 * `<phase>:incremental:ipc` script in warm workers, see `WarmWorkerOperationRunner`. For the non-watch commands of
 * the Rush daemon, with `IncrementalExecutionGuardPlugin`, which decides whether a worker may build on top of the
 * outputs of its last run.
 *
 * @remarks
 * The script alone is not enough, because `rush start` runs the same script in watch mode, where a project may
 * intend to skip tasks such as lint. Operations that already have a runner, e.g. one for an explicit IPC tool, and
 * operations with a shell command or shards are not changed.
 */
export class DaemonWarmWorkerPlugin implements IPhasedCommandPlugin {
  public apply(hooks: PhasedCommandHooks): void {
    hooks.createOperationsAsync.tap(
      {
        name: PLUGIN_NAME,
        before: ShellOperationPluginName
      },
      (operations: Set<Operation>, context: ICreateOperationsContext): Set<Operation> => {
        const { isWatch, isIncrementalBuildAllowed } = context;
        if (isWatch || !isIncrementalBuildAllowed) {
          return operations;
        }

        const getCustomParameterValues: (operation: Operation) => ICustomParameterValuesForOperation =
          getCustomParameterValuesByOperation();

        for (const operation of operations) {
          const { associatedPhase: phase, associatedProject: project, runner, settings } = operation;
          if (
            runner ||
            phase.shellCommand !== undefined ||
            settings?.sharding ||
            settings?.allowDaemonWarmWorker !== true
          ) {
            continue;
          }

          const { scripts } = project.packageJson;
          const { name: phaseName } = phase;
          const initialScript: string | undefined = scripts?.[phaseName];
          const incrementalIpcScript: string | undefined = scripts?.[`${phaseName}:incremental:ipc`];
          if (!initialScript || !incrementalIpcScript) {
            continue;
          }
          const initialIpcScript: string | undefined = scripts?.[`${phaseName}:ipc`];

          const { parameterValues: customParameterValues, ignoredParameterValues } =
            getCustomParameterValues(operation);
          const initialCommand: string = formatCommand(initialScript, customParameterValues);
          operation.runner = new WarmWorkerOperationRunner({
            phase,
            rushProject: project,
            displayName: getDisplayName(phase, project),
            initialCommand,
            initialIpcCommand: initialIpcScript
              ? formatCommand(initialIpcScript, customParameterValues)
              : undefined,
            incrementalIpcCommand: formatCommand(incrementalIpcScript, customParameterValues),
            // As for ShellOperationRunner, so that the build cache entries do not depend on warm workers.
            commandForHash: initialCommand,
            ignoredParameterValues
          });
        }

        return operations;
      }
    );

    hooks.onGraphCreatedAsync.tap(PLUGIN_NAME, (graph: IOperationGraph, context: IOperationGraphContext) => {
      if (context.isWatch || !context.isIncrementalBuildAllowed) {
        return;
      }
      graph.hooks.beforeExecuteOperationAsync.tapPromise(
        { name: PLUGIN_NAME, stage: PREPARE_STAGE },
        async (
          record: IOperationRunnerContext & IOperationExecutionResult
        ): Promise<OperationStatus | undefined> => {
          const { operation } = record;
          const { runner } = operation;
          if (record.enabled && runner instanceof WarmWorkerOperationRunner) {
            await runner.prepareAsync(record, graph.resultByOperation.has(operation));
          }
          return undefined;
        }
      );
      graph.hooks.afterExecuteOperationAsync.tapPromise(
        PLUGIN_NAME,
        async (record: IOperationRunnerContext & IOperationExecutionResult): Promise<void> => {
          const { runner } = record.operation;
          if (runner instanceof WarmWorkerOperationRunner) {
            await runner.writeUnusedNotesAsync(record);
          }
        }
      );
    });
  }
}
