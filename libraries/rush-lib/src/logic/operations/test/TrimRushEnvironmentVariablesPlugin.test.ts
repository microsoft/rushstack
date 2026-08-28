// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import { JsonFile } from '@rushstack/node-core-library';

import { RushConfiguration } from '../../../api/RushConfiguration';
import { CommandLineConfiguration, type IPhasedCommandConfig } from '../../../api/CommandLineConfiguration';
import type { Operation } from '../Operation';
import type { ICommandLineJson } from '../../../api/CommandLineJson';
import { PhasedOperationPlugin } from '../PhasedOperationPlugin';
import { ShellOperationRunnerPlugin } from '../ShellOperationRunnerPlugin';
import { TrimRushEnvironmentVariablesPlugin } from '../TrimRushEnvironmentVariablesPlugin';
import {
  type ICreateOperationsContext,
  type IOperationGraphContext,
  PhasedCommandHooks
} from '../../../pluginFramework/PhasedCommandHooks';
import type { IOperationGraph } from '../IOperationGraph';
import { OperationGraphHooks } from '../../../pluginFramework/OperationGraphHooks';
import type { IEnvironment } from '../../../utilities/Utilities';
import type { IOperationRunnerContext } from '../IOperationRunner';
import type { IOperationExecutionResult } from '../IOperationExecutionResult';

/**
 * Helper function to create a minimal mock record for testing the createEnvironmentForOperation hook
 */
function createMockRecord(operation: Operation): IOperationRunnerContext & IOperationExecutionResult {
  return {
    operation,
    environment: undefined
  } as IOperationRunnerContext & IOperationExecutionResult;
}

describe(TrimRushEnvironmentVariablesPlugin.name, () => {
  it('should remove RUSH_-prefixed environment variables while preserving others', async () => {
    const rushJsonFile: string = path.resolve(__dirname, `../../test/parameterIgnoringRepo/rush.json`);
    const commandLineJsonFile: string = path.resolve(
      __dirname,
      `../../test/parameterIgnoringRepo/common/config/rush/command-line.json`
    );

    const rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
    const commandLineJson: ICommandLineJson = await JsonFile.loadAsync(commandLineJsonFile);

    const commandLineConfiguration = new CommandLineConfiguration(commandLineJson);
    const buildCommand: IPhasedCommandConfig = commandLineConfiguration.commands.get(
      'build'
    )! as IPhasedCommandConfig;

    const fakeCreateOperationsContext: Pick<
      ICreateOperationsContext,
      'phaseSelection' | 'projectSelection' | 'projectConfigurations' | 'rushConfiguration'
    > = {
      phaseSelection: buildCommand.phases,
      projectSelection: new Set(rushConfiguration.projects),
      projectConfigurations: new Map(),
      rushConfiguration
    };

    const hooks: PhasedCommandHooks = new PhasedCommandHooks();

    // Apply plugins
    new PhasedOperationPlugin().apply(hooks);
    new ShellOperationRunnerPlugin().apply(hooks);
    new TrimRushEnvironmentVariablesPlugin().apply(hooks);

    const operations: Set<Operation> = await hooks.createOperationsAsync.promise(
      new Set(),
      fakeCreateOperationsContext as ICreateOperationsContext
    );

    // Set up a mock graph and invoke onGraphCreatedAsync so the plugin registers its graph hooks
    const graphHooks: OperationGraphHooks = new OperationGraphHooks();
    const fakeGraph: IOperationGraph = { hooks: graphHooks } as IOperationGraph;
    await hooks.onGraphCreatedAsync.promise(fakeGraph, fakeCreateOperationsContext as IOperationGraphContext);

    const operation = Array.from(operations)[0];
    expect(operation).toBeDefined();

    const mockRecord = createMockRecord(operation);

    const initialEnvironment: IEnvironment = {
      ...process.env,
      RUSH_TEMP_FOLDER: 'some-temp-folder',
      Rush_Some_Mixed_Case_Var: 'should also be trimmed',
      RUSHSTACK_FILE_ERROR_BASE_FOLDER: 'should be preserved',
      PATH: process.env.PATH,
      SOME_OTHER_VAR: 'should be preserved'
    };

    const env: IEnvironment = graphHooks.createEnvironmentForOperation.call(initialEnvironment, mockRecord);

    expect(env.RUSH_TEMP_FOLDER).toBeUndefined();
    expect(env.Rush_Some_Mixed_Case_Var).toBeUndefined();
    expect(env.RUSHSTACK_FILE_ERROR_BASE_FOLDER).toBe('should be preserved');
    expect(env.SOME_OTHER_VAR).toBe('should be preserved');
  });
});
