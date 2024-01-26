// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPhase } from '../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IOperationSettings, RushProjectConfiguration } from '../../api/RushProjectConfiguration';
import type {
  ICreateOperationsContext,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import type { IOperationExecutionResult } from './IOperationExecutionResult';
import { IPCOperationRunner } from './IPCOperationRunner';
import type { Operation } from './Operation';
import { OperationStatus } from './OperationStatus';

const PLUGIN_NAME: 'IPCOperationRunnerPlugin' = 'IPCOperationRunnerPlugin';

/**
 * Plugin that implements compatible phases via IPC to a long-lived watch process.
 */
export class IPCOperationRunnerPlugin implements IPhasedCommandPlugin {
  public apply(hooks: PhasedCommandHooks): void {
    // Workaround until the operation graph persists for the lifetime of the watch process
    const runnerCache: Map<string, IPCOperationRunner> = new Map();

    const operationStatesByRunner: WeakMap<IPCOperationRunner, IOperationExecutionResult> = new WeakMap();

    let currentContext: ICreateOperationsContext | undefined;

    hooks.createOperations.tapPromise(
      PLUGIN_NAME,
      async (operations: Set<Operation>, context: ICreateOperationsContext) => {
        const { projectConfigurations, isWatch } = context;
        currentContext = context;

        for (const operation of operations) {
          const { associatedPhase: phase, associatedProject: project, runner } = operation;

          if (phase && project && runner?.constructor.name === 'ShellOperationRunner') {
            const config: RushProjectConfiguration | undefined = projectConfigurations.get(project);
            const operationSettings: IOperationSettings | undefined =
              config?.operationSettingsByOperationName.get(phase.name);
            if (!operationSettings?.useIPCInWatchMode) {
              // Read a config property to determine whether or not to opt in to IPC.
              // Technically the IPC runner should be a superset of the regular ShellOperationRunner,
              // but there is a change to default cacheability.
              continue;
            }

            // Implementation detail.
            const commandToRun: string = runner.getConfigHash();

            const operationName: string = getDisplayName(project, phase);
            let maybeIpcOperationRunner: IPCOperationRunner | undefined = runnerCache.get(operationName);
            if (!maybeIpcOperationRunner) {
              const ipcOperationRunner: IPCOperationRunner = (maybeIpcOperationRunner =
                new IPCOperationRunner({
                  phase,
                  project,
                  name: operationName,
                  shellCommand: commandToRun,
                  warningsAreAllowed: runner.warningsAreAllowed,
                  persist: isWatch,
                  requestRun: (requestor?: string) => {
                    const operationState: IOperationExecutionResult | undefined =
                      operationStatesByRunner.get(ipcOperationRunner);
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

                    currentContext?.invalidateOperation?.(operation, requestor || 'IPC');
                  }
                }));
              runnerCache.set(operationName, ipcOperationRunner);
            }

            operation.runner = maybeIpcOperationRunner;
          }
        }

        return operations;
      }
    );

    hooks.beforeExecuteOperations.tap(
      PLUGIN_NAME,
      (records: Map<Operation, IOperationExecutionResult>, context: ICreateOperationsContext) => {
        currentContext = context;
        for (const [{ runner }, result] of records) {
          if (runner instanceof IPCOperationRunner) {
            operationStatesByRunner.set(runner, result);
          }
        }
      }
    );
  }
}

function getDisplayName(project: RushConfigurationProject, phase: IPhase): string {
  if (phase.isSynthetic) {
    return project.packageName;
  }

  return `${project.packageName} (${phase.name.replace(/^_phase:/g, '')})`;
}
