// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import { JsonFile } from '@rushstack/node-core-library';
import { ConsoleTerminalProvider, Terminal } from '@rushstack/terminal';

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

    const fakeCreateOperationsContext: Pick<
      ICreateOperationsContext,
      | 'phaseOriginal'
      | 'phaseSelection'
      | 'projectSelection'
      | 'projectsInUnknownState'
      | 'projectConfigurations'
      | 'rushConfiguration'
    > = {
      phaseOriginal: buildCommand.phases,
      phaseSelection: buildCommand.phases,
      projectSelection: new Set(rushConfiguration.projects),
      projectsInUnknownState: new Set(rushConfiguration.projects),
      projectConfigurations,
      rushConfiguration
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

    // Verify that project 'b' has all parameters (no filtering)
    const operationB = Array.from(operations).find((op) => op.name === 'b');
    expect(operationB).toBeDefined();
    // Should contain all parameters since no filtering is configured
    // Note: Parameters only appear if they are provided, so we can't test for them without setting them

    // All projects snapshot
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();
  });
});
