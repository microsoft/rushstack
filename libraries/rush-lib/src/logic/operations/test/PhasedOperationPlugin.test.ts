// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import { JsonFile } from '@rushstack/node-core-library';

import { RushConfiguration } from '../../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import { CommandLineConfiguration, type IPhasedCommandConfig } from '../../../api/CommandLineConfiguration';
import { PhasedOperationPlugin } from '../PhasedOperationPlugin';
import type { Operation } from '../Operation';
import type { ICommandLineJson } from '../../../api/CommandLineJson';
import { RushConstants } from '../../RushConstants';
import { MockOperationRunner } from './MockOperationRunner';
import {
  type ICreateOperationsContext,
  OperationGraphHooks,
  PhasedCommandHooks
} from '../../../pluginFramework/PhasedCommandHooks';
import type { IOperationGraph, IOperationGraphContext } from '../../../pluginFramework/PhasedCommandHooks';
type IOperationExecutionManager = IOperationGraph;
type IOperationExecutionManagerContext = IOperationGraphContext;

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
    phaseSelection: ICreateOperationsContext['phaseSelection'];
    projectSelection: ICreateOperationsContext['projectSelection'];
    includePhaseDeps?: ICreateOperationsContext['includePhaseDeps'];
    generateFullGraph?: ICreateOperationsContext['generateFullGraph'];
  }

  let rushConfiguration!: RushConfiguration;
  let commandLineConfiguration!: CommandLineConfiguration;

  beforeAll(() => {
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
    const commandLineJson: ICommandLineJson = JsonFile.load(commandLineJsonFile);

    commandLineConfiguration = new CommandLineConfiguration(commandLineJson);
  });

  async function testCreateOperationsAsync(options: ITestCreateOperationsContext): Promise<Set<Operation>> {
    const { phaseSelection, projectSelection, includePhaseDeps = false, generateFullGraph = false } = options;
    const hooks: PhasedCommandHooks = new PhasedCommandHooks();
    // Apply the plugin being tested
    new PhasedOperationPlugin().apply(hooks);
    // Add mock runners for included operations.
    hooks.createOperationsAsync.tap('MockOperationRunnerPlugin', createMockRunner);

    const context: Partial<ICreateOperationsContext> = {
      phaseSelection,
      projectSelection,
      projectConfigurations: new Map(),
      includePhaseDeps,
      generateFullGraph,
      // Minimal required fields for plugin logic not used directly in these tests
      changedProjectsOnly: false,
      isIncrementalBuildAllowed: true,
      isWatch: generateFullGraph, // simulate watch when using full graph flag
      customParameters: new Map(),
      rushConfiguration
    };
    const operations: Set<Operation> = await hooks.createOperationsAsync.promise(
      new Set(),
      context as ICreateOperationsContext
    );

    const executionHooks: OperationGraphHooks = new OperationGraphHooks();
    const executionManager: Partial<IOperationExecutionManager> = {
      operations,
      hooks: executionHooks
    };
    await hooks.onGraphCreatedAsync.promise(
      executionManager as IOperationExecutionManager,
      context as IOperationExecutionManagerContext
    );

    return operations;
  }

  it('handles a full build', async () => {
    const buildCommand: IPhasedCommandConfig = commandLineConfiguration.commands.get(
      'build'
    )! as IPhasedCommandConfig;

    const operations: Set<Operation> = await testCreateOperationsAsync({
      phaseSelection: buildCommand.phases,
      projectSelection: new Set(rushConfiguration.projects)
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
      projectSelection: new Set([rushConfiguration.getProjectByName('g')!])
    });

    // Single project
    expectOperationsToMatchSnapshot(operations, 'single');

    operations = await testCreateOperationsAsync({
      phaseSelection: buildCommand.phases,
      projectSelection: new Set([
        rushConfiguration.getProjectByName('f')!,
        rushConfiguration.getProjectByName('a')!,
        rushConfiguration.getProjectByName('c')!
      ])
    });

    // Filtered projects
    expectOperationsToMatchSnapshot(operations, 'filtered');
  });

  it('handles incomplete phaseSelection without --include-phase-deps', async () => {
    const operations: Set<Operation> = await testCreateOperationsAsync({
      includePhaseDeps: false,
      phaseSelection: new Set([commandLineConfiguration.phases.get('_phase:upstream-self')!]),
      projectSelection: new Set([rushConfiguration.getProjectByName('a')!])
    });

    expectOperationsToMatchSnapshot(operations, 'single-project');
  });

  it('handles incomplete phaseSelection with --include-phase-deps', async () => {
    const operations: Set<Operation> = await testCreateOperationsAsync({
      includePhaseDeps: true,
      phaseSelection: new Set([commandLineConfiguration.phases.get('_phase:upstream-self')!]),
      projectSelection: new Set([rushConfiguration.getProjectByName('a')!])
    });

    expectOperationsToMatchSnapshot(operations, 'single-project');
  });

  it('handles incomplete phaseSelection cross-project with --include-phase-deps', async () => {
    const operations: Set<Operation> = await testCreateOperationsAsync({
      includePhaseDeps: true,
      phaseSelection: new Set([commandLineConfiguration.phases.get('_phase:upstream-1')!]),
      projectSelection: new Set([rushConfiguration.getProjectByName('h')!])
    });

    expectOperationsToMatchSnapshot(operations, 'multiple-project');
  });

  it('handles filtered phases', async () => {
    // Single phase with a missing dependency
    let operations: Set<Operation> = await testCreateOperationsAsync({
      phaseSelection: new Set([commandLineConfiguration.phases.get('_phase:upstream-self')!]),
      projectSelection: new Set(rushConfiguration.projects)
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
      projectSelection: new Set(rushConfiguration.projects)
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
      ])
    });
    expectOperationsToMatchSnapshot(operations, 'missing-links');
  });

  it('includes full graph but enables subset when generateFullGraph is true', async () => {
    const buildCommand: IPhasedCommandConfig = commandLineConfiguration.commands.get(
      'build'
    )! as IPhasedCommandConfig;
    const subset: Set<RushConfigurationProject> = new Set([
      rushConfiguration.getProjectByName('a')!,
      rushConfiguration.getProjectByName('c')!
    ]);

    const operations: Set<Operation> = await testCreateOperationsAsync({
      phaseSelection: buildCommand.phases,
      projectSelection: subset,
      generateFullGraph: true
    });

    // Expect all projects to be present, but only selected subset enabled
    expectOperationsToMatchSnapshot(operations, 'full-graph-filtered');
  });
});
