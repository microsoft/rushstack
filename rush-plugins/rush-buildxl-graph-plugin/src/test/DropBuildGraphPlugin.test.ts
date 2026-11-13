// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Exercise this checkout's API rather than the installed Rush version launching Jest.
jest.mock('@rushstack/rush-sdk', () => jest.requireActual('@microsoft/rush-lib'));
jest.mock('../dropGraph');

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { JsonFile } from '@rushstack/node-core-library';
import {
  RushConfiguration,
  RushSession,
  PhasedCommandHooks,
  OperationGraphHooks,
  OperationStatus,
  type IOperationGraph,
  type IOperationGraphContext
} from '@rushstack/rush-sdk';
import { NoOpTerminalProvider } from '@rushstack/terminal';
import { CommandLineParser } from '@rushstack/ts-command-line';

import { DropBuildGraphPlugin } from '../DropBuildGraphPlugin';
import { dropGraphAsync } from '../dropGraph';

describe(DropBuildGraphPlugin.name, () => {
  let folder: string;
  let rushConfiguration: RushConfiguration;

  beforeAll(async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), 'rush-export-plugin-'));
    const configPath: string = path.join(folder, 'rush.json');
    await JsonFile.saveAsync({ rushVersion: '5.182.0', pnpmVersion: '10.27.0', projects: [] }, configPath);
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(configPath);
  });

  afterAll(async () => {
    await fs.rm(folder, { recursive: true, force: true });
  });

  it.each(['export', 'watch', 'local', 'invalid'])('handles graph export (%s)', async (mode) => {
    const dropGraphMock = jest.mocked(dropGraphAsync);
    dropGraphMock.mockReset().mockResolvedValue(mode !== 'invalid');
    if (mode === 'export') {
      dropGraphMock.mockImplementation(
        jest.requireActual<typeof import('../dropGraph')>('../dropGraph').dropGraphAsync
      );
    }
    const hooks: PhasedCommandHooks = new PhasedCommandHooks();
    const session: RushSession = new RushSession({
      terminalProvider: new NoOpTerminalProvider(),
      getIsDebugMode: () => false
    });
    new DropBuildGraphPlugin({ buildXLCommandNames: ['build'] }).apply(session, rushConfiguration);
    const graph: IOperationGraph = {
      abortController: new AbortController(),
      hooks: new OperationGraphHooks(),
      operations: new Set(),
      resultByOperation: new Map(),
      status: OperationStatus.Ready,
      parallelism: 1,
      debugMode: false,
      quietMode: true,
      allowOversubscription: false,
      pauseNextIteration: false,
      terminalDestinations: new Set(),
      hasScheduledIteration: false,
      createExecutionPlanAsync: jest.fn(async () => new Map()),
      abortCurrentIterationAsync: jest.fn(async () => {}),
      closeRunnersAsync: jest.fn(async () => {}),
      addTerminalDestination: jest.fn(),
      removeTerminalDestination: jest.fn(() => false),
      scheduleIterationAsync: jest.fn(async () => false),
      executeScheduledIterationAsync: jest.fn(async () => false),
      discardScheduledIteration: jest.fn(() => false),
      setEnabledStates: jest.fn(() => false),
      invalidateOperations: jest.fn()
    };
    await session.hooks.runPhasedCommand.for('build').promise({
      actionName: 'build',
      hooks,
      sessionAbortController: graph.abortController
    });
    const parser: CommandLineParser = new CommandLineParser({
      toolFilename: 'test',
      toolDescription: 'Graph export test'
    });
    const parameter = parser.defineStringParameter({
      parameterLongName: '--drop-graph',
      argumentName: 'FILE',
      description: 'Graph output'
    });
    const dropGraphPath: string = path.join(folder, 'graph.json');
    await parser.executeAsync(mode === 'local' ? [] : ['--drop-graph', dropGraphPath]);
    const context: IOperationGraphContext = {
      buildCacheConfiguration: undefined,
      changedProjectsOnly: false,
      cobuildConfiguration: undefined,
      customParameters: new Map([['--drop-graph', parameter]]),
      includePhaseDeps: true,
      projectConfigurations: new Map(),
      isIncrementalBuildAllowed: false,
      isWatch: mode === 'watch',
      parallelism: 1,
      phaseSelection: new Set(),
      projectSelection: new Set(),
      rushConfiguration
    };
    expect(hooks.createOperationsAsync.isUsed()).toBe(false);
    if (mode === 'watch') {
      await expect(hooks.beforeExecuteGraphAsync.promise(graph, context)).rejects.toThrow(/watch mode/);
    } else if (mode === 'invalid') {
      await expect(hooks.beforeExecuteGraphAsync.promise(graph, context)).rejects.toThrow(
        /Failed to validate/
      );
    } else {
      await expect(hooks.beforeExecuteGraphAsync.promise(graph, context)).resolves.toBe(
        mode === 'export' ? true : undefined
      );
    }
    if (mode === 'local' || mode === 'watch') {
      expect(graph.createExecutionPlanAsync).not.toHaveBeenCalled();
      expect(dropGraphMock).not.toHaveBeenCalled();
    } else {
      expect(graph.createExecutionPlanAsync).toHaveBeenCalledWith({ inputsSnapshot: undefined });
      expect(dropGraphMock).toHaveBeenCalledWith({
        operations: graph.operations,
        executionRecords: new Map(),
        context,
        dropGraphPath,
        rushConfiguration,
        logger: expect.anything()
      });
    }
    expect(graph.scheduleIterationAsync).not.toHaveBeenCalled();
    expect(graph.executeScheduledIterationAsync).not.toHaveBeenCalled();
    if (mode === 'export') {
      expect(await JsonFile.loadAsync(dropGraphPath)).toEqual({
        nodes: [],
        repoSettings: {
          commonTempFolder: rushConfiguration.commonTempFolder,
          executionContractVersion: 1
        }
      });
    }
  });
});
