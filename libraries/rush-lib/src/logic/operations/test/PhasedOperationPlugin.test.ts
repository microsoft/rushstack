// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'path';
import { JsonFile } from '@rushstack/node-core-library';

import { RushConfiguration } from '../../../api/RushConfiguration';
import {
  CommandLineConfiguration,
  type IPhase,
  type IPhasedCommandConfig
} from '../../../api/CommandLineConfiguration';
import { PhasedOperationPlugin } from '../PhasedOperationPlugin';
import type { Operation } from '../Operation';
import type { ICommandLineJson } from '../../../api/CommandLineJson';
import { RushConstants } from '../../RushConstants';
import { MockOperationRunner } from './MockOperationRunner';
import {
  type ICreateOperationsContext,
  PhasedCommandHooks
} from '../../../pluginFramework/PhasedCommandHooks';
import type { RushConfigurationProject } from '../../..';

interface ISerializedOperation {
  name: string;
  silent: boolean;
  dependencies: string[];
}

function serializeOperation(operation: Operation): ISerializedOperation {
  return {
    name: operation.name!,
    silent: operation.runner!.silent,
    dependencies: Array.from(operation.dependencies, (dep: Operation) => dep.name!)
  };
}

describe(PhasedOperationPlugin.name, () => {
  const rushJsonFile: string = path.resolve(__dirname, `../../test/workspaceRepo/rush.json`);
  const commandLineJsonFile: string = path.resolve(
    __dirname,
    `../../test/workspaceRepo/common/config/rush/command-line.json`
  );

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

  let rushConfiguration!: RushConfiguration;
  let commandLineConfiguration!: CommandLineConfiguration;

  beforeAll(() => {
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
    const commandLineJson: ICommandLineJson = JsonFile.load(commandLineJsonFile);

    commandLineConfiguration = new CommandLineConfiguration(commandLineJson);
  });

  it('handles a full build', async () => {
    const buildCommand: IPhasedCommandConfig = commandLineConfiguration.commands.get(
      'build'
    )! as IPhasedCommandConfig;

    const operations: Set<Operation> = await testCreateOperationsAsync(
      buildCommand.phases,
      new Set(rushConfiguration.projects),
      new Set(rushConfiguration.projects)
    );

    // All projects
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();
  });

  it('handles filtered projects', async () => {
    const buildCommand: IPhasedCommandConfig = commandLineConfiguration.commands.get(
      'build'
    )! as IPhasedCommandConfig;

    let operations: Set<Operation> = await testCreateOperationsAsync(
      buildCommand.phases,
      new Set([rushConfiguration.getProjectByName('g')!]),
      new Set([rushConfiguration.getProjectByName('g')!])
    );

    // Single project
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();

    operations = await testCreateOperationsAsync(
      buildCommand.phases,
      new Set([
        rushConfiguration.getProjectByName('f')!,
        rushConfiguration.getProjectByName('a')!,
        rushConfiguration.getProjectByName('c')!
      ]),
      new Set([
        rushConfiguration.getProjectByName('f')!,
        rushConfiguration.getProjectByName('a')!,
        rushConfiguration.getProjectByName('c')!
      ])
    );

    // Filtered projects
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();
  });

  it('handles some changed projects', async () => {
    const buildCommand: IPhasedCommandConfig = commandLineConfiguration.commands.get(
      'build'
    )! as IPhasedCommandConfig;

    let operations: Set<Operation> = await testCreateOperationsAsync(
      buildCommand.phases,
      new Set(rushConfiguration.projects),
      new Set([rushConfiguration.getProjectByName('g')!])
    );

    // Single project
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();

    operations = await testCreateOperationsAsync(
      buildCommand.phases,
      new Set(rushConfiguration.projects),
      new Set([
        rushConfiguration.getProjectByName('f')!,
        rushConfiguration.getProjectByName('a')!,
        rushConfiguration.getProjectByName('c')!
      ])
    );

    // Filtered projects
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();
  });

  it('handles some changed projects within filtered projects', async () => {
    const buildCommand: IPhasedCommandConfig = commandLineConfiguration.commands.get(
      'build'
    )! as IPhasedCommandConfig;

    const operations: Set<Operation> = await testCreateOperationsAsync(
      buildCommand.phases,
      new Set([
        rushConfiguration.getProjectByName('f')!,
        rushConfiguration.getProjectByName('a')!,
        rushConfiguration.getProjectByName('c')!
      ]),
      new Set([rushConfiguration.getProjectByName('a')!, rushConfiguration.getProjectByName('c')!])
    );

    // Single project
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();
  });

  it('handles filtered phases', async () => {
    // Single phase with a missing dependency
    let operations: Set<Operation> = await testCreateOperationsAsync(
      new Set([commandLineConfiguration.phases.get('_phase:upstream-self')!]),
      new Set(rushConfiguration.projects),
      new Set(rushConfiguration.projects)
    );
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();

    // Two phases with a missing link
    operations = await testCreateOperationsAsync(
      new Set([
        commandLineConfiguration.phases.get('_phase:complex')!,
        commandLineConfiguration.phases.get('_phase:upstream-3')!,
        commandLineConfiguration.phases.get('_phase:upstream-1')!,
        commandLineConfiguration.phases.get('_phase:no-deps')!
      ]),
      new Set(rushConfiguration.projects),
      new Set(rushConfiguration.projects)
    );
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();
  });

  it('handles filtered phases on filtered projects', async () => {
    // Single phase with a missing dependency
    let operations: Set<Operation> = await testCreateOperationsAsync(
      new Set([commandLineConfiguration.phases.get('_phase:upstream-2')!]),
      new Set([
        rushConfiguration.getProjectByName('f')!,
        rushConfiguration.getProjectByName('a')!,
        rushConfiguration.getProjectByName('c')!
      ]),
      new Set([
        rushConfiguration.getProjectByName('f')!,
        rushConfiguration.getProjectByName('a')!,
        rushConfiguration.getProjectByName('c')!
      ])
    );
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();

    // Phases with missing links
    operations = await testCreateOperationsAsync(
      new Set([
        commandLineConfiguration.phases.get('_phase:complex')!,
        commandLineConfiguration.phases.get('_phase:upstream-3')!,
        commandLineConfiguration.phases.get('_phase:upstream-1')!,
        commandLineConfiguration.phases.get('_phase:no-deps')!
      ]),
      new Set([
        rushConfiguration.getProjectByName('f')!,
        rushConfiguration.getProjectByName('a')!,
        rushConfiguration.getProjectByName('c')!
      ]),
      new Set([
        rushConfiguration.getProjectByName('f')!,
        rushConfiguration.getProjectByName('a')!,
        rushConfiguration.getProjectByName('c')!
      ])
    );
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();
  });
});
