// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPhase } from '../../api/CommandLineConfiguration';
import { EnvironmentVariableNames } from '../../api/EnvironmentConfiguration';
import type {
  ICreateOperationsContext,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import { NullOperationRunner } from './NullOperationRunner';
import { Operation } from './Operation';
import { OperationStatus } from './OperationStatus';
import { ShellOperationRunner } from './ShellOperationRunner';
import {
  formatCommand,
  getCustomParameterValuesByPhase,
  getDisplayName,
  getScriptToRun
} from './ShellOperationRunnerPlugin';

export const PLUGIN_NAME: 'ShardedPhasedOperationPlugin' = 'ShardedPhasedOperationPlugin';

// eslint-disable-next-line @typescript-eslint/typedef
const TemplateStrings = {
  SHARD_INDEX: '{shardIndex}',
  SHARD_COUNT: '{shardCount}'
} as const;

// eslint-disable-next-line @typescript-eslint/typedef
const TemplateStringRegex = {
  SHARD_INDEX: new RegExp(TemplateStrings.SHARD_INDEX, 'g'),
  SHARD_COUNT: new RegExp(TemplateStrings.SHARD_COUNT, 'g')
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
  const { rushConfiguration } = context;

  const getCustomParameterValuesForPhase: (phase: IPhase) => ReadonlyArray<string> =
    getCustomParameterValuesByPhase();

  for (const operation of existingOperations) {
    const { associatedPhase: phase, associatedProject: project, settings: operationSettings } = operation;
    if (phase && project && operationSettings?.sharding && !operation.runner) {
      const { count: shards, shardScriptConfiguration } = operationSettings.sharding;

      existingOperations.delete(operation);

      const collatorNode: Operation = new Operation({
        phase,
        project,
        settings: operationSettings
      });
      existingOperations.add(collatorNode);

      const parentFolderFormat: string =
        operationSettings.sharding.outputFolderArgument?.parentFolderName ??
        `.rush/operations/${phase.logFilenameIdentifier}/shards`;

      const parentFolder: string = parentFolderFormat;

      const collatorDisplayName: string = `${getDisplayName(phase, project)} - collate`;
      const collatorRawScript: string | undefined = getScriptToRun(project, phase.name, undefined);

      if (collatorRawScript === undefined && phase.missingScriptBehavior === 'error') {
        throw new Error(
          `The project '${project.packageName}' does not define a '${phase.name}' command in the 'scripts' section of its package.json`
        );
      }

      const customParameters: readonly string[] = getCustomParameterValuesForPhase(phase);
      if (collatorRawScript) {
        const collatorRunner: ShellOperationRunner = new ShellOperationRunner({
          commandToRun: formatCommand(collatorRawScript, customParameters),
          displayName: collatorDisplayName,
          phase,
          rushConfiguration,
          rushProject: project,
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
      for (const consumer of operation.consumers) {
        consumer.addDependency(collatorNode);
        consumer.deleteDependency(operation);
      }

      const baseCommand: string | undefined = getScriptToRun(project, `${phase.name}:shard`, undefined);

      const shardMissingScriptBehavior: string = shardScriptConfiguration?.missingScriptBehavior ?? 'error';
      if (baseCommand === undefined && shardMissingScriptBehavior === 'error') {
        throw new Error(
          `The project '${project.packageName}' does not define a '${phase.name}:shard' command in the 'scripts' section of its package.json`
        );
      }

      const shardArgumentFormat: string =
        operationSettings.sharding.shardArgumentFormat ??
        `--shard=${TemplateStrings.SHARD_INDEX}/${TemplateStrings.SHARD_COUNT}`;
      const outputFolderArgumentFlag: string =
        operationSettings.sharding.outputFolderArgument?.parameterLongName ?? '--shard-output-directory';

      for (let shard: number = 1; shard <= shards; shard++) {
        const outputDirectory: string = `${parentFolder}/${shard}`;

        const shardOperation: Operation = new Operation({
          project,
          phase,
          settings: {
            ...operationSettings,
            outputFolderNames: [outputDirectory]
          }
        });

        const shardArgument: string = shardArgumentFormat
          .replace(TemplateStringRegex.SHARD_INDEX, shard.toString())
          .replace(TemplateStringRegex.SHARD_COUNT, shards.toString());

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
            rushProject: project
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
}
