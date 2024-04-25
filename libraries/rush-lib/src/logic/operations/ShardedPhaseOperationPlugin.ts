// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminal } from '@rushstack/terminal';
import { IPhase } from '../../api/CommandLineConfiguration';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import {
  ICreateOperationsContext,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import { Operation } from './Operation';
import { IRushPhaseSharding, RushProjectConfiguration } from '../../api/RushProjectConfiguration';

export const PLUGIN_NAME: 'ShardedPhasedOperationPlugin' = 'ShardedPhasedOperationPlugin';

/**
 * Phased command that
 */
export class ShardedPhasedOperationPlugin implements IPhasedCommandPlugin {
  public apply(hooks: PhasedCommandHooks): void {
    hooks.createOperations.tapPromise(PLUGIN_NAME, spliceShards);
  }
}

async function spliceShards(
  existingOperations: Set<Operation>,
  context: ICreateOperationsContext
): Promise<Set<Operation>> {
  const { terminal } = context;

  const shardableOperations = new Set<Operation>();

  for (const operation of existingOperations) {
    const { associatedPhase: phase, associatedProject: project } = operation;
    const shardConfig: IRushPhaseSharding | undefined = await getShardConfig(phase!, project!, terminal!);
    if (shardConfig) {
      shardableOperations.add(operation);
    }
  }

  for (const operation of shardableOperations) {
    const { associatedPhase: phase, associatedProject: project } = operation;
    const shardConfig: IRushPhaseSharding | undefined = await getShardConfig(phase!, project!, terminal!);
    if (phase && project && shardConfig && shardConfig.count > 1) {
      const shards: number = shardConfig.count;
      existingOperations.delete(operation);
      for (const shard of Array.from({ length: shards }, (_, index) => index + 1)) {
        let shardOperation = new Operation({
          project,
          phase,
          shard: {
            current: shard,
            total: shards
          },
          runner: operation.runner
        });

        for (const dependency of operation.dependencies) {
          shardOperation.addDependency(dependency);
          operation.deleteDependency(dependency);
        }
        for (const dependent of operation.consumers) {
          dependent.addDependency(shardOperation);
          dependent.deleteDependency(operation);
        }
        existingOperations.add(shardOperation);
      }
    }
  }

  return existingOperations;
}

async function getShardConfig(
  phase: IPhase,
  project: RushConfigurationProject,
  terminal: ITerminal
): Promise<IRushPhaseSharding | undefined> {
  const rushProjectConfiguration: RushProjectConfiguration | undefined =
    await RushProjectConfiguration.tryLoadForProjectAsync(project, terminal);
  if (rushProjectConfiguration) {
    return rushProjectConfiguration.operationSettingsByOperationName.get(phase.name)?.sharding;
  }
}
