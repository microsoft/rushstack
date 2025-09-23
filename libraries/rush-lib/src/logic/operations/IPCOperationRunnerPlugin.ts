// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPhase } from '../../api/CommandLineConfiguration';
import type {
  ICreateOperationsContext,
  IOperationExecutionManager,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import type { IOperationExecutionResult } from './IOperationExecutionResult';
import { IPCOperationRunner } from './IPCOperationRunner';
import type { Operation } from './Operation';
import { OperationStatus } from './OperationStatus';
import {
  PLUGIN_NAME as ShellOperationPluginName,
  formatCommand,
  getCustomParameterValuesByPhase,
  getDisplayName
} from './ShellOperationRunnerPlugin';

const PLUGIN_NAME: 'IPCOperationRunnerPlugin' = 'IPCOperationRunnerPlugin';

/**
 * Plugin that implements compatible phases via IPC to a long-lived watch process.
 */
export class IPCOperationRunnerPlugin implements IPhasedCommandPlugin {
  public apply(hooks: PhasedCommandHooks): void {
    let executionManager: IOperationExecutionManager | undefined;

    hooks.executionManagerAsync.tap(PLUGIN_NAME, (manager) => {
      executionManager = manager;
    });

    hooks.createOperationsAsync.tap(
      {
        name: PLUGIN_NAME,
        before: ShellOperationPluginName
      },
      (operations: Set<Operation>, context: ICreateOperationsContext) => {
        const { isWatch, isIncrementalBuildAllowed } = context;
        if (!isWatch || !isIncrementalBuildAllowed) {
          return operations;
        }

        const getCustomParameterValuesForPhase: (phase: IPhase) => ReadonlyArray<string> =
          getCustomParameterValuesByPhase();

        for (const operation of operations) {
          const { associatedPhase: phase, associatedProject: project, runner } = operation;

          if (runner) {
            continue;
          }

          const { scripts } = project.packageJson;
          if (!scripts) {
            continue;
          }

          const { name: phaseName } = phase;

          const incrementalScript: string | undefined = scripts[`${phaseName}:incremental:ipc`];
          let initialScript: string | undefined = scripts[`${phaseName}:ipc`];

          if (!initialScript && !incrementalScript) {
            continue;
          }

          initialScript ??= scripts[phaseName];

          // This is the command that will be used to identify the cache entry for this operation, to allow
          // for this operation (or downstream operations) to be restored from the build cache.
          const commandForHash: string | undefined = phase.shellCommand ?? scripts?.[phaseName];

          const customParameterValues: ReadonlyArray<string> = getCustomParameterValuesForPhase(phase);
          const initialCommand: string = formatCommand(initialScript, customParameterValues);
          const incrementalCommand: string | undefined = incrementalScript
            ? formatCommand(incrementalScript, customParameterValues)
            : undefined;

          const operationName: string = getDisplayName(phase, project);
          const ipcOperationRunner: IPCOperationRunner = new IPCOperationRunner({
            phase,
            project,
            name: operationName,
            initialCommand,
            incrementalCommand,
            commandForHash,
            persist: true,
            requestRun: (requestor: string, detail?: string) => {
              const operationState: IOperationExecutionResult | undefined =
                executionManager?.lastExecutionResults.get(operation);
              if (!operationState) {
                return;
              }

              const status: OperationStatus = operationState.status;
              if (
                status === OperationStatus.Waiting ||
                status === OperationStatus.Ready ||
                status === OperationStatus.Queued
              ) {
                // Already pending. No-op.
                return;
              }

              executionManager?.invalidateOperations(
                [operation],
                detail ? `${requestor}: ${detail}` : requestor
              );
            }
          });

          operation.runner = ipcOperationRunner;
        }

        return operations;
      }
    );
  }
}
