// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';

import type { IPhasedCommandPlugin, PhasedCommandHooks } from '../../pluginFramework/PhasedCommandHooks';
import type { IDaemonIpcConfiguration } from '../../api/RushProjectConfiguration';
import type { Operation } from './Operation';
import { IPCOperationRunner } from './IPCOperationRunner';
import { resolveDaemonIpcConfigurationAsync, type IResolvedDaemonIpcConfiguration } from './DaemonIpcConfiguration';
import {
  PLUGIN_NAME as ShellOperationPluginName,
  formatCommand,
  getCustomParameterValuesByOperation,
  getDisplayName,
  type ICustomParameterValuesForOperation
} from './ShellOperationRunnerPlugin';

/** Installs only explicitly declared Node tools; native watch and preassigned sharded runners are untouched. */
export class DaemonIpcOperationRunnerPlugin implements IPhasedCommandPlugin {
  public apply(hooks: PhasedCommandHooks): void {
    hooks.createOperationsAsync.tapPromise(
      { name: 'DaemonIpcOperationRunnerPlugin', before: ShellOperationPluginName },
      async (operations, context) => {
        if (context.isWatch || !context.isIncrementalBuildAllowed) return operations;
        const parameters: (operation: Operation) => ICustomParameterValuesForOperation = getCustomParameterValuesByOperation();
        for (const operation of operations) {
          const { associatedPhase: phase, associatedProject: project, settings } = operation;
          const descriptor: IDaemonIpcConfiguration | undefined = settings?.daemonIpc;
          const canonical: string | undefined = phase.shellCommand ?? project.packageJson.scripts?.[phase.name];
          if (operation.runner || settings?.sharding || !descriptor || !canonical) continue;
          const { parameterValues, ignoredParameterValues } = parameters(operation);
          const resolved: IResolvedDaemonIpcConfiguration = await resolveDaemonIpcConfigurationAsync(project.projectFolder, descriptor);
          const childArgs: string[] = [...resolved.args, ...parameterValues];
          operation.runner = new IPCOperationRunner({
            phase,
            project,
            name: getDisplayName(phase, project),
            initialCommand: `${JSON.stringify(process.execPath)} ${[resolved.entryPoint, ...childArgs].map((arg) => JSON.stringify(arg)).join(' ')}`,
            incrementalCommand: undefined,
            commandForHash: formatCommand(canonical, parameterValues),
            ignoredParameterValues,
            requireIpc: true,
            spawn: (command, args, nativeOptions) => {
              void command;
              void args;
              return spawn(
                process.execPath,
                [resolved.entryPoint, ...childArgs],
                { ...nativeOptions, shell: false, windowsVerbatimArguments: false }
              );
            }
          });
        }
        return operations;
      }
    );
  }
}
