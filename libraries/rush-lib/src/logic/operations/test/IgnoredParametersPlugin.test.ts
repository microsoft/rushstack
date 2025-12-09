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
import { IgnoredParametersPlugin } from '../IgnoredParametersPlugin';
import {
  type ICreateOperationsContext,
  PhasedCommandHooks
} from '../../../pluginFramework/PhasedCommandHooks';
import { RushProjectConfiguration } from '../../../api/RushProjectConfiguration';
import type { IEnvironment } from '../../../utilities/Utilities';

/**
 * Helper function to create a minimal mock record for testing the createEnvironmentForOperation hook
 */
function createMockRecord(operation: Operation): any {
  return {
    operation,
    collatedWriter: {} as any,
    debugMode: false,
    quietMode: true,
    _operationMetadataManager: {} as any,
    stopwatch: {} as any,
    status: {} as any,
    environment: undefined,
    error: undefined,
    silent: false,
    stdioSummarizer: {} as any,
    problemCollector: {} as any,
    nonCachedDurationMs: undefined,
    metadataFolderPath: undefined,
    logFilePaths: undefined,
    getStateHash: () => '',
    getStateHashComponents: () => [],
    runWithTerminalAsync: async () => {}
  };
}

describe(IgnoredParametersPlugin.name, () => {
  it('should set RUSHSTACK_OPERATION_IGNORED_PARAMETERS environment variable', async () => {
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

    // Apply plugins
    new PhasedOperationPlugin().apply(hooks);
    new ShellOperationRunnerPlugin().apply(hooks);
    new IgnoredParametersPlugin().apply(hooks);

    const operations: Set<Operation> = await hooks.createOperations.promise(
      new Set(),
      fakeCreateOperationsContext as ICreateOperationsContext
    );

    // Test project 'a' which has parameterNamesToIgnore: ["--production"]
    const operationA = Array.from(operations).find((op) => op.name === 'a');
    expect(operationA).toBeDefined();

    // Create a mock operation execution result with required fields
    const mockRecordA = createMockRecord(operationA!);

    // Call the hook to get the environment
    const envA: IEnvironment = hooks.createEnvironmentForOperation.call({ ...process.env }, mockRecordA);

    // Verify the environment variable is set correctly for project 'a'
    expect(envA.RUSHSTACK_OPERATION_IGNORED_PARAMETERS).toBe('--production');

    // Test project 'b' which has parameterNamesToIgnore: ["--verbose", "--config", "--mode", "--tags"]
    const operationB = Array.from(operations).find((op) => op.name === 'b');
    expect(operationB).toBeDefined();

    const mockRecordB = createMockRecord(operationB!);

    const envB: IEnvironment = hooks.createEnvironmentForOperation.call({ ...process.env }, mockRecordB);

    // Verify the environment variable is set correctly for project 'b'
    expect(envB.RUSHSTACK_OPERATION_IGNORED_PARAMETERS).toBe('--verbose --config --mode --tags');
  });

  it('should not set environment variable when parameterNamesToIgnore is not specified', async () => {
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
      | 'rushConfiguration'
    > = {
      phaseOriginal: echoCommand.phases,
      phaseSelection: echoCommand.phases,
      projectSelection: new Set(rushConfiguration.projects),
      projectsInUnknownState: new Set(rushConfiguration.projects),
      projectConfigurations: new Map(),
      rushConfiguration
    };

    const hooks: PhasedCommandHooks = new PhasedCommandHooks();

    // Apply plugins
    new PhasedOperationPlugin().apply(hooks);
    new ShellOperationRunnerPlugin().apply(hooks);
    new IgnoredParametersPlugin().apply(hooks);

    const operations: Set<Operation> = await hooks.createOperations.promise(
      new Set(),
      fakeCreateOperationsContext as ICreateOperationsContext
    );

    // Get any operation
    const operation = Array.from(operations)[0];
    expect(operation).toBeDefined();

    const mockRecord = createMockRecord(operation);

    const env: IEnvironment = hooks.createEnvironmentForOperation.call({ ...process.env }, mockRecord);

    // Verify the environment variable is not set
    expect(env.RUSHSTACK_OPERATION_IGNORED_PARAMETERS).toBeUndefined();
  });
});
