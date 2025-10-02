// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import { JsonFile } from '@rushstack/node-core-library';

import { RushConfiguration } from '../../../api/RushConfiguration';
import { CommandLineConfiguration, type IPhasedCommandConfig } from '../../../api/CommandLineConfiguration';
import { PhasedOperationPlugin } from '../PhasedOperationPlugin';
import type { Operation } from '../Operation';
import type { ICommandLineJson } from '../../../api/CommandLineJson';
import { RushConstants } from '../../RushConstants';
import { MockOperationRunner } from './MockOperationRunner';
import {
  type ICreateOperationsContext,
  PhasedCommandHooks
} from '../../../pluginFramework/PhasedCommandHooks';

function serializeOperation(operation: Operation): string {
  return `${operation.name} (${operation.enabled ? 'enabled' : 'disabled'}${operation.runner!.silent ? ', silent' : ''}) -> [${Array.from(
    operation.dependencies,
    (dep: Operation) => dep.name
  )
    .sort()
    .join(', ')}]`;
}

function compareOperation(a: Operation, b: Operation): number {
  if (a.enabled && !b.enabled) {
    return -1;
  }
  if (!a.enabled && b.enabled) {
    return 1;
  }
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

function expectOperationsToMatchSnapshot(operations: Set<Operation>, name: string): void {
  const serializedOperations: string[] = Array.from(operations)
    .sort(compareOperation)
    .map(serializeOperation);
  expect(serializedOperations).toMatchSnapshot(name);
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

      if (!operation.runner) {
        const name: string = `${associatedProject.packageName} (${associatedPhase.name.slice(
          RushConstants.phaseNamePrefix.length
        )})`;

        operation.runner = new MockOperationRunner(name);
      }
    }

    return operations;
  }

  interface ITestCreateOperationsContext {
    phaseOriginal?: ICreateOperationsContext['phaseOriginal'];
    phaseSelection: ICreateOperationsContext['phaseSelection'];
    projectSelection: ICreateOperationsContext['projectSelection'];
    projectsInUnknownState: ICreateOperationsContext['projectsInUnknownState'];
    includePhaseDeps?: ICreateOperationsContext['includePhaseDeps'];
  }

  async function testCreateOperationsAsync(options: ITestCreateOperationsContext): Promise<Set<Operation>> {
    const {
      phaseSelection,
      projectSelection,
      projectsInUnknownState,
      phaseOriginal = phaseSelection,
      includePhaseDeps = false
    } = options;
    const hooks: PhasedCommandHooks = new PhasedCommandHooks();
    // Apply the plugin being tested
    new PhasedOperationPlugin().apply(hooks);
    // Add mock runners for included operations.
    hooks.createOperations.tap('MockOperationRunnerPlugin', createMockRunner);

    const context: Pick<
      ICreateOperationsContext,
      | 'includePhaseDeps'
      | 'phaseOriginal'
      | 'phaseSelection'
      | 'projectSelection'
      | 'projectsInUnknownState'
      | 'projectConfigurations'
    > = {
      includePhaseDeps,
      phaseOriginal,
      phaseSelection,
      projectSelection,
      projectsInUnknownState,
      projectConfigurations: new Map()
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

    const operations: Set<Operation> = await testCreateOperationsAsync({
      phaseSelection: buildCommand.phases,
      projectSelection: new Set(rushConfiguration.projects),
      projectsInUnknownState: new Set(rushConfiguration.projects)
    });

    // All projects
    expectOperationsToMatchSnapshot(operations, 'full');
  });

  it('handles filtered projects', async () => {
    const buildCommand: IPhasedCommandConfig = commandLineConfiguration.commands.get(
      'build'
    )! as IPhasedCommandConfig;

    let operations: Set<Operation> = await testCreateOperationsAsync({
      phaseSelection: buildCommand.phases,
      projectSelection: new Set([rushConfiguration.getProjectByName('g')!]),
      projectsInUnknownState: new Set([rushConfiguration.getProjectByName('g')!])
    });

    // Single project
    expectOperationsToMatchSnapshot(operations, 'single');

    operations = await testCreateOperationsAsync({
      phaseSelection: buildCommand.phases,
      projectSelection: new Set([
        rushConfiguration.getProjectByName('f')!,
        rushConfiguration.getProjectByName('a')!,
        rushConfiguration.getProjectByName('c')!
      ]),
      projectsInUnknownState: new Set([
        rushConfiguration.getProjectByName('f')!,
        rushConfiguration.getProjectByName('a')!,
        rushConfiguration.getProjectByName('c')!
      ])
    });

    // Filtered projects
    expectOperationsToMatchSnapshot(operations, 'filtered');
  });

  it('handles some changed projects', async () => {
    const buildCommand: IPhasedCommandConfig = commandLineConfiguration.commands.get(
      'build'
    )! as IPhasedCommandConfig;

    let operations: Set<Operation> = await testCreateOperationsAsync({
      phaseSelection: buildCommand.phases,
      projectSelection: new Set(rushConfiguration.projects),
      projectsInUnknownState: new Set([rushConfiguration.getProjectByName('g')!])
    });

    // Single project
    expectOperationsToMatchSnapshot(operations, 'single');

    operations = await testCreateOperationsAsync({
      phaseSelection: buildCommand.phases,
      projectSelection: new Set(rushConfiguration.projects),
      projectsInUnknownState: new Set([
        rushConfiguration.getProjectByName('f')!,
        rushConfiguration.getProjectByName('a')!,
        rushConfiguration.getProjectByName('c')!
      ])
    });

    // Filtered projects
    expectOperationsToMatchSnapshot(operations, 'multiple');
  });

  it('handles some changed projects within filtered projects', async () => {
    const buildCommand: IPhasedCommandConfig = commandLineConfiguration.commands.get(
      'build'
    )! as IPhasedCommandConfig;

    const operations: Set<Operation> = await testCreateOperationsAsync({
      phaseSelection: buildCommand.phases,
      projectSelection: new Set([
        rushConfiguration.getProjectByName('f')!,
        rushConfiguration.getProjectByName('a')!,
        rushConfiguration.getProjectByName('c')!
      ]),
      projectsInUnknownState: new Set([
        rushConfiguration.getProjectByName('a')!,
        rushConfiguration.getProjectByName('c')!
      ])
    });

    // Single project
    expectOperationsToMatchSnapshot(operations, 'multiple');
  });

  it('handles different phaseOriginal vs phaseSelection without --include-phase-deps', async () => {
    const operations: Set<Operation> = await testCreateOperationsAsync({
      includePhaseDeps: false,
      phaseSelection: new Set([
        commandLineConfiguration.phases.get('_phase:no-deps')!,
        commandLineConfiguration.phases.get('_phase:upstream-self')!
      ]),
      phaseOriginal: new Set([commandLineConfiguration.phases.get('_phase:upstream-self')!]),
      projectSelection: new Set([rushConfiguration.getProjectByName('a')!]),
      projectsInUnknownState: new Set([rushConfiguration.getProjectByName('a')!])
    });

    expectOperationsToMatchSnapshot(operations, 'single-project');
  });

  it('handles different phaseOriginal vs phaseSelection with --include-phase-deps', async () => {
    const operations: Set<Operation> = await testCreateOperationsAsync({
      includePhaseDeps: true,
      phaseSelection: new Set([
        commandLineConfiguration.phases.get('_phase:no-deps')!,
        commandLineConfiguration.phases.get('_phase:upstream-self')!
      ]),
      phaseOriginal: new Set([commandLineConfiguration.phases.get('_phase:upstream-self')!]),
      projectSelection: new Set([rushConfiguration.getProjectByName('a')!]),
      projectsInUnknownState: new Set([rushConfiguration.getProjectByName('a')!])
    });

    expectOperationsToMatchSnapshot(operations, 'single-project');
  });

  it('handles different phaseOriginal vs phaseSelection cross-project with --include-phase-deps', async () => {
    const operations: Set<Operation> = await testCreateOperationsAsync({
      includePhaseDeps: true,
      phaseSelection: new Set([
        commandLineConfiguration.phases.get('_phase:no-deps')!,
        commandLineConfiguration.phases.get('_phase:upstream-1')!
      ]),
      phaseOriginal: new Set([commandLineConfiguration.phases.get('_phase:upstream-1')!]),
      projectSelection: new Set([
        rushConfiguration.getProjectByName('a')!,
        rushConfiguration.getProjectByName('h')!
      ]),
      projectsInUnknownState: new Set([rushConfiguration.getProjectByName('h')!])
    });

    expectOperationsToMatchSnapshot(operations, 'multiple-project');
  });

  it('handles filtered phases', async () => {
    // Single phase with a missing dependency
    let operations: Set<Operation> = await testCreateOperationsAsync({
      phaseSelection: new Set([commandLineConfiguration.phases.get('_phase:upstream-self')!]),
      projectSelection: new Set(rushConfiguration.projects),
      projectsInUnknownState: new Set(rushConfiguration.projects)
    });
    expectOperationsToMatchSnapshot(operations, 'single-phase');

    // Two phases with a missing link
    operations = await testCreateOperationsAsync({
      phaseSelection: new Set([
        commandLineConfiguration.phases.get('_phase:complex')!,
        commandLineConfiguration.phases.get('_phase:upstream-3')!,
        commandLineConfiguration.phases.get('_phase:upstream-1')!,
        commandLineConfiguration.phases.get('_phase:no-deps')!
      ]),
      projectSelection: new Set(rushConfiguration.projects),
      projectsInUnknownState: new Set(rushConfiguration.projects)
    });
    expectOperationsToMatchSnapshot(operations, 'two-phases');
  });

  it('handles filtered phases on filtered projects', async () => {
    // Single phase with a missing dependency
    let operations: Set<Operation> = await testCreateOperationsAsync({
      phaseSelection: new Set([commandLineConfiguration.phases.get('_phase:upstream-2')!]),
      projectSelection: new Set([
        rushConfiguration.getProjectByName('f')!,
        rushConfiguration.getProjectByName('a')!,
        rushConfiguration.getProjectByName('c')!
      ]),
      projectsInUnknownState: new Set([
        rushConfiguration.getProjectByName('f')!,
        rushConfiguration.getProjectByName('a')!,
        rushConfiguration.getProjectByName('c')!
      ])
    });
    expectOperationsToMatchSnapshot(operations, 'single-phase');

    // Phases with missing links
    operations = await testCreateOperationsAsync({
      phaseSelection: new Set([
        commandLineConfiguration.phases.get('_phase:complex')!,
        commandLineConfiguration.phases.get('_phase:upstream-3')!,
        commandLineConfiguration.phases.get('_phase:upstream-1')!,
        commandLineConfiguration.phases.get('_phase:no-deps')!
      ]),
      projectSelection: new Set([
        rushConfiguration.getProjectByName('f')!,
        rushConfiguration.getProjectByName('a')!,
        rushConfiguration.getProjectByName('c')!
      ]),
      projectsInUnknownState: new Set([
        rushConfiguration.getProjectByName('f')!,
        rushConfiguration.getProjectByName('a')!,
        rushConfiguration.getProjectByName('c')!
      ])
    });
    expectOperationsToMatchSnapshot(operations, 'missing-links');
  });
});
