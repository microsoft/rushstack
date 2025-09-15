// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPhase } from '../../api/CommandLineConfiguration';
import type {
  ICreateOperationsContext,
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
    // Workaround until the operation graph persists for the lifetime of the watch process
    const runnerCache: Map<string, IPCOperationRunner> = new Map();

    const operationStatesByRunner: WeakMap<IPCOperationRunner, IOperationExecutionResult> = new WeakMap();

    let currentContext: ICreateOperationsContext | undefined;

    hooks.createOperations.tapPromise(
      {
        name: PLUGIN_NAME,
        before: ShellOperationPluginName
      },
      async (operations: Set<Operation>, context: ICreateOperationsContext) => {
        const { isWatch, isInitial } = context;
        if (!isWatch) {
          return operations;
        }

        currentContext = context;

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

          const rawScript: string | undefined =
            (!isInitial ? scripts[`${phaseName}:incremental:ipc`] : undefined) ?? scripts[`${phaseName}:ipc`];

          if (!rawScript) {
            continue;
          }

          // This is the command that will be used to identify the cache entry for this operation, to allow
          // for this operation (or downstream operations) to be restored from the build cache.
          const commandForHash: string | undefined = phase.shellCommand ?? scripts?.[phaseName];

          const customParameterValues: ReadonlyArray<string> = getCustomParameterValuesForPhase(phase);
          const commandToRun: string = formatCommand(rawScript, customParameterValues);

          const operationName: string = getDisplayName(phase, project);
          let maybeIpcOperationRunner: IPCOperationRunner | undefined = runnerCache.get(operationName);
          if (!maybeIpcOperationRunner) {
            const ipcOperationRunner: IPCOperationRunner = (maybeIpcOperationRunner = new IPCOperationRunner({
              phase,
              project,
              name: operationName,
              commandToRun,
              commandForHash,
              persist: true,
              requestRun: (requestor: string, detail?: string) => {
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

                currentContext?.invalidateOperation?.(
                  operation,
                  detail ? `${requestor}: ${detail}` : requestor
                );
              }
            }));
            runnerCache.set(operationName, ipcOperationRunner);
          }

          operation.runner = maybeIpcOperationRunner;
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

    hooks.shutdownAsync.tapPromise(PLUGIN_NAME, async () => {
      await Promise.all(Array.from(runnerCache.values(), (runner) => runner.shutdownAsync()));
    });
  }
}
