// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPhase } from '../../api/CommandLineConfiguration';
import type {
  ICreateOperationsContext,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import { RushConstants } from '../RushConstants';
import { NullOperationRunner } from './NullOperationRunner';
import { Operation } from './Operation';
import { normalizeNameForLogFilenameIdentifiers } from './OperationMetadataManager';
import { OperationStatus } from './OperationStatus';
import {
  formatCommand,
  getCustomParameterValuesByPhase,
  getDisplayName,
  getScriptToRun,
  initializeShellOperationRunner
} from './ShellOperationRunnerPlugin';

export const PLUGIN_NAME: 'ShardedPhasedOperationPlugin' = 'ShardedPhasedOperationPlugin';

// eslint-disable-next-line @typescript-eslint/typedef
const TemplateStrings = {
  SHARD_INDEX: '{shardIndex}',
  SHARD_COUNT: '{shardCount}',
  PHASE_NAME: '{phaseName}'
} as const;

// eslint-disable-next-line @typescript-eslint/typedef
const TemplateStringRegexes = {
  SHARD_INDEX: new RegExp(TemplateStrings.SHARD_INDEX, 'g'),
  SHARD_COUNT: new RegExp(TemplateStrings.SHARD_COUNT, 'g'),
  PHASE_NAME: new RegExp(TemplateStrings.PHASE_NAME, 'g')
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
      const { count: shards, shardOperationSettings } = operationSettings.sharding;

      /**
       * A single operation to reduce the number of edges in the graph when creating shards.
       * ```
       * depA -\          /- shard 1 -\
       * depB -- > noop < -- shard 2 -- > collator (reused operation)
       * depC -/          \- shard 3 -/
       * ```
       */
      const preShardOperation: Operation = new Operation({
        phase,
        project,
        settings: operationSettings,
        runner: new NullOperationRunner({
          name: `${getDisplayName(phase, project)} - pre-shard`,
          result: OperationStatus.NoOp,
          silent: true
        })
      });

      existingOperations.add(preShardOperation);

      for (const dependency of operation.dependencies) {
        preShardOperation.addDependency(dependency);
        operation.deleteDependency(dependency);
      }

      const outputFolderArgumentFormat: string =
        operationSettings.sharding.outputFolderArgumentFormat ??
        `--shard-output-directory="${RushConstants.projectRushFolderName}/operations/${TemplateStrings.PHASE_NAME}/shards/${TemplateStrings.SHARD_INDEX}"`;

      if (!outputFolderArgumentFormat.includes('=')) {
        throw new Error(
          'sharding.outputFolderArgumentFormat must contain an "=" sign to differentiate between the key and the value'
        );
      }

      const trimmedOutputFolderArgumentFormat: string = outputFolderArgumentFormat.substring(
        0,
        trim(
          outputFolderArgumentFormat,
          outputFolderArgumentFormat.indexOf(TemplateStrings.SHARD_INDEX) +
            TemplateStrings.SHARD_INDEX.length,
          ['"', "'"],
          -1
        ) + 1
      );

      if (!trimmedOutputFolderArgumentFormat.endsWith(TemplateStrings.SHARD_INDEX)) {
        throw new Error(`sharding.outputFolderArgumentFormat must end with ${TemplateStrings.SHARD_INDEX}`);
      }

      // Replace the phase name only to begin with.
      const outputDirectoryArgument: string = trimmedOutputFolderArgumentFormat.replace(
        TemplateStringRegexes.PHASE_NAME,
        normalizeNameForLogFilenameIdentifiers(phase.name)
      );

      const outputFolderWithTemplate: string = outputDirectoryArgument.substring(
        trim(outputDirectoryArgument, outputDirectoryArgument.indexOf('=') + 1, ["'", '"'])
      );

      const parentFolder: string = outputFolderWithTemplate.substring(
        0,
        trim(
          outputFolderWithTemplate,
          outputFolderWithTemplate.indexOf(TemplateStrings.SHARD_INDEX),
          ["'", '"'],
          -1
        ) + 1
      );

      const collatorDisplayName: string = `${getDisplayName(phase, project)} - collate`;

      const customParameters: readonly string[] = getCustomParameterValuesForPhase(phase);

      const collatorParameters: string[] = [
        ...customParameters,
        `--shard-parent-folder="${parentFolder}"`,
        `--shard-count="${shards}"`
      ];

      const rawCommandToRun: string | undefined = getScriptToRun(project, phase.name, phase.shellCommand);

      const commandToRun: string | undefined = rawCommandToRun
        ? formatCommand(rawCommandToRun, collatorParameters)
        : undefined;

      operation.runner = initializeShellOperationRunner({
        phase,
        project,
        displayName: collatorDisplayName,
        rushConfiguration,
        commandToRun: commandToRun
      });

      const shardOperationName: string = `${phase.name}:shard`;
      const baseCommand: string | undefined = getScriptToRun(project, shardOperationName, undefined);
      if (baseCommand === undefined) {
        throw new Error(
          `The project '${project.packageName}' does not define a '${phase.name}:shard' command in the 'scripts' section of its package.json`
        );
      }

      const shardArgumentFormat: string =
        operationSettings.sharding.shardArgumentFormat ??
        `--shard=${TemplateStrings.SHARD_INDEX}/${TemplateStrings.SHARD_COUNT}`;

      if (
        operationSettings.sharding.shardArgumentFormat &&
        !shardArgumentFormat.includes(TemplateStrings.SHARD_INDEX) &&
        !shardArgumentFormat.includes(TemplateStrings.SHARD_COUNT)
      ) {
        throw new Error(
          `'shardArgumentFormat' must contain both ${TemplateStrings.SHARD_INDEX} and ${TemplateStrings.SHARD_COUNT} to be used for sharding.`
        );
      }

      for (let shard: number = 1; shard <= shards; shard++) {
        const outputDirectory: string = outputFolderWithTemplate.replace(
          TemplateStringRegexes.SHARD_INDEX,
          shard.toString()
        );
        console.log(outputFolderWithTemplate, outputDirectory);

        const shardOperation: Operation = new Operation({
          project,
          phase,
          settings: {
            ...shardOperationSettings,
            operationName: shardOperationName,
            outputFolderNames: [outputDirectory]
          }
        });

        const shardArgument: string = shardArgumentFormat
          .replace(TemplateStringRegexes.SHARD_INDEX, shard.toString())
          .replace(TemplateStringRegexes.SHARD_COUNT, shards.toString());

        const outputDirectoryArgumentWithShard: string = outputDirectoryArgument.replace(
          TemplateStringRegexes.SHARD_INDEX,
          shard.toString()
        );

        const shardedParameters: string[] = [
          ...customParameters,
          shardArgument,
          outputDirectoryArgumentWithShard
        ];

        const shardDisplayName: string = `${getDisplayName(phase, project)} - shard ${shard}/${shards}`;

        const shardedCommandToRun: string | undefined = baseCommand
          ? formatCommand(baseCommand, shardedParameters)
          : undefined;

        shardOperation.runner = initializeShellOperationRunner({
          phase,
          project,
          commandToRun: shardedCommandToRun,
          displayName: shardDisplayName,
          rushConfiguration
        });

        shardOperation.addDependency(preShardOperation);
        operation.addDependency(shardOperation);
        existingOperations.add(shardOperation);
      }
    }
  }

  return existingOperations;
}

/**
 * Helper method to trim characters from a string. Returns a new index to use with str.substring().
 * @param str String to trim characters from, will no be changed.
 * @param indexToTrimFrom Index to start from.
 * @param charactersToTrim Actual characters to trim.
 * @returns
 */
function trim(
  str: string,
  indexToTrimFrom: number,
  charactersToTrim: string[],
  increment: number = 1
): number {
  let newIndex: number = indexToTrimFrom;
  while (
    str.length >= newIndex &&
    newIndex >= 0 &&
    charactersToTrim.includes(str.substring(newIndex, newIndex + 1))
  ) {
    newIndex += increment;
  }
  return newIndex;
}
