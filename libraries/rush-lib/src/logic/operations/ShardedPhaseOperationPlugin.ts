// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPhase } from '../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type {
  ICreateOperationsContext,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import { Operation } from './Operation';
import type { IOperationSettings, RushProjectConfiguration } from '../../api/RushProjectConfiguration';
import { ShellOperationRunner } from './ShellOperationRunner';
import {
  getCustomParameterValuesByPhase,
  getDisplayName,
  getScriptToRun
} from './ShellOperationRunnerPlugin';
import { NullOperationRunner } from './NullOperationRunner';
import { OperationStatus } from './OperationStatus';

export const PLUGIN_NAME: 'ShardedPhasedOperationPlugin' = 'ShardedPhasedOperationPlugin';

/**
 * Phased command that shards a phase into multiple operations.
 */
export class ShardedPhasedOperationPlugin implements IPhasedCommandPlugin {
  public apply(hooks: PhasedCommandHooks): void {
    hooks.createOperations.tap(PLUGIN_NAME, spliceShards);
  }
}

function spliceShards(existingOperations: Set<Operation>, context: ICreateOperationsContext): Set<Operation> {
  const { projectConfigurations, rushConfiguration } = context;

  const shardableOperations: Set<Operation> = new Set<Operation>();

  for (const operation of existingOperations) {
    const { associatedPhase: phase, associatedProject: project } = operation;
    const operationSettings: IOperationSettings | undefined = getOperationSettings(phase, project);
    if (operationSettings?.sharding) {
      shardableOperations.add(operation);
    }
  }
  const getCustomParameterValuesForPhase: (phase: IPhase) => ReadonlyArray<string> =
    getCustomParameterValuesByPhase();

  for (const operation of shardableOperations) {
    const { associatedPhase: phase, associatedProject: project } = operation;
    const operationSettings: IOperationSettings | undefined = getOperationSettings(phase, project);
    if (phase && project && operationSettings?.sharding && operationSettings.sharding.count > 1) {
      existingOperations.delete(operation);

      const collatorNode: Operation = new Operation({
        phase,
        project
      });
      existingOperations.add(collatorNode);
      const collatorDisplayName: string = `${getDisplayName(phase, project)} - collate`;
      const rawScript: string | undefined = project.packageJson.scripts?.[`${phase.name}:collate`];

      if (rawScript) {
        const collatorRunner: ShellOperationRunner = new ShellOperationRunner({
          commandToRun: rawScript,
          displayName: collatorDisplayName,
          phase,
          rushConfiguration,
          rushProject: project,
          operationSettings
        });
        collatorNode.runner = collatorRunner;
      } else {
        collatorNode.runner = new NullOperationRunner({
          name: collatorDisplayName,
          result: OperationStatus.NoOp,
          silent: phase.missingScriptBehavior === 'silent'
        });
      }
      for (const dependent of operation.consumers) {
        dependent.addDependency(collatorNode);
        dependent.deleteDependency(operation);
      }

      const shards: number = operationSettings.sharding.count;
      for (const shard of Array.from({ length: shards }, (element, index) => index + 1)) {
        let customParameters: readonly string[] = getCustomParameterValuesForPhase(phase);

        // Add the shard argument to the custom parameters, replacing any templated values.
        const shardArgumentFormat: string =
          operationSettings.sharding.shardArgumentFormat ?? '--shard={shardIndex}/{shardCount}';
        const outputDirectory: string = `.rush/shards/${shard}`;
        const shardArgument: string = shardArgumentFormat
          .replace('{shardIndex}', shard.toString())
          .replace('{shardCount}', shards.toString());
        const outputDirectoryArgument: string = `--shard-output-directory="${outputDirectory}"`;
        customParameters = [...customParameters, shardArgument, outputDirectoryArgument];

        const commandToRun: string | undefined = getScriptToRun(
          project,
          phase.name,
          customParameters,
          phase.shellCommand
        );
        if (commandToRun === undefined && phase.missingScriptBehavior === 'error') {
          throw new Error(
            `The project '${project.packageName}' does not define a '${phase.name}' command in the 'scripts' section of its package.json`
          );
        }

        const shardOperation: Operation = new Operation({
          project,
          phase
        });
        const shardDisplayName: string = `${getDisplayName(phase, project)} - shard ${shard}`;
        if (commandToRun) {
          const shardedShellOperationRunner: ShellOperationRunner = new ShellOperationRunner({
            commandToRun,
            displayName: shardDisplayName,
            phase,
            rushConfiguration,
            rushProject: project,
            operationSettings: {
              ...operationSettings,
              outputFolderNames: [outputDirectory]
            }
          });
          shardOperation.runner = shardedShellOperationRunner;
        } else {
          shardOperation.runner = new NullOperationRunner({
            name: shardDisplayName,
            result: OperationStatus.NoOp,
            silent: phase.missingScriptBehavior === 'silent'
          });
        }

        for (const dependency of operation.dependencies) {
          shardOperation.addDependency(dependency);
        }
        collatorNode.addDependency(shardOperation);
        existingOperations.add(shardOperation);
      }
      for (const dependency of operation.dependencies) {
        operation.deleteDependency(dependency);
      }
    }
  }

  return existingOperations;

  function getOperationSettings(
    phase: IPhase | undefined,
    project: RushConfigurationProject | undefined
  ): IOperationSettings | undefined {
    if (!phase || !project) {
      return undefined;
    }
    const rushProjectConfiguration: RushProjectConfiguration | undefined = projectConfigurations.get(project);
    if (rushProjectConfiguration) {
      return rushProjectConfiguration.operationSettingsByOperationName.get(phase.name);
    }
  }
}
