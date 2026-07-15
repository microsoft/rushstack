// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  ICreateOperationsContext,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import { IPCOperationRunner } from './IPCOperationRunner';
import type { Operation } from './Operation';
import {
  PLUGIN_NAME as ShellOperationPluginName,
  formatCommand,
  getCustomParameterValuesByOperation,
  type ICustomParameterValuesForOperation,
  getDisplayName
} from './ShellOperationRunnerPlugin';

const PLUGIN_NAME: 'IPCOperationRunnerPlugin' = 'IPCOperationRunnerPlugin';

/**
 * Plugin that implements compatible phases via IPC to a long-lived watch process.
 */
export class IPCOperationRunnerPlugin implements IPhasedCommandPlugin {
  public apply(hooks: PhasedCommandHooks): void {
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

        const getCustomParameterValues: (operation: Operation) => ICustomParameterValuesForOperation =
          getCustomParameterValuesByOperation();

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

          // Both must be absent to skip. A project may define only one of `_phase:ipc` or
          // `_phase:incremental:ipc` — defining either opts into the IPC runner.
          if (!initialScript && !incrementalScript) {
            continue;
          }

          initialScript ??= scripts[phaseName];

          // This is the command that will be used to identify the cache entry for this operation, to allow
          // for this operation (or downstream operations) to be restored from the build cache.
          const commandForHash: string | undefined = phase.shellCommand ?? scripts?.[phaseName];

          const { parameterValues: customParameterValues, ignoredParameterValues } =
            getCustomParameterValues(operation);
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
            ignoredParameterValues
          });

          operation.runner = ipcOperationRunner;
        }

        return operations;
      }
    );
  }
}
