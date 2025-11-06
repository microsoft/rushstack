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
        const { rushConfiguration, isInitial } = context;

        const getCustomParameterValues: (operation: Operation) => ICustomParameterValuesForOperation =
          getCustomParameterValuesForOperation();

        for (const operation of operations) {
          const { associatedPhase: phase, associatedProject: project } = operation;

          if (!operation.runner) {
            // This is a shell command. In the future, may consider having a property on the initial operation
            // to specify a runner type requested in rush-project.json
            const { parameterValues: customParameterValues, ignoredParameterNames } =
              getCustomParameterValues(operation);

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
              ignoredParameterNames,
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
  ignoredParameterNames: ReadonlyArray<string>;
}): IOperationRunner {
  const { phase, project, commandToRun: rawCommandToRun, displayName, ignoredParameterNames } = options;

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
      rushProject: project,
      ignoredParameterNames
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
 * Result of filtering custom parameters for an operation
 */
export interface ICustomParameterValuesForOperation {
  /**
   * The serialized custom parameter values that should be included in the command
   */
  parameterValues: ReadonlyArray<string>;
  /**
   * The names of parameters that were ignored for this operation
   */
  ignoredParameterNames: ReadonlyArray<string>;
}

/**
 * Memoizer for custom parameter values by phase
 * @returns A function that returns the custom parameter values for a given phase
 */
export function getCustomParameterValuesByPhase(): (phase: IPhase) => ReadonlyArray<string> {
  const customParametersByPhase: Map<IPhase, Set<string>> = new Map();

  function getCustomParameterValuesForPhase(phase: IPhase): ReadonlyArray<string> {
    let customParameterSet: Set<string> | undefined = customParametersByPhase.get(phase);
    if (!customParameterSet) {
      const customParameterValues: string[] = [];
      for (const tsCommandLineParameter of phase.associatedParameters) {
        tsCommandLineParameter.appendToArgList(customParameterValues);
      }

      customParameterSet = new Set(customParameterValues);
      customParametersByPhase.set(phase, customParameterSet);
    }

    return Array.from(customParameterSet);
  }

  return getCustomParameterValuesForPhase;
}

/**
 * Gets custom parameter values for an operation, filtering out any parameters that should be ignored
 * based on the operation's settings.
 * @returns A function that returns the filtered custom parameter values and ignored parameter names for a given operation
 */
export function getCustomParameterValuesForOperation(): (
  operation: Operation
) => ICustomParameterValuesForOperation {
  const customParametersByPhase: Map<IPhase, Set<string>> = new Map();

  function getCustomParameterValuesForOp(operation: Operation): ICustomParameterValuesForOperation {
    const { associatedPhase: phase, settings } = operation;

    // Get or compute the set of all custom parameters for this phase
    let customParameterSet: Set<string> | undefined = customParametersByPhase.get(phase);
    if (!customParameterSet) {
      customParameterSet = new Set();
      for (const tsCommandLineParameter of phase.associatedParameters) {
        const tempArgs: string[] = [];
        tsCommandLineParameter.appendToArgList(tempArgs);
        for (const arg of tempArgs) {
          customParameterSet.add(arg);
        }
      }

      customParametersByPhase.set(phase, customParameterSet);
    }

    // If there are no parameters to ignore, return early with all parameters
    const parameterNamesToIgnore: string[] | undefined = settings?.parameterNamesToIgnore;
    if (!parameterNamesToIgnore || parameterNamesToIgnore.length === 0) {
      return {
        parameterValues: Array.from(customParameterSet),
        ignoredParameterNames: []
      };
    }

    // Create a set of parameter long names to ignore for fast lookup
    const ignoreSet: Set<string> = new Set(parameterNamesToIgnore);

    // Filter out ignored parameters and track which ones were ignored
    const filteredParameterValues: string[] = [];
    const ignoredParameterNames: string[] = [];

    for (const tsCommandLineParameter of phase.associatedParameters) {
      const parameterLongName: string = tsCommandLineParameter.longName;

      if (ignoreSet.has(parameterLongName)) {
        // This parameter should be ignored for this operation
        ignoredParameterNames.push(parameterLongName);
      } else {
        // Include this parameter in the command
        tsCommandLineParameter.appendToArgList(filteredParameterValues);
      }
    }

    return {
      parameterValues: filteredParameterValues,
      ignoredParameterNames
    };
  }

  return getCustomParameterValuesForOp;
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
