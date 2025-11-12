// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import { JsonFile } from '@rushstack/node-core-library';
import { ConsoleTerminalProvider, Terminal } from '@rushstack/terminal';
import { CommandLineAction, CommandLineParser, type CommandLineParameter } from '@rushstack/ts-command-line';

import { RushConfiguration } from '../../../api/RushConfiguration';
import {
  CommandLineConfiguration,
  type IPhasedCommandConfig,
  type IParameterJson,
  type IPhase
} from '../../../api/CommandLineConfiguration';
import type { Operation } from '../Operation';
import type { ICommandLineJson } from '../../../api/CommandLineJson';
import { PhasedOperationPlugin } from '../PhasedOperationPlugin';
import { ShellOperationRunnerPlugin } from '../ShellOperationRunnerPlugin';
import {
  type ICreateOperationsContext,
  PhasedCommandHooks
} from '../../../pluginFramework/PhasedCommandHooks';
import { RushProjectConfiguration } from '../../../api/RushProjectConfiguration';
import { defineCustomParameters } from '../../../cli/parsing/defineCustomParameters';
import { associateParametersByPhase } from '../../../cli/parsing/associateParametersByPhase';

interface ISerializedOperation {
  name: string;
  commandToRun: string;
}

function serializeOperation(operation: Operation): ISerializedOperation {
  return {
    name: operation.name,
    commandToRun: operation.runner!.getConfigHash()
  };
}

/**
 * Test implementation of CommandLineAction for testing parameter handling
 */
class TestCommandLineAction extends CommandLineAction {
  protected async onExecuteAsync(): Promise<void> {
    // No-op for testing
  }
}

/**
 * Test implementation of CommandLineParser for testing parameter handling
 */
class TestCommandLineParser extends CommandLineParser {
  public constructor() {
    super({
      toolFilename: 'test-tool',
      toolDescription: 'Test tool for parameter parsing'
    });
  }
}

