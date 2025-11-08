// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import { JsonFile } from '@rushstack/node-core-library';
import { ConsoleTerminalProvider, Terminal } from '@rushstack/terminal';
import {
  CommandLineAction,
  type CommandLineParameter,
  type CommandLineFlagParameter,
  type CommandLineStringParameter,
  type CommandLineChoiceParameter,
  type CommandLineStringListParameter
} from '@rushstack/ts-command-line';

import { RushConfiguration } from '../../../api/RushConfiguration';
import { CommandLineConfiguration, type IPhasedCommandConfig } from '../../../api/CommandLineConfiguration';
import type { Operation } from '../Operation';
import type { ICommandLineJson } from '../../../api/CommandLineJson';
import { PhasedOperationPlugin } from '../PhasedOperationPlugin';
import { ShellOperationRunnerPlugin } from '../ShellOperationRunnerPlugin';
import {
  type ICreateOperationsContext,
  PhasedCommandHooks
} from '../../../pluginFramework/PhasedCommandHooks';
import { RushProjectConfiguration } from '../../../api/RushProjectConfiguration';
import { createCommandLineParameters } from '../../../utilities/CommandLineParameterHelpers';

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

    // Create a dummy CommandLineAction to host the parameters
    const action: TestCommandLineAction = new TestCommandLineAction({
      actionName: 'build',
      summary: 'Test build action',
      documentation: 'Test'
    });

    // Create CommandLineParameter instances from the parameter definitions
    const customParametersMap: Map<string, CommandLineParameter> = createCommandLineParameters(
      action,
      buildCommand.associatedParameters
    );

    // Set values on the parameters to test filtering
    // Set --production flag
    const productionParam = customParametersMap.get('--production') as CommandLineFlagParameter | undefined;
    if (productionParam) {
      (productionParam as unknown as { _setValue(value: boolean): void })._setValue(true);
    }

    // Set --verbose flag
    const verboseParam = customParametersMap.get('--verbose') as CommandLineFlagParameter | undefined;
    if (verboseParam) {
      (verboseParam as unknown as { _setValue(value: boolean): void })._setValue(true);
    }

    // Set --config parameter
    const configParam = customParametersMap.get('--config') as CommandLineStringParameter | undefined;
    if (configParam) {
      (configParam as unknown as { _setValue(value: string): void })._setValue('/path/to/config.json');
    }

    // Set --mode parameter
    const modeParam = customParametersMap.get('--mode') as CommandLineChoiceParameter | undefined;
    if (modeParam) {
      (modeParam as unknown as { _setValue(value: string): void })._setValue('prod');
    }

    // Set --tags parameter
    const tagsParam = customParametersMap.get('--tags') as CommandLineStringListParameter | undefined;
    if (tagsParam) {
      (tagsParam as unknown as { _setValue(value: string[]): void })._setValue(['tag1', 'tag2']);
    }

    // Update the phase's associatedParameters to use our created CommandLineParameters
    for (const phase of buildCommand.phases) {
      phase.associatedParameters.clear();
      for (const param of customParametersMap.values()) {
        phase.associatedParameters.add(param);
      }
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
      customParameters: customParametersMap
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

    // Verify that project 'b' has all parameters (no filtering)
    const operationB = Array.from(operations).find((op) => op.name === 'b');
    expect(operationB).toBeDefined();
    const commandHashB = operationB!.runner!.getConfigHash();
    // Should contain all parameters since no filtering is configured
    expect(commandHashB).toContain('--production');
    expect(commandHashB).toContain('--verbose');
    expect(commandHashB).toContain('--config');
    expect(commandHashB).toContain('--mode');
    expect(commandHashB).toContain('--tags');

    // All projects snapshot
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();
  });
});
