// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPhase } from '../../api/CommandLineConfiguration.ts';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject.ts';
import { RushConstants } from '../RushConstants.ts';
import { NullOperationRunner } from './NullOperationRunner.ts';
import { convertSlashesForWindows, ShellOperationRunner } from './ShellOperationRunner.ts';
import { OperationStatus } from './OperationStatus.ts';
import type {
  ICreateOperationsContext,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks.ts';
import type { Operation } from './Operation.ts';
import type { RushConfiguration } from '../../api/RushConfiguration.ts';
import type { IOperationRunner } from './IOperationRunner.ts';
import { IS_WINDOWS } from '../../utilities/executionUtilities.ts';

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
          getCustomParameterValuesByOperation();

        for (const operation of operations) {
          const { associatedPhase: phase, associatedProject: project } = operation;

          if (!operation.runner) {
            // This is a shell command. In the future, may consider having a property on the initial operation
            // to specify a runner type requested in rush-project.json
            const { parameterValues: customParameterValues, ignoredParameterValues } =
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
              ignoredParameterValues,
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
  ignoredParameterValues: ReadonlyArray<string>;
}): IOperationRunner {
  const { phase, project, commandToRun: rawCommandToRun, displayName, ignoredParameterValues } = options;

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
      ignoredParameterValues
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
   * The serialized custom parameter values that were ignored for this operation
   */
  ignoredParameterValues: ReadonlyArray<string>;
}

/**
 * Helper function to collect all parameter arguments for a phase
 */
function collectPhaseParameterArguments(phase: IPhase): string[] {
  const customParameterList: string[] = [];
  for (const tsCommandLineParameter of phase.associatedParameters) {
    tsCommandLineParameter.appendToArgList(customParameterList);
  }
  return customParameterList;
}

/**
 * Memoizer for custom parameter values by phase
 * @returns A function that returns the custom parameter values for a given phase
 */
export function getCustomParameterValuesByPhase(): (phase: IPhase) => ReadonlyArray<string> {
  const customParametersByPhase: Map<IPhase, string[]> = new Map();

  function getCustomParameterValuesForPhase(phase: IPhase): ReadonlyArray<string> {
    let customParameterList: string[] | undefined = customParametersByPhase.get(phase);
    if (!customParameterList) {
      customParameterList = collectPhaseParameterArguments(phase);
      customParametersByPhase.set(phase, customParameterList);
    }

    return customParameterList;
  }

  return getCustomParameterValuesForPhase;
}

/**
 * Gets custom parameter values for an operation, filtering out any parameters that should be ignored
 * based on the operation's settings.
 * @returns A function that returns the filtered custom parameter values and ignored parameter values for a given operation
 */
export function getCustomParameterValuesByOperation(): (
  operation: Operation
) => ICustomParameterValuesForOperation {
  const customParametersByPhase: Map<IPhase, string[]> = new Map();

  function getCustomParameterValuesForOp(operation: Operation): ICustomParameterValuesForOperation {
    const { associatedPhase: phase, settings } = operation;

    // Check if there are any parameters to ignore
    const parameterNamesToIgnore: string[] | undefined = settings?.parameterNamesToIgnore;
    if (!parameterNamesToIgnore || parameterNamesToIgnore.length === 0) {
      // No filtering needed - use the cached parameter list for efficiency
      let customParameterList: string[] | undefined = customParametersByPhase.get(phase);
      if (!customParameterList) {
        customParameterList = collectPhaseParameterArguments(phase);
        customParametersByPhase.set(phase, customParameterList);
      }

      return {
        parameterValues: customParameterList,
        ignoredParameterValues: []
      };
    }

    // Filtering is needed - we must iterate through parameter objects to check longName
    // Note: We cannot use the cached parameter list here because we need access to
    // the parameter objects to get their longName property for filtering
    const ignoreSet: Set<string> = new Set(parameterNamesToIgnore);
    const filteredParameterValues: string[] = [];
    const ignoredParameterValues: string[] = [];

    for (const tsCommandLineParameter of phase.associatedParameters) {
      const parameterLongName: string = tsCommandLineParameter.longName;

      tsCommandLineParameter.appendToArgList(
        ignoreSet.has(parameterLongName) ? ignoredParameterValues : filteredParameterValues
      );
    }

    return {
      parameterValues: filteredParameterValues,
      ignoredParameterValues
    };
  }

  return getCustomParameterValuesForOp;
}

export function formatCommand(rawCommand: string, customParameterValues: ReadonlyArray<string>): string {
  if (!rawCommand) {
    return '';
  } else {
    const fullCommand: string = `${rawCommand} ${customParameterValues.join(' ')}`;
    return IS_WINDOWS ? convertSlashesForWindows(fullCommand) : fullCommand;
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