describe(ShellOperationRunnerPlugin.name, () => {
  it('shellCommand "echo custom shellCommand" should be set to commandToRun', async () => {
    const rushJsonFile: string = path.resolve(__dirname, `../../test/customShellCommandinBulkRepo/rush.json`);
    const commandLineJsonFile: string = path.resolve(
      __dirname,
      `../../test/customShellCommandinBulkRepo/common/config/rush/command-line.json`
    );

    const rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
    const commandLineJson: ICommandLineJson = JsonFile.load(commandLineJsonFile);

    const commandLineConfiguration = new CommandLineConfiguration(commandLineJson);

    const echoCommand: IPhasedCommandConfig = commandLineConfiguration.commands.get(
      'echo'
    )! as IPhasedCommandConfig;

    const fakeCreateOperationsContext: Pick<
      ICreateOperationsContext,
      | 'phaseOriginal'
      | 'phaseSelection'
      | 'projectSelection'
      | 'projectsInUnknownState'
      | 'projectConfigurations'
    > = {
      phaseOriginal: echoCommand.phases,
      phaseSelection: echoCommand.phases,
      projectSelection: new Set(rushConfiguration.projects),
      projectsInUnknownState: new Set(rushConfiguration.projects),
      projectConfigurations: new Map()
    };

    const hooks: PhasedCommandHooks = new PhasedCommandHooks();

    // Generates the default operation graph
    new PhasedOperationPlugin().apply(hooks);
    // Applies the Shell Operation Runner to selected operations
    new ShellOperationRunnerPlugin().apply(hooks);

    const operations: Set<Operation> = await hooks.createOperations.promise(
      new Set(),
      fakeCreateOperationsContext as ICreateOperationsContext
    );
    // All projects
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();
  });

  it('shellCommand priority should be higher than script name', async () => {
    const rushJsonFile: string = path.resolve(
      __dirname,
      `../../test/customShellCommandinBulkOverrideScriptsRepo/rush.json`
    );
    const commandLineJsonFile: string = path.resolve(
      __dirname,
      `../../test/customShellCommandinBulkOverrideScriptsRepo/common/config/rush/command-line.json`
    );

    const rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
    const commandLineJson: ICommandLineJson = JsonFile.load(commandLineJsonFile);

    const commandLineConfiguration = new CommandLineConfiguration(commandLineJson);
    const echoCommand: IPhasedCommandConfig = commandLineConfiguration.commands.get(
      'echo'
    )! as IPhasedCommandConfig;

    const fakeCreateOperationsContext: Pick<
      ICreateOperationsContext,
      | 'phaseOriginal'
      | 'phaseSelection'
      | 'projectSelection'
      | 'projectsInUnknownState'
      | 'projectConfigurations'
    > = {
      phaseOriginal: echoCommand.phases,
      phaseSelection: echoCommand.phases,
      projectSelection: new Set(rushConfiguration.projects),
      projectsInUnknownState: new Set(rushConfiguration.projects),
      projectConfigurations: new Map()
    };

    const hooks: PhasedCommandHooks = new PhasedCommandHooks();

    // Generates the default operation graph
    new PhasedOperationPlugin().apply(hooks);
    // Applies the Shell Operation Runner to selected operations
    new ShellOperationRunnerPlugin().apply(hooks);

    const operations: Set<Operation> = await hooks.createOperations.promise(
      new Set(),
      fakeCreateOperationsContext as ICreateOperationsContext
    );
    // All projects
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();
  });

  it('parameters should be filtered when parameterNamesToIgnore is specified', async () => {
    const rushJsonFile: string = path.resolve(__dirname, `../../test/parameterIgnoringRepo/rush.json`);
    const commandLineJsonFile: string = path.resolve(
      __dirname,
      `../../test/parameterIgnoringRepo/common/config/rush/command-line.json`
    );

    const rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
    const commandLineJson: ICommandLineJson = JsonFile.load(commandLineJsonFile);

    const commandLineConfiguration = new CommandLineConfiguration(commandLineJson);
    const buildCommand: IPhasedCommandConfig = commandLineConfiguration.commands.get(
      'build'
    )! as IPhasedCommandConfig;

    // Load project configurations
    const terminalProvider: ConsoleTerminalProvider = new ConsoleTerminalProvider();
    const terminal: Terminal = new Terminal(terminalProvider);

    const projectConfigurations = await RushProjectConfiguration.tryLoadForProjectsAsync(
      rushConfiguration.projects,
      terminal
    );

    // Create CommandLineParser and action to parse parameter values
    const parser: TestCommandLineParser = new TestCommandLineParser();
    const action: TestCommandLineAction = new TestCommandLineAction({
      actionName: 'build',
      summary: 'Test build action',
      documentation: 'Test'
    });
    parser.addAction(action);

    // Create CommandLineParameter instances from the parameter definitions
    const customParametersMap: Map<IParameterJson, CommandLineParameter> = new Map();
    defineCustomParameters(action, buildCommand.associatedParameters, customParametersMap);

    // Parse parameter values using the parser
    await parser.executeWithoutErrorHandlingAsync([
      'build',
      '--production',
      '--verbose',
      '--config',
      '/path/to/config.json',
      '--mode',
      'prod',
      '--tags',
      'tag1',
      '--tags',
      'tag2'
    ]);

    // Associate parameters with phases using the helper
    // Create a map of phase names to phases for the helper
    const phasesMap: Map<string, IPhase> = new Map();
    for (const phase of buildCommand.phases) {
      phasesMap.set(phase.name, phase);
    }
    associateParametersByPhase(customParametersMap, phasesMap);

    // Create customParameters map for ICreateOperationsContext (keyed by longName)
    const customParametersForContext: Map<string, CommandLineParameter> = new Map();
    for (const [param, cli] of customParametersMap) {
      customParametersForContext.set(param.longName, cli);
    }

    const fakeCreateOperationsContext: Pick<
      ICreateOperationsContext,
      | 'phaseOriginal'
      | 'phaseSelection'
      | 'projectSelection'
      | 'projectsInUnknownState'
      | 'projectConfigurations'
      | 'rushConfiguration'
      | 'customParameters'
    > = {
      phaseOriginal: buildCommand.phases,
      phaseSelection: buildCommand.phases,
      projectSelection: new Set(rushConfiguration.projects),
      projectsInUnknownState: new Set(rushConfiguration.projects),
      projectConfigurations,
      rushConfiguration,
      customParameters: customParametersForContext
    };

    const hooks: PhasedCommandHooks = new PhasedCommandHooks();

    // Generates the default operation graph
    new PhasedOperationPlugin().apply(hooks);
    // Applies the Shell Operation Runner to selected operations
    new ShellOperationRunnerPlugin().apply(hooks);

    const operations: Set<Operation> = await hooks.createOperations.promise(
      new Set(),
      fakeCreateOperationsContext as ICreateOperationsContext
    );

    // Verify that project 'a' has the --production parameter filtered out
    const operationA = Array.from(operations).find((op) => op.name === 'a');
    expect(operationA).toBeDefined();
    const commandHashA = operationA!.runner!.getConfigHash();
    // Should not contain --production but should contain other parameters
    expect(commandHashA).not.toContain('--production');
    expect(commandHashA).toContain('--verbose');
    expect(commandHashA).toContain('--config');
    expect(commandHashA).toContain('--mode');
    expect(commandHashA).toContain('--tags');

    // Verify that project 'b' has --verbose, --config, --mode, and --tags filtered out
    const operationB = Array.from(operations).find((op) => op.name === 'b');
    expect(operationB).toBeDefined();
    const commandHashB = operationB!.runner!.getConfigHash();
    // Should contain --production but not the other parameters since they are filtered
    expect(commandHashB).toContain('--production');
    expect(commandHashB).not.toContain('--verbose');
    expect(commandHashB).not.toContain('--config');
    expect(commandHashB).not.toContain('--mode');
    expect(commandHashB).not.toContain('--tags');

    // All projects snapshot
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();
  });
});
