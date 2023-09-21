// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPhase } from '../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { RushConstants } from '../RushConstants';
import { NullOperationRunner } from './NullOperationRunner';
import { convertSlashesForWindows, ShellOperationRunner } from './ShellOperationRunner';
import { OperationStatus } from './OperationStatus';
import type {
  ICreateOperationsContext,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import { Operation } from './Operation';

const PLUGIN_NAME: 'ShellOperationRunnerPlugin' = 'ShellOperationRunnerPlugin';

/**
 * Core phased command plugin that provides the functionality for executing an operation via shell command.
 */
export class ShellOperationRunnerPlugin implements IPhasedCommandPlugin {
  public apply(hooks: PhasedCommandHooks): void {
    hooks.createOperations.tap(PLUGIN_NAME, createShellOperations);
  }
}

function createShellOperations(
  operations: Set<Operation>,
  context: ICreateOperationsContext
): Set<Operation> {
  const { phaseSelection: selectedPhases, projectChangeAnalyzer, rushConfiguration } = context;

  const customParametersByPhase: Map<IPhase, string[]> = new Map();

  function getCustomParameterValuesForPhase(phase: IPhase): ReadonlyArray<string> {
    let customParameterValues: string[] | undefined = customParametersByPhase.get(phase);
    if (!customParameterValues) {
      customParameterValues = [];
      for (const tsCommandLineParameter of phase.associatedParameters) {
        tsCommandLineParameter.appendToArgList(customParameterValues);
      }

      customParametersByPhase.set(phase, customParameterValues);
    }

    return customParameterValues;
  }

  for (const operation of operations) {
    const { associatedPhase: phase, associatedProject: project } = operation;

    if (phase && project && !operation.runner) {
      // This is a shell command. In the future, may consider having a property on the initial operation
      // to specify a runner type requested in rush-project.json
      const customParameterValues: ReadonlyArray<string> = getCustomParameterValuesForPhase(phase);

      const commandToRun: string | undefined = getScriptToRun(
        project,
        phase.name,
        customParameterValues,
        phase.shellCommand
      );

      if (commandToRun === undefined && phase.missingScriptBehavior === 'error') {
        throw new Error(
          `The project '${project.packageName}' does not define a '${phase.name}' command in the 'scripts' section of its package.json`
        );
      }

      const displayName: string = getDisplayName(phase, project);

      if (commandToRun) {
        const shellOperationRunner: ShellOperationRunner = new ShellOperationRunner({
          commandToRun: commandToRun || '',
          displayName,
          phase,
          projectChangeAnalyzer,
          rushConfiguration,
          rushProject: project,
          selectedPhases
        });
        operation.runner = shellOperationRunner;
      } else {
        // Empty build script indicates a no-op, so use a no-op runner
        operation.runner = new NullOperationRunner({
          name: displayName,
          result: OperationStatus.NoOp,
          silent: phase.missingScriptBehavior === 'silent'
        });
      }
    }
  }

  return operations;
}

function getScriptToRun(
  rushProject: RushConfigurationProject,
  commandToRun: string,
  customParameterValues: ReadonlyArray<string>,
  shellCommand: string | undefined
): string | undefined {
  const { scripts } = rushProject.packageJson;

  const rawCommand: string | undefined | null = shellCommand ?? scripts?.[commandToRun];

  if (rawCommand === undefined || rawCommand === null) {
    return undefined;
  }

  if (!rawCommand) {
    return '';
  } else {
    const shellCommand: string = `${rawCommand} ${customParameterValues.join(' ')}`;
    return process.platform === 'win32' ? convertSlashesForWindows(shellCommand) : shellCommand;
  }
}

function getDisplayName(phase: IPhase, project: RushConfigurationProject): string {
  if (phase.isSynthetic) {
    // Because this is a synthetic phase, just use the project name because there aren't any other phases
    return project.packageName;
  } else {
    const phaseNameWithoutPrefix: string = phase.name.slice(RushConstants.phaseNamePrefix.length);
    return `${project.packageName} (${phaseNameWithoutPrefix})`;
  }
}
