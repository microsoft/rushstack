// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import { JsonFile } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import { CommandLineAction, CommandLineParser, type CommandLineParameter } from '@rushstack/ts-command-line';

import { RushConfiguration } from '../../../api/RushConfiguration';
import {
  CommandLineConfiguration,
  type IPhasedCommandConfig,
  type IParameterJson,
  type IPhase
} from '../../../api/CommandLineConfiguration';
import type { ICommandLineJson } from '../../../api/CommandLineJson';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import { RushProjectConfiguration } from '../../../api/RushProjectConfiguration';
import { defineCustomParameters } from '../../../cli/parsing/defineCustomParameters';
import { associateParametersByPhase } from '../../../cli/parsing/associateParametersByPhase';
import {
  type ICreateOperationsContext,
  PhasedCommandHooks
} from '../../../pluginFramework/PhasedCommandHooks';
import { IS_WINDOWS } from '../../../utilities/executionUtilities';
import type { Operation } from '../Operation';
import { PhasedOperationPlugin } from '../PhasedOperationPlugin';
import { ShardedPhasedOperationPlugin } from '../ShardedPhaseOperationPlugin';
import { ShellOperationRunnerPlugin } from '../ShellOperationRunnerPlugin';

class TestCommandLineAction extends CommandLineAction {
  protected async onExecuteAsync(): Promise<void> {
    // No-op for testing
  }
}

class TestCommandLineParser extends CommandLineParser {
  public constructor() {
    super({
      toolFilename: 'test-tool',
      toolDescription: 'Test tool for parameter parsing'
    });
  }
}

const PARENT_FOLDER_ARGUMENT: string = '--shard-parent-folder=".rush/operations/build/shards/"';
const SHARD_COUNT_ARGUMENT: string = '--shard-count="2"';

/**
 * Creates the operations of shardedParameterRepo's `build` command for the given command line, and returns
 * the command of each operation, by its log filename identifier.
 */
async function getCommandsByLogFilenameIdentifierAsync(argv: string[]): Promise<Map<string, string>> {
  const repoFolder: string = path.resolve(__dirname, '../../test/shardedParameterRepo');
  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
    `${repoFolder}/rush.json`
  );
  const commandLineJson: ICommandLineJson = JsonFile.load(
    `${repoFolder}/common/config/rush/command-line.json`
  );
  const buildCommand: IPhasedCommandConfig = new CommandLineConfiguration(commandLineJson).commands.get(
    'build'
  )! as IPhasedCommandConfig;

  const projectConfigurations: ReadonlyMap<RushConfigurationProject, RushProjectConfiguration> =
    await RushProjectConfiguration.tryLoadForProjectsAsync(
      rushConfiguration.projects,
      new Terminal(new StringBufferTerminalProvider())
    );

  const parser: TestCommandLineParser = new TestCommandLineParser();
  const action: TestCommandLineAction = new TestCommandLineAction({
    actionName: 'build',
    summary: 'Test build action',
    documentation: 'Test'
  });
  parser.addAction(action);
  const customParametersMap: Map<IParameterJson, CommandLineParameter> = new Map();
  defineCustomParameters(action, buildCommand.associatedParameters, customParametersMap);
  await parser.executeWithoutErrorHandlingAsync(argv);

  const phasesMap: Map<string, IPhase> = new Map();
  for (const phase of buildCommand.phases) {
    phasesMap.set(phase.name, phase);
  }
  associateParametersByPhase(customParametersMap, phasesMap);

  const customParameters: Map<string, CommandLineParameter> = new Map();
  for (const [parameterJson, parameter] of customParametersMap) {
    customParameters.set(parameterJson.longName, parameter);
  }

  const hooks: PhasedCommandHooks = new PhasedCommandHooks();
  new PhasedOperationPlugin().apply(hooks);
  new ShardedPhasedOperationPlugin().apply(hooks);
  new ShellOperationRunnerPlugin().apply(hooks);
  const context: Pick<
    ICreateOperationsContext,
    'phaseSelection' | 'projectSelection' | 'projectConfigurations' | 'rushConfiguration' | 'customParameters'
  > = {
    phaseSelection: buildCommand.phases,
    projectSelection: new Set(rushConfiguration.projects),
    projectConfigurations,
    rushConfiguration,
    customParameters
  };
  const operations: Set<Operation> = await hooks.createOperationsAsync.promise(
    new Set(),
    context as unknown as ICreateOperationsContext
  );

  const commandsByLogFilenameIdentifier: Map<string, string> = new Map();
  for (const operation of operations) {
    commandsByLogFilenameIdentifier.set(operation.logFilenameIdentifier, operation.runner!.getConfigHash());
  }
  return commandsByLogFilenameIdentifier;
}

describe(ShardedPhasedOperationPlugin.name, () => {
  it('S1: leaves the commands of a value that needs no quoting as they were', async () => {
    const commands: Map<string, string> = await getCommandsByLogFilenameIdentifierAsync([
      'build',
      '--pattern',
      'abc'
    ]);

    expect(commands).toEqual(
      new Map([
        ['build_pre-shard', ''],
        ['build_collate', `echo collate a --pattern abc ${PARENT_FOLDER_ARGUMENT} ${SHARD_COUNT_ARGUMENT}`],
        [
          'build_shard_1',
          'echo shard a --pattern abc --shard=1/2 --shard-output-directory=.rush/operations/build/shards/1'
        ],
        [
          'build_shard_2',
          'echo shard a --pattern abc --shard=2/2 --shard-output-directory=.rush/operations/build/shards/2'
        ]
      ])
    );
  });

  describe('with a value that the shell would parse', () => {
    const quotedPattern: string = IS_WINDOWS ? '"a|b"' : "'a|b'";
    let commands: Map<string, string>;

    beforeAll(async () => {
      commands = await getCommandsByLogFilenameIdentifierAsync(['build', '--pattern', 'a|b']);
    });

    it("S2: quotes the value in the collator's command, but not the collator's arguments", () => {
      expect(commands.get('build_collate')).toEqual(
        `echo collate a --pattern ${quotedPattern} ${PARENT_FOLDER_ARGUMENT} ${SHARD_COUNT_ARGUMENT}`
      );
    });

    it.each([1, 2])(
      "S3: quotes the value in shard %s's command, but not the shard's arguments",
      (shard: number) => {
        expect(commands.get(`build_shard_${shard}`)).toEqual(
          `echo shard a --pattern ${quotedPattern} --shard=${shard}/2 --shard-output-directory=.rush/operations/build/shards/${shard}`
        );
      }
    );
  });
});
