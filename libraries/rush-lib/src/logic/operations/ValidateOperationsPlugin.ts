// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/terminal';

import type { Operation } from './Operation';
import type {
  ICreateOperationsContext,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import type { IOperationExecutionResult } from './IOperationExecutionResult';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { RushProjectConfiguration } from '../../api/RushProjectConfiguration';
import type { IPhase } from '../../api/CommandLineConfiguration';

const PLUGIN_NAME: 'ValidateOperationsPlugin' = 'ValidateOperationsPlugin';

/**
 * Core phased command plugin that provides the functionality for generating a base operation graph
 * from the set of selected projects and phases.
 */
export class ValidateOperationsPlugin implements IPhasedCommandPlugin {
  private readonly _terminal: ITerminal;

  public constructor(terminal: ITerminal) {
    this._terminal = terminal;
  }

  public apply(hooks: PhasedCommandHooks): void {
    hooks.beforeExecuteOperations.tap(PLUGIN_NAME, this._validateOperations.bind(this));
  }

  private _validateOperations(
    records: Map<Operation, IOperationExecutionResult>,
    context: ICreateOperationsContext
  ): void {
    const phasesByProject: Map<RushConfigurationProject, Set<IPhase>> = new Map();
    for (const { associatedPhase, associatedProject, runner } of records.keys()) {
      if (!runner?.isNoOp) {
        // Ignore operations that aren't associated with a project or phase, or that
        // use the NullOperationRunner (i.e. - the phase doesn't do anything)
        let projectPhases: Set<IPhase> | undefined = phasesByProject.get(associatedProject);
        if (!projectPhases) {
          projectPhases = new Set();
          phasesByProject.set(associatedProject, projectPhases);
        }

        projectPhases.add(associatedPhase);
      }
    }

    for (const [project, phases] of phasesByProject) {
      const projectConfiguration: RushProjectConfiguration | undefined =
        context.projectConfigurations.get(project);
      if (projectConfiguration) {
        projectConfiguration.validatePhaseConfiguration(phases, this._terminal);
      }
    }
  }
}
