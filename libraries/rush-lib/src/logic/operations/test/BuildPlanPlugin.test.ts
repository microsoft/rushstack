// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import { MockWritable, StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import { JsonFile } from '@rushstack/node-core-library';
import { BuildPlanPlugin } from '../BuildPlanPlugin';
import {
  type ICreateOperationsContext,
  PhasedCommandHooks
} from '../../../pluginFramework/PhasedCommandHooks';
import type { IOperationGraphContext as IOperationExecutionManagerContext } from '../../../pluginFramework/PhasedCommandHooks';
import type { Operation } from '../Operation';
import { RushConfiguration } from '../../../api/RushConfiguration';
import {
  CommandLineConfiguration,
  type IPhase,
  type IPhasedCommandConfig
} from '../../../api/CommandLineConfiguration';
import { PhasedOperationPlugin } from '../PhasedOperationPlugin';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import { RushConstants } from '../../RushConstants';
import { MockOperationRunner } from './MockOperationRunner';
import type { ICommandLineJson } from '../../../api/CommandLineJson';
import type { IInputsSnapshot } from '../../incremental/InputsSnapshot';
import { OperationGraph } from '../OperationGraph';

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
    hooks: PhasedCommandHooks,
    phaseSelection: Set<IPhase>,
    projectSelection: Set<RushConfigurationProject>,
    changedProjects: Set<RushConfigurationProject>
  ): Promise<OperationGraph> {
    // Add mock runners for included operations.
    hooks.createOperationsAsync.tap('MockOperationRunnerPlugin', createMockRunner);

    const createOperationsContext: Pick<
      ICreateOperationsContext,
      'phaseSelection' | 'projectSelection' | 'projectConfigurations'
    > = {
      phaseSelection,
      projectSelection,
      projectConfigurations: new Map()
    };
    const operations: Set<Operation> = await hooks.createOperationsAsync.promise(
      new Set(),
      createOperationsContext as ICreateOperationsContext
    );

    const graph: OperationGraph = new OperationGraph(operations, {
      debugMode: false,
      quietMode: true,
      destinations: [mockStreamWritable],
      parallelism: 1,
      abortController: new AbortController()
    });

    const operationManagerContext: Pick<
      IOperationExecutionManagerContext,
      'projectConfigurations' | 'phaseSelection' | 'projectSelection'
    > = {
      projectConfigurations: new Map(),
      phaseSelection,
      projectSelection
    };

    await hooks.onGraphCreatedAsync.promise(
      graph,
      operationManagerContext as IOperationExecutionManagerContext
    );

    return graph;
  }

  describe('build plan debugging', () => {
    it('should generate a build plan', async () => {
      const hooks: PhasedCommandHooks = new PhasedCommandHooks();
      new PhasedOperationPlugin().apply(hooks);
      // Apply the plugin being tested
      new BuildPlanPlugin(terminal).apply(hooks);
      const buildCommand: IPhasedCommandConfig = commandLineConfiguration.commands.get(
        'build'
      )! as IPhasedCommandConfig;

      const graph = await testCreateOperationsAsync(
        hooks,
        buildCommand.phases,
        new Set(rushConfiguration.projects),
        new Set(rushConfiguration.projects)
      );

      const inputsSnapshot: Pick<
        IInputsSnapshot,
        'getTrackedFileHashesForOperation' | 'getOperationOwnStateHash'
      > = {
        getTrackedFileHashesForOperation() {
          return new Map();
        },
        getOperationOwnStateHash() {
          return '0';
        }
      };
      await graph.executeAsync({ inputsSnapshot: inputsSnapshot as IInputsSnapshot });

      expect(stringBufferTerminalProvider.getOutput({ normalizeSpecialCharacters: false })).toMatchSnapshot();
    });
  });
});
