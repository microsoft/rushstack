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
  formatCommand,
  getCustomParameterValuesByPhase,
  getDisplayName,
  getScriptToRun
} from './ShellOperationRunnerPlugin';
import { NullOperationRunner } from './NullOperationRunner';
import { OperationStatus } from './OperationStatus';
import * as path from 'path';
import { EnvironmentVariableNames } from '../../api/EnvironmentConfiguration';

export const PLUGIN_NAME: 'ShardedPhasedOperationPlugin' = 'ShardedPhasedOperationPlugin';

// eslint-disable-next-line @typescript-eslint/typedef
const TemplateStrings = {
  SHARD_INDEX: '{shardIndex}',
  SHARD_COUNT: '{shardCount}',
  PHASE_NAME: '{phaseName}'
} as const;

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

  for (const operation of existingOperations) {
    const { associatedPhase: phase, associatedProject: project } = operation;
    const operationSettings: IOperationSettings | undefined = getOperationSettings(phase, project);
    if (phase && project && operationSettings?.sharding && !operation.runner) {
      const shards: number = operationSettings.sharding.count;

      existingOperations.delete(operation);

      const collatorNode: Operation = new Operation({
        phase,
        project
      });
      existingOperations.add(collatorNode);

      const parentFolderFormat: string =
        operationSettings.sharding.outputFolderArgument?.parentFolderNameFormat ??
        `.rush/operations/${TemplateStrings.PHASE_NAME}/shards`;
      const parentFolder: string = parentFolderFormat.replace(
        TemplateStrings.PHASE_NAME,
        phase.logFilenameIdentifier
      );

      const collatorDisplayName: string = `${getDisplayName(phase, project)} - collate`;
      const collatorRawScript: string | undefined = getScriptToRun(
        project,
        `${phase.name}:collate`,
        undefined
      );

      if (collatorRawScript) {
        const collatorRunner: ShellOperationRunner = new ShellOperationRunner({
          commandToRun: formatCommand(collatorRawScript, getCustomParameterValuesForPhase(phase)),
          displayName: collatorDisplayName,
          phase,
          rushConfiguration,
          rushProject: project,
          operationSettings,
          environment: {
            ...process.env,
            [EnvironmentVariableNames.RUSH_SHARD_PARENT_FOLDER]: parentFolder,
            [EnvironmentVariableNames.RUSH_SHARD_COUNT]: shards.toString()
          }
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

      const customParameters: readonly string[] = getCustomParameterValuesForPhase(phase);
      const baseCommand: string | undefined = getScriptToRun(project, phase.name, phase.shellCommand);
      if (baseCommand === undefined && phase.missingScriptBehavior === 'error') {
        throw new Error(
          `The project '${project.packageName}' does not define a '${phase.name}' command in the 'scripts' section of its package.json`
        );
      }

      for (let shard: number = 1; shard <= shards; shard++) {
        const shardOperation: Operation = new Operation({
          project,
          phase
        });

        // Add the shard argument to the custom parameters, replacing any templated values.
        const shardArgumentFormat: string =
          operationSettings.sharding.shardArgumentFormat ??
          `--shard=${TemplateStrings.SHARD_INDEX}/${TemplateStrings.SHARD_COUNT}`;

        const shardArgument: string = shardArgumentFormat
          .replace(TemplateStrings.SHARD_INDEX, shard.toString())
          .replace(TemplateStrings.SHARD_COUNT, shards.toString());

        const outputFolderArgumentFlag: string =
          operationSettings.sharding.outputFolderArgument?.argumentFlag ?? '--shard-output-directory';
        const outputDirectory: string = path.join(parentFolder, shard.toString());
        const outputDirectoryArgument: string = `${outputFolderArgumentFlag}="${outputDirectory}"`;
        const shardedParameters: string[] = [...customParameters, shardArgument, outputDirectoryArgument];

        const shardedCommandToRun: string | undefined = baseCommand
          ? formatCommand(baseCommand, shardedParameters)
          : undefined;

        const shardDisplayName: string = `${getDisplayName(phase, project)} - shard ${shard}/${shards}`;
        if (shardedCommandToRun) {
          const shardedShellOperationRunner: ShellOperationRunner = new ShellOperationRunner({
            commandToRun: shardedCommandToRun,
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
