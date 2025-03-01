// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Operation } from './Operation';
import type {
  ICreateOperationsContext,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import type { IOperationSettings, RushProjectConfiguration } from '../../api/RushProjectConfiguration';
import type { IOperationExecutionResult } from './IOperationExecutionResult';
import type { OperationExecutionRecord } from './OperationExecutionRecord';
import { Async } from '@rushstack/node-core-library';

const PLUGIN_NAME: 'WeightedOperationPlugin' = 'WeightedOperationPlugin';

/**
 * Add weights to operations based on the operation settings in rush-project.json.
 *
 * This also sets the weight of no-op operations to 0.
 */
export class WeightedOperationPlugin implements IPhasedCommandPlugin {
  public apply(hooks: PhasedCommandHooks): void {
    hooks.beforeExecuteOperations.tap(PLUGIN_NAME, weightOperations);
  }
}

function weightOperations(
  operations: Map<Operation, IOperationExecutionResult>,
  context: ICreateOperationsContext
): Map<Operation, IOperationExecutionResult> {
  const { projectConfigurations } = context;

  for (const [operation, record] of operations) {
    const { runner } = record as OperationExecutionRecord;
    const { associatedProject: project, associatedPhase: phase } = operation;
    if (runner!.isNoOp) {
      operation.weight = 0;
    } else {
      const projectConfiguration: RushProjectConfiguration | undefined = projectConfigurations.get(project);
      const operationSettings: IOperationSettings | undefined =
        operation.settings ?? projectConfiguration?.operationSettingsByOperationName.get(phase.name);
      if (operationSettings?.weight) {
        operation.weight = operationSettings.weight;
      }
    }
    Async.validateWeightedIterable(operation);
  }
  return operations;
}
