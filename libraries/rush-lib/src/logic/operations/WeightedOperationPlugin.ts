// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Operation } from './Operation';
import type {
  ICreateOperationsContext,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import type { IOperationSettings, RushProjectConfiguration } from '../../api/RushProjectConfiguration';

const PLUGIN_NAME: 'WeightedOperationPlugin' = 'WeightedOperationPlugin';

/**
 * Add weights to operations based on the operation settings in rush-project.json.
 *
 * This also sets the weight of no-op operations to 0.01.
 */
export class WeightedOperationPlugin implements IPhasedCommandPlugin {
  public apply(hooks: PhasedCommandHooks): void {
    hooks.createOperations.tap(PLUGIN_NAME, weightOperations);
  }
}

function weightOperations(operations: Set<Operation>, context: ICreateOperationsContext): Set<Operation> {
  const { projectConfigurations } = context;

  for (const operation of operations) {
    const { associatedProject: project, associatedPhase: phase } = operation;
    if (operation.runner?.isNoOp) {
      operation.weight = 0.01;
    } else if (project && phase) {
      const projectConfiguration: RushProjectConfiguration | undefined = projectConfigurations.get(project);
      const operationSettings: IOperationSettings | undefined =
        projectConfiguration?.operationSettingsByOperationName.get(phase.name);
      if (operationSettings?.weight) {
        operation.weight = operationSettings.weight;
      }
    }
  }
  return operations;
}
