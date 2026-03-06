// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import os from 'node:os';

import { Async } from '@rushstack/node-core-library';

import type { Operation } from './Operation';
import type {
  ICreateOperationsContext,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import type { IOperationSettings, RushProjectConfiguration } from '../../api/RushProjectConfiguration';
import type { IOperationExecutionResult } from './IOperationExecutionResult';
import type { OperationExecutionRecord } from './OperationExecutionRecord';

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
  const availableParallelism: number = os.availableParallelism();

  const percentageRegExp: RegExp = /^[1-9][0-9]*(\.\d+)?%$/;

  function _tryConvertPercentWeight(weight: `${number}%`): number {
    if (!percentageRegExp.test(weight)) {
      throw new Error(`Expected a percentage string like "100%".`);
    }

    const percentValue: number = parseFloat(weight.slice(0, -1));

    // Use as much CPU as possible, so we round down the weight here
    return Math.floor((percentValue / 100) * availableParallelism);
  }

  for (const [operation, record] of operations) {
    const { runner } = record as OperationExecutionRecord;
    const { associatedProject: project, associatedPhase: phase } = operation;
    if (runner!.isNoOp) {
      operation.weight = 0;
    } else {
      const projectConfiguration: RushProjectConfiguration | undefined = projectConfigurations.get(project);
      const operationSettings: IOperationSettings | undefined =
        operation.settings ?? projectConfiguration?.operationSettingsByOperationName.get(phase.name);
      if (operationSettings?.weight !== undefined) {
        if (typeof operationSettings.weight === 'number') {
          operation.weight = operationSettings.weight;
        } else if (typeof operationSettings.weight === 'string') {
          try {
            operation.weight = _tryConvertPercentWeight(operationSettings.weight);
          } catch (error) {
            throw new Error(
              `${operation.name} (invalid weight: ${operationSettings.weight}) ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }
    }
    Async.validateWeightedIterable(operation);
  }
  return operations;
}
