// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('@rushstack/terminal', () => {
  const originalModule = jest.requireActual('@rushstack/terminal');
  return {
    ...originalModule,
    ConsoleTerminalProvider: {
      ...originalModule.ConsoleTerminalProvider,
      supportsColor: true
    }
  };
});
import { MockWritable, Terminal } from '@rushstack/terminal';
import { BuildPlanPlugin } from '../BuildPlanPlugin';
import {
  type ICreateOperationsContext,
  IExecuteOperationsContext,
  PhasedCommandHooks
} from '../../../pluginFramework/PhasedCommandHooks';
import { CollatedTerminalProvider } from '../../../utilities/CollatedTerminalProvider';
import { CollatedTerminal, StreamCollator } from '@rushstack/stream-collator';
import type { Operation } from '../Operation';
import path from 'path';
import { RushConfiguration } from '../../../api/RushConfiguration';
import {
  CommandLineConfiguration,
  type IPhase,
  type IPhasedCommandConfig
} from '../../../api/CommandLineConfiguration';
import type { ICommandLineJson } from '../../../api/CommandLineJson';
import { JsonFile } from '@rushstack/node-core-library';
import { OperationExecutionRecord } from '../OperationExecutionRecord';
import { PhasedOperationPlugin } from '../PhasedOperationPlugin';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import { RushConstants } from '../../RushConstants';
import { MockOperationRunner } from './MockOperationRunner';
import { ProjectChangeAnalyzer } from '../../ProjectChangeAnalyzer';

const mockWritable: MockWritable = new MockWritable();
const mockTerminal: Terminal = new Terminal(new CollatedTerminalProvider(new CollatedTerminal(mockWritable)));

const mockStreamWritable: MockWritable = new MockWritable();
const streamCollator = new StreamCollator({
  destination: mockStreamWritable
});

describe('BuildPlanPlugin', () => {
  const rushJsonFile: string = path.resolve(__dirname, `../../test/workspaceRepo/rush.json`);
  const commandLineJsonFile: string = path.resolve(
    __dirname,
    `../../test/workspaceRepo/common/config/rush/command-line.json`
  );
  let rushConfiguration!: RushConfiguration;
  let commandLineConfiguration!: CommandLineConfiguration;

  beforeAll(() => {
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
    const commandLineJson: ICommandLineJson = JsonFile.load(commandLineJsonFile);

    commandLineConfiguration = new CommandLineConfiguration(commandLineJson);
  });

  function createMockRunner(operations: Set<Operation>, context: ICreateOperationsContext): Set<Operation> {
    for (const operation of operations) {
      const { associatedPhase, associatedProject } = operation;

      if (associatedPhase && associatedProject && !operation.runner) {
        const name: string = `${associatedProject.packageName} (${associatedPhase.name.slice(
          RushConstants.phaseNamePrefix.length
        )})`;

        operation.runner = new MockOperationRunner(name);
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
      'phaseOriginal' | 'phaseSelection' | 'projectSelection' | 'projectsInUnknownState'
    > = {
      phaseOriginal: phaseSelection,
      phaseSelection,
      projectSelection,
      projectsInUnknownState: changedProjects
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

      new BuildPlanPlugin(mockTerminal).apply(hooks);
      const context: Pick<IExecuteOperationsContext, 'projectChangeAnalyzer' | 'projectConfigurations'> = {
        projectChangeAnalyzer: {
          [ProjectChangeAnalyzer.prototype._tryGetProjectDependenciesAsync.name]: async () => {
            return new Map();
          }
        } as unknown as ProjectChangeAnalyzer,
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
          new OperationExecutionRecord(operation, { debugMode: false, quietMode: true, streamCollator })
        );
      });

      await hooks.beforeExecuteOperations.promise(operationMap, context as IExecuteOperationsContext);

      const allOutput: string = mockWritable.getAllOutput();
      expect(allOutput).toMatchSnapshot();
    });
  });
});
