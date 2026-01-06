// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { MockWritable, StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import { JsonFile } from '@rushstack/node-core-library';
import { StreamCollator } from '@rushstack/stream-collator';
import { BuildPlanPlugin } from '../BuildPlanPlugin';
import {
  type ICreateOperationsContext,
  type IExecuteOperationsContext,
  PhasedCommandHooks
} from '../../../pluginFramework/PhasedCommandHooks';
import type { Operation } from '../Operation';
import { RushConfiguration } from '../../../api/RushConfiguration';
import {
  CommandLineConfiguration,
  type IPhase,
  type IPhasedCommandConfig
} from '../../../api/CommandLineConfiguration';
import { OperationExecutionRecord } from '../OperationExecutionRecord';
import { PhasedOperationPlugin } from '../PhasedOperationPlugin';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import { RushConstants } from '../../RushConstants';
import { MockOperationRunner } from './MockOperationRunner';
import path from 'node:path';
import type { ICommandLineJson } from '../../../api/CommandLineJson';
import type { IInputsSnapshot } from '../../incremental/InputsSnapshot';

describe(BuildPlanPlugin.name, () => {
  const rushJsonFile: string = path.resolve(__dirname, `../../test/workspaceRepo/rush.json`);
  const commandLineJsonFile: string = path.resolve(
    __dirname,
    `../../test/workspaceRepo/common/config/rush/command-line.json`
  );
  let rushConfiguration!: RushConfiguration;
  let commandLineConfiguration!: CommandLineConfiguration;
  let stringBufferTerminalProvider!: StringBufferTerminalProvider;
  let terminal!: Terminal;
  const mockStreamWritable: MockWritable = new MockWritable();
  const streamCollator = new StreamCollator({
    destination: mockStreamWritable
  });
  beforeEach(() => {
    stringBufferTerminalProvider = new StringBufferTerminalProvider();
    terminal = new Terminal(stringBufferTerminalProvider);
    mockStreamWritable.reset();
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
    const commandLineJson: ICommandLineJson = JsonFile.load(commandLineJsonFile);

    commandLineConfiguration = new CommandLineConfiguration(commandLineJson);
  });

  function createMockRunner(operations: Set<Operation>, context: ICreateOperationsContext): Set<Operation> {
    for (const operation of operations) {
      const { associatedPhase, associatedProject } = operation;

      if (!operation.runner) {
        const name: string = `${associatedProject.packageName} (${associatedPhase.name.slice(
          RushConstants.phaseNamePrefix.length
        )})`;

        operation.runner = new MockOperationRunner(name, undefined, undefined, false);
      }
    }

    return operations;
  }

  async function testCreateOperationsAsync(
    phaseSelection: Set<IPhase>,
    projectSelection: Set<RushConfigurationProject>,
    changedProjects: Set<RushConfigurationProject>
  ): Promise<Set<Operation>> {
    const hooks: PhasedCommandHooks = new PhasedCommandHooks();
    // Apply the plugin being tested
    new PhasedOperationPlugin().apply(hooks);
    // Add mock runners for included operations.
    hooks.createOperations.tap('MockOperationRunnerPlugin', createMockRunner);

    const context: Pick<
      ICreateOperationsContext,
      | 'phaseOriginal'
      | 'phaseSelection'
      | 'projectSelection'
      | 'projectsInUnknownState'
      | 'projectConfigurations'
    > = {
      phaseOriginal: phaseSelection,
      phaseSelection,
      projectSelection,
      projectsInUnknownState: changedProjects,
      projectConfigurations: new Map()
    };
    const operations: Set<Operation> = await hooks.createOperations.promise(
      new Set(),
      context as ICreateOperationsContext
    );

    return operations;
  }

  describe('build plan debugging', () => {
    it('should generate a build plan', async () => {
      const hooks: PhasedCommandHooks = new PhasedCommandHooks();

      new BuildPlanPlugin(terminal).apply(hooks);
      const inputsSnapshot: Pick<IInputsSnapshot, 'getTrackedFileHashesForOperation'> = {
        getTrackedFileHashesForOperation() {
          return new Map();
        }
      };
      const context: Pick<IExecuteOperationsContext, 'inputsSnapshot' | 'projectConfigurations'> = {
        inputsSnapshot: inputsSnapshot as unknown as IInputsSnapshot,
        projectConfigurations: new Map()
      };
      const buildCommand: IPhasedCommandConfig = commandLineConfiguration.commands.get(
        'build'
      )! as IPhasedCommandConfig;

      const operationMap = new Map();

      const operations = await testCreateOperationsAsync(
        buildCommand.phases,
        new Set(rushConfiguration.projects),
        new Set(rushConfiguration.projects)
      );
      operations.forEach((operation) => {
        operationMap.set(
          operation,
          new OperationExecutionRecord(operation, {
            debugMode: false,
            quietMode: true,
            streamCollator,
            inputsSnapshot: undefined
          })
        );
      });

      await hooks.beforeExecuteOperations.promise(operationMap, context as IExecuteOperationsContext);

      expect(
        stringBufferTerminalProvider.getAllOutputAsChunks({
          normalizeSpecialCharacters: false,
          asLines: true
        })
      ).toMatchSnapshot();
    });
  });
});
