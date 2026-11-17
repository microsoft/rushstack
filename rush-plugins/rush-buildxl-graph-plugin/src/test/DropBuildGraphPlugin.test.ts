// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Exercise this checkout's API rather than the installed Rush version launching Jest.
jest.mock('@rushstack/rush-sdk', () => jest.requireActual('@microsoft/rush-lib'));
jest.mock('../dropGraph');

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { JsonFile, JsonSchema } from '@rushstack/node-core-library';
import {
  RushConfiguration,
  RushSession,
  PhasedCommandHooks,
  OperationGraphHooks,
  OperationStatus,
  Operation,
  type IOperationGraph,
  type IOperationGraphContext
} from '@rushstack/rush-sdk';
import { NoOpTerminalProvider } from '@rushstack/terminal';
import { CommandLineParser } from '@rushstack/ts-command-line';

import { DropBuildGraphPlugin, type IDropGraphPluginOptions } from '../DropBuildGraphPlugin';
import { dropGraphAsync } from '../dropGraph';
import type { IGraphNode } from '../GraphProcessor';

describe(DropBuildGraphPlugin.name, () => {
  let folder: string;
  let rushConfiguration: RushConfiguration;
  let schema: JsonSchema;
  let legacyNode: IGraphNode;

  beforeAll(async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), 'rush-export-plugin-'));
    const configPath: string = path.join(folder, 'rush.json');
    await JsonFile.saveAsync(
      {
        rushVersion: '5.182.0',
        pnpmVersion: '10.27.0',
        projects: [{ packageName: 'test-project', projectFolder: 'projects/test-project' }]
      },
      configPath
    );
    await JsonFile.saveAsync(
      { name: 'test-project', version: '1.0.0' },
      path.join(folder, 'projects', 'test-project', 'package.json'),
      { ensureFolderExists: true }
    );
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(configPath);
    legacyNode = {
      id: 'test-project#_phase:build',
      command: 'node build.js --legacy',
      workingDirectory: rushConfiguration.projects[0].projectFolder,
      package: 'test-project',
      task: '_phase:build',
      dependencies: []
    };
    const packageFolder: string = path.resolve(__dirname, '../..');
    const manifest: { plugins: { optionsSchema: string }[] } = JsonFile.load(
      path.join(packageFolder, 'rush-plugin-manifest.json')
    );
    schema = JsonSchema.fromFile(path.join(packageFolder, manifest.plugins[0].optionsSchema));
  });

  afterAll(async () => {
    await fs.rm(folder, { recursive: true, force: true });
  });

  function createLegacyOperation(): Operation {
    return new Operation({
      project: rushConfiguration.projects[0],
      phase: {
        name: '_phase:build',
        logFilenameIdentifier: '_phase_build',
        isSynthetic: false,
        associatedParameters: new Set(),
        dependencies: { self: new Set(), upstream: new Set() },
        allowWarningsOnSuccess: false,
        missingScriptBehavior: 'error'
      },
      logFilenameIdentifier: 'custom_build_log',
      settings: { operationName: '_phase:build', outputFolderNames: ['dist'] },
      runner: {
        name: 'build',
        isNoOp: false,
        cacheable: false,
        silent: false,
        reportTiming: false,
        warningsAreAllowed: true,
        getConfigHash: () => 'node build.js --legacy',
        executeAsync: jest.fn(async () => OperationStatus.Success)
      }
    });
  }

  it.each([undefined, 1])('accepts the configured contract version %s', (executionContractVersion) => {
    const options = {
      buildXLCommandNames: ['build'],
      ...(executionContractVersion === undefined ? {} : { executionContractVersion })
    };
    expect(() => schema.validateObject(options, 'rush-buildxl-graph-plugin.json')).not.toThrow();
  });

  it.each([0, 2, null, false, '1'])('rejects unsupported contract version %s', (executionContractVersion) => {
    const options = { buildXLCommandNames: ['build'], executionContractVersion };
    expect(() => schema.validateObject(options, 'rush-buildxl-graph-plugin.json')).toThrow();
    const runtimeOptions: IDropGraphPluginOptions = JSON.parse(JSON.stringify(options));
    expect(() => new DropBuildGraphPlugin(runtimeOptions)).toThrow(/Unsupported executionContractVersion/);
  });

  describe.each([undefined, 1] as const)('executionContractVersion=%s', (executionContractVersion) => {
    it.each(['export', 'watch', 'local', 'invalid', 'missing-plan'])(
      'handles graph export (%s)',
      async (mode) => {
        const dropGraphMock = jest.mocked(dropGraphAsync);
        dropGraphMock.mockReset().mockResolvedValue(mode !== 'invalid');
        if (mode === 'export' || (mode === 'watch' && executionContractVersion === undefined)) {
          dropGraphMock.mockImplementation(
            jest.requireActual<typeof import('../dropGraph')>('../dropGraph').dropGraphAsync
          );
        }
        const hooks: PhasedCommandHooks = new PhasedCommandHooks();
        const session: RushSession = new RushSession({
          terminalProvider: new NoOpTerminalProvider(),
          getIsDebugMode: () => false
        });
        new DropBuildGraphPlugin({ buildXLCommandNames: ['build'], executionContractVersion }).apply(
          session,
          rushConfiguration
        );
        const graph: IOperationGraph = {
          abortController: new AbortController(),
          hooks: new OperationGraphHooks(),
          operations: executionContractVersion === undefined ? new Set([createLegacyOperation()]) : new Set(),
          resultByOperation: new Map(),
          status: OperationStatus.Ready,
          parallelism: 1,
          debugMode: false,
          quietMode: true,
          allowOversubscription: false,
          pauseNextIteration: false,
          terminalDestinations: new Set(),
          hasScheduledIteration: false,
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
        if (executionContractVersion === 1 && mode !== 'missing-plan') {
          graph.createExecutionPlanAsync = jest.fn(async () => new Map());
        }
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
        if (executionContractVersion === undefined) {
          expect(hooks.beforeExecuteGraphAsync.isUsed()).toBe(false);
          expect(hooks.createOperationsAsync.isUsed()).toBe(true);
          const operations = new Set(graph.operations);
          if (mode === 'invalid') {
            await expect(hooks.createOperationsAsync.promise(operations, context)).rejects.toThrow(
              /Failed to validate/
            );
          } else {
            const result = await hooks.createOperationsAsync.promise(operations, context);
            if (mode === 'local') {
              expect(result).toBe(operations);
              expect(dropGraphMock).not.toHaveBeenCalled();
            } else {
              expect(result).toEqual(new Set());
              expect(result).not.toBe(operations);
            }
          }
          expect(graph.createExecutionPlanAsync).toBeUndefined();
          if (mode !== 'local') {
            expect(dropGraphMock).toHaveBeenCalledWith({
              operations,
              context,
              dropGraphPath,
              rushConfiguration,
              logger: expect.anything()
            });
          }
        } else {
          expect(hooks.createOperationsAsync.isUsed()).toBe(false);
          if (mode === 'watch') {
            await expect(hooks.beforeExecuteGraphAsync.promise(graph, context)).rejects.toThrow(/watch mode/);
          } else if (mode === 'missing-plan') {
            await expect(hooks.beforeExecuteGraphAsync.promise(graph, context)).rejects.toThrow(
              /requires an operation graph with external execution planning support/
            );
          } else if (mode === 'invalid') {
            await expect(hooks.beforeExecuteGraphAsync.promise(graph, context)).rejects.toThrow(
              /Failed to validate/
            );
          } else {
            await expect(hooks.beforeExecuteGraphAsync.promise(graph, context)).resolves.toBe(
              mode === 'export' ? true : undefined
            );
          }
          if (mode === 'missing-plan') {
            expect(graph.createExecutionPlanAsync).toBeUndefined();
            expect(dropGraphMock).not.toHaveBeenCalled();
          } else if (mode === 'local' || mode === 'watch') {
            expect(graph.createExecutionPlanAsync).not.toHaveBeenCalled();
            expect(dropGraphMock).not.toHaveBeenCalled();
          } else {
            expect(graph.createExecutionPlanAsync).toHaveBeenCalledWith({ inputsSnapshot: undefined });
            expect(dropGraphMock).toHaveBeenCalledWith({
              operations: graph.operations,
              executionContractVersion: 1,
              executionRecords: new Map(),
              context,
              dropGraphPath,
              rushConfiguration,
              logger: expect.anything()
            });
          }
        }
        expect(graph.scheduleIterationAsync).not.toHaveBeenCalled();
        expect(graph.executeScheduledIterationAsync).not.toHaveBeenCalled();
        for (const operation of graph.operations)
          expect(operation.runner!.executeAsync).not.toHaveBeenCalled();
        if (mode === 'export' || (mode === 'watch' && executionContractVersion === undefined)) {
          expect(await JsonFile.loadAsync(dropGraphPath)).toEqual({
            nodes: executionContractVersion === undefined ? [legacyNode] : [],
            repoSettings: {
              commonTempFolder: rushConfiguration.commonTempFolder,
              ...(executionContractVersion === 1 ? { executionContractVersion } : {})
            }
          });
        }
      }
    );

    it.each([false, true])(
      'requires new Rush hooks only for explicit adoption (export=%s)',
      async (exportRequested) => {
        const hooks: PhasedCommandHooks = new PhasedCommandHooks();
        Object.defineProperty(hooks, 'beforeExecuteGraphAsync', { value: undefined });
        const session: RushSession = new RushSession({
          terminalProvider: new NoOpTerminalProvider(),
          getIsDebugMode: () => false
        });
        new DropBuildGraphPlugin({ buildXLCommandNames: ['build'], executionContractVersion }).apply(
          session,
          rushConfiguration
        );
        const register = session.hooks.runPhasedCommand.for('build').promise({
          actionName: 'build',
          hooks,
          sessionAbortController: new AbortController()
        });
        if (executionContractVersion === 1) {
          await expect(register).rejects.toThrow(/requires Rush with external execution planning support/);
        } else {
          await expect(register).resolves.toBeUndefined();
          const parser: CommandLineParser = new CommandLineParser({
            toolFilename: 'test',
            toolDescription: 'Legacy export test'
          });
          const parameter = parser.defineStringParameter({
            parameterLongName: '--drop-graph',
            argumentName: 'FILE',
            description: 'Graph output'
          });
          await parser.executeAsync(
            exportRequested ? ['--drop-graph', path.join(folder, 'legacy.json')] : []
          );
          const context: IOperationGraphContext = {
            buildCacheConfiguration: undefined,
            changedProjectsOnly: false,
            cobuildConfiguration: undefined,
            customParameters: new Map([['--drop-graph', parameter]]),
            includePhaseDeps: true,
            projectConfigurations: new Map(),
            isIncrementalBuildAllowed: false,
            isWatch: false,
            parallelism: 1,
            phaseSelection: new Set(),
            projectSelection: new Set(),
            rushConfiguration
          };
          const dropGraphMock = jest
            .mocked(dropGraphAsync)
            .mockReset()
            .mockImplementation(
              jest.requireActual<typeof import('../dropGraph')>('../dropGraph').dropGraphAsync
            );
          const operations: Set<Operation> = new Set([createLegacyOperation()]);
          const result = await hooks.createOperationsAsync.promise(operations, context);
          expect(result).toEqual(exportRequested ? new Set() : operations);
          if (exportRequested) {
            expect(dropGraphMock).toHaveBeenCalledTimes(1);
            expect(dropGraphMock.mock.calls[0][0]).not.toHaveProperty('executionContractVersion');
            expect(dropGraphMock.mock.calls[0][0]).not.toHaveProperty('executionRecords');
            expect(await JsonFile.loadAsync(path.join(folder, 'legacy.json'))).toEqual({
              nodes: [legacyNode],
              repoSettings: { commonTempFolder: rushConfiguration.commonTempFolder }
            });
          } else {
            expect(result).toBe(operations);
            expect(dropGraphMock).not.toHaveBeenCalled();
          }
          for (const operation of operations) expect(operation.runner!.executeAsync).not.toHaveBeenCalled();
        }
      }
    );
  });
});
