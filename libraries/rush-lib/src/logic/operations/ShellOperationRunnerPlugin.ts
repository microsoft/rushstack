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
import type { Operation } from './Operation';
import type { RushConfiguration } from '../../api/RushConfiguration';
import type { IOperationRunner } from './IOperationRunner';

export const PLUGIN_NAME: 'ShellOperationRunnerPlugin' = 'ShellOperationRunnerPlugin';

/**
 * Core phased command plugin that provides the functionality for executing an operation via shell command.
 */
export class ShellOperationRunnerPlugin implements IPhasedCommandPlugin {
  public apply(hooks: PhasedCommandHooks): void {
    hooks.createOperations.tap(
      PLUGIN_NAME,
      function createShellOperations(
        operations: Set<Operation>,
        context: ICreateOperationsContext
      ): Set<Operation> {
        const { rushConfiguration, isInitial, remainderArgs } = context;

        const getCustomParameterValuesForPhase: (phase: IPhase) => ReadonlyArray<string> =
          getCustomParameterValuesByPhase(remainderArgs);
        for (const operation of operations) {
          const { associatedPhase: phase, associatedProject: project } = operation;

          if (!operation.runner) {
            // This is a shell command. In the future, may consider having a property on the initial operation
            // to specify a runner type requested in rush-project.json
            const customParameterValues: ReadonlyArray<string> = getCustomParameterValuesForPhase(phase);

            const displayName: string = getDisplayName(phase, project);
            const { name: phaseName, shellCommand } = phase;

            const { scripts } = project.packageJson;

            // This is the command that will be used to identify the cache entry for this operation
            const commandForHash: string | undefined = shellCommand ?? scripts?.[phaseName];

            // For execution of non-initial runs, prefer the `:incremental` script if it exists.
            // However, the `shellCommand` value still takes precedence per the spec for that feature.
            const commandToRun: string | undefined =
              shellCommand ??
              (!isInitial ? scripts?.[`${phaseName}:incremental`] : undefined) ??
              scripts?.[phaseName];

            operation.runner = initializeShellOperationRunner({
              phase,
              project,
              displayName,
              commandForHash,
              commandToRun,
              customParameterValues,
              rushConfiguration
            });
          }
        }

        return operations;
      }
    );
  }
}

export function initializeShellOperationRunner(options: {
  phase: IPhase;
  project: RushConfigurationProject;
  displayName: string;
  rushConfiguration: RushConfiguration;
  commandToRun: string | undefined;
  commandForHash?: string;
  customParameterValues: ReadonlyArray<string>;
}): IOperationRunner {
  const { phase, project, commandToRun: rawCommandToRun, displayName } = options;

  if (typeof rawCommandToRun !== 'string' && phase.missingScriptBehavior === 'error') {
    throw new Error(
      `The project '${project.packageName}' does not define a '${phase.name}' command in the 'scripts' section of its package.json`
    );
  }

  if (rawCommandToRun) {
    const { commandForHash: rawCommandForHash, customParameterValues } = options;

    const commandToRun: string = formatCommand(rawCommandToRun, customParameterValues);
    const commandForHash: string = rawCommandForHash
      ? formatCommand(rawCommandForHash, customParameterValues)
      : commandToRun;

    return new ShellOperationRunner({
      commandToRun,
      commandForHash,
      displayName,
      phase,
      rushProject: project
    });
  } else {
    // Empty build script indicates a no-op, so use a no-op runner
    return new NullOperationRunner({
      name: displayName,
      result: OperationStatus.NoOp,
      silent: phase.missingScriptBehavior === 'silent'
    });
  }
}

/**
 * Memoizer for custom parameter values by phase
 * @returns A function that returns the custom parameter values for a given phase
 */
export function getCustomParameterValuesByPhase(
  remainderArgs?: ReadonlyArray<string>
): (phase: IPhase) => ReadonlyArray<string> {
  const customParametersByPhase: Map<IPhase, string[]> = new Map();

  function getCustomParameterValuesForPhase(phase: IPhase): ReadonlyArray<string> {
    let customParameterValues: string[] | undefined = customParametersByPhase.get(phase);
    if (!customParameterValues) {
      customParameterValues = [];
      for (const tsCommandLineParameter of phase.associatedParameters) {
        tsCommandLineParameter.appendToArgList(customParameterValues);
      }

      // Add remainder arguments if they exist
      if (remainderArgs && remainderArgs.length > 0) {
        customParameterValues.push(...remainderArgs);
      }

      customParametersByPhase.set(phase, customParameterValues);
    }

    return customParameterValues;
  }

  return getCustomParameterValuesForPhase;
}

export function formatCommand(rawCommand: string, customParameterValues: ReadonlyArray<string>): string {
  if (!rawCommand) {
    return '';
  } else {
    const fullCommand: string = `${rawCommand} ${customParameterValues.join(' ')}`;
    return process.platform === 'win32' ? convertSlashesForWindows(fullCommand) : fullCommand;
  }
}

export function getDisplayName(phase: IPhase, project: RushConfigurationProject): string {
  if (phase.isSynthetic) {
    // Because this is a synthetic phase, just use the project name because there aren't any other phases
    return project.packageName;
  } else {
    const phaseNameWithoutPrefix: string = phase.name.slice(RushConstants.phaseNamePrefix.length);
    return `${project.packageName} (${phaseNameWithoutPrefix})`;
  }
}
