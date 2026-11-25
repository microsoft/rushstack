// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('@rushstack/rush-sdk', () => ({
  _OperationBuildCache: { forOperation: jest.fn() },
  OperationStatus: { FromCache: 'FROM CACHE', Success: 'SUCCESS' }
}));

import {
  _OperationBuildCache as OperationBuildCache,
  OperationStatus,
  type IOperationExecutionResult,
  type IOperationSettings,
  type Operation,
  type RushConfigurationProject,
  type RushProjectConfiguration,
  type RushSession
} from '@rushstack/rush-sdk';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import { CommandLineParameterKind } from '@rushstack/ts-command-line';

import { BridgeCachePlugin } from '../BridgeCachePlugin';

type BeforeExecuteIteration = (
  records: ReadonlyMap<Operation, IOperationExecutionResult>,
  iterationOptions: object
) => Promise<OperationStatus | undefined>;

interface ICacheEntryMock {
  cacheId: string;
  tryRestoreFromCacheAsync: jest.Mock;
  trySetCacheEntryAsync: jest.Mock;
}

const ACTION_PARAMETER_NAME: string = '--bridge-cache-action';

function createOperation(name: string, enabled: Operation['enabled'], isNoOp: boolean = false): Operation {
  return { name, enabled, isNoOp, settings: undefined } as unknown as Operation;
}

function createRecords(operations: Operation[]): ReadonlyMap<Operation, IOperationExecutionResult> {
  return new Map(
    operations.map((operation: Operation) => [
      operation,
      { operation } as unknown as IOperationExecutionResult
    ])
  );
}

async function applyPluginAsync(
  cacheAction: 'read' | 'write',
  terminal: Terminal,
  operations: ReadonlySet<Operation> = new Set(),
  projectConfigurations: ReadonlyMap<RushConfigurationProject, RushProjectConfiguration> = new Map()
): Promise<BeforeExecuteIteration> {
  const pendingTaps: Promise<void>[] = [];
  let beforeExecuteIteration: BeforeExecuteIteration | undefined;
  const graph: object = {
    operations,
    parallelism: 1,
    hooks: {
      beforeExecuteIterationAsync: {
        tapPromise: (name: string, fn: BeforeExecuteIteration) => (beforeExecuteIteration = fn)
      }
    }
  };
  const context: object = {
    projectConfigurations,
    customParameters: new Map([
      [
        ACTION_PARAMETER_NAME,
        {
          kind: CommandLineParameterKind.Choice,
          alternatives: new Set(['read', 'write']),
          value: cacheAction
        }
      ]
    ]),
    buildCacheConfiguration: { buildCacheEnabled: true },
    rushConfiguration: { experimentsConfiguration: { configuration: {} } }
  };
  const command: object = {
    hooks: {
      onGraphCreatedAsync: {
        tap: (name: string, fn: (g: object, c: object) => Promise<void>) =>
          pendingTaps.push(fn(graph, context))
      }
    }
  };
  const session: object = {
    getLogger: () => ({ terminal }),
    hooks: {
      runAnyPhasedCommand: {
        tapPromise: (name: string, fn: (c: object) => Promise<void>) => pendingTaps.push(fn(command))
      }
    }
  };

  new BridgeCachePlugin({
    actionParameterName: ACTION_PARAMETER_NAME,
    requireOutputFoldersParameterName: undefined
  }).apply(session as RushSession);
  await Promise.all(pendingTaps);

  if (!beforeExecuteIteration) {
    throw new Error('The plugin did not tap beforeExecuteIterationAsync.');
  }
  return beforeExecuteIteration;
}

describe(BridgeCachePlugin.name, () => {
  // A graph can hold operations outside the command's selection, such as the dependencies of a project
  // selected with `--only`, or every project's operations in a Rush daemon engine. Those are disabled.
  const selected: Operation = createOperation('selected (build)', true);
  const selectedChangedOnly: Operation = createOperation(
    'selected-changed-only (build)',
    'ignore-dependency-changes'
  );
  const unselected: Operation = createOperation('unselected-dependency (build)', false);
  const noOp: Operation = createOperation('selected-no-op (build)', true, true);

  let terminalProvider: StringBufferTerminalProvider;
  let terminal: Terminal;
  let cacheEntryByOperationName: Map<string, ICacheEntryMock>;

  beforeEach(() => {
    terminalProvider = new StringBufferTerminalProvider();
    terminal = new Terminal(terminalProvider);
    cacheEntryByOperationName = new Map();
    jest
      .mocked(OperationBuildCache.forOperation)
      .mockImplementation((record: { operation: Operation }): OperationBuildCache => {
        const entry: ICacheEntryMock = {
          cacheId: `cache-id-${record.operation.name}`,
          tryRestoreFromCacheAsync: jest.fn().mockResolvedValue(true),
          trySetCacheEntryAsync: jest.fn().mockResolvedValue(true)
        };
        cacheEntryByOperationName.set(record.operation.name, entry);
        return entry as unknown as OperationBuildCache;
      });
  });

  afterEach(() => {
    jest.mocked(OperationBuildCache.forOperation).mockReset();
  });

  it('restores only the operations in the selection', async () => {
    const beforeExecuteIteration: BeforeExecuteIteration = await applyPluginAsync('read', terminal);

    const status: OperationStatus | undefined = await beforeExecuteIteration(
      createRecords([selected, selectedChangedOnly, unselected, noOp]),
      {}
    );

    expect(status).toBe(OperationStatus.FromCache);
    expect([...cacheEntryByOperationName.keys()].sort()).toEqual([
      'selected (build)',
      'selected-changed-only (build)'
    ]);
    for (const entry of cacheEntryByOperationName.values()) {
      expect(entry.tryRestoreFromCacheAsync).toHaveBeenCalledTimes(1);
      expect(entry.trySetCacheEntryAsync).not.toHaveBeenCalled();
    }
    expect(terminalProvider.getOutput()).toContain(
      'Cache operation "read" completed successfully for 2 out of 2 operations.'
    );
  });

  it('writes only the operations in the selection', async () => {
    const beforeExecuteIteration: BeforeExecuteIteration = await applyPluginAsync('write', terminal);

    const status: OperationStatus | undefined = await beforeExecuteIteration(
      createRecords([selected, selectedChangedOnly, unselected, noOp]),
      {}
    );

    expect(status).toBe(OperationStatus.Success);
    expect([...cacheEntryByOperationName.keys()].sort()).toEqual([
      'selected (build)',
      'selected-changed-only (build)'
    ]);
    for (const entry of cacheEntryByOperationName.values()) {
      expect(entry.trySetCacheEntryAsync).toHaveBeenCalledTimes(1);
      expect(entry.tryRestoreFromCacheAsync).not.toHaveBeenCalled();
    }
    expect(terminalProvider.getOutput()).toContain(
      'Cache operation "write" completed successfully for 2 out of 2 operations.'
    );
  });

  it('restores a selected operation whose record is disabled because it is up to date', async () => {
    // In a long-lived graph, such as a Rush daemon engine, a selected operation whose inputs did not change
    // since its last successful iteration gets a disabled record. A read still covers the whole selection,
    // as it does in a fresh native run, so the plugin checks the operation's enabled state, not the record's.
    const beforeExecuteIteration: BeforeExecuteIteration = await applyPluginAsync('read', terminal);
    const records: ReadonlyMap<Operation, IOperationExecutionResult> = new Map([
      [selected, { operation: selected, enabled: false } as unknown as IOperationExecutionResult],
      [unselected, { operation: unselected, enabled: false } as unknown as IOperationExecutionResult]
    ]);

    const status: OperationStatus | undefined = await beforeExecuteIteration(records, {});

    expect(status).toBe(OperationStatus.FromCache);
    expect([...cacheEntryByOperationName.keys()]).toEqual(['selected (build)']);
    for (const entry of cacheEntryByOperationName.values()) {
      expect(entry.tryRestoreFromCacheAsync).toHaveBeenCalledTimes(1);
    }
    expect(terminalProvider.getOutput()).toContain(
      'Cache operation "read" completed successfully for 1 out of 1 operations.'
    );
  });

  it('continues normal execution when no selected operation has work', async () => {
    const beforeExecuteIteration: BeforeExecuteIteration = await applyPluginAsync('read', terminal);

    const status: OperationStatus | undefined = await beforeExecuteIteration(
      createRecords([unselected, noOp]),
      {}
    );

    expect(status).toBeUndefined();
    expect(OperationBuildCache.forOperation).not.toHaveBeenCalled();
  });

  it.each(['read', 'write'] as const)(
    'collects graph reservations once per read iteration and never for writes (%s)',
    async (cacheAction) => {
      const project: RushConfigurationProject = {
        packageName: 'selected'
      } as RushConfigurationProject;
      const configuredSettings: IOperationSettings = {
        operationName: '_phase:unselected',
        disableBuildCacheForOperation: true,
        outputFolderNames: ['.rush/temp/build-cache-restore-0/nested'],
        sharding: { count: 2 }
      };
      const graphSettings: IOperationSettings = {
        operationName: '_phase:disabled',
        outputFolderNames: ['.rush/temp/build-cache-restore-1/nested']
      };
      const operations: Set<Operation> = new Set();
      const selectedOperations: Operation[] = [];
      for (let index: number = 0; index < 8; index++) {
        const operation: Operation = Object.assign(createOperation(`selected-${index}`, true), {
          associatedProject: project
        });
        selectedOperations.push(operation);
        operations.add(operation);
      }
      operations.add(
        Object.assign(createOperation('disabled', false), {
          associatedProject: project,
          settings: graphSettings
        })
      );
      const configurations: ReadonlyMap<RushConfigurationProject, RushProjectConfiguration> = new Map([
        [
          project,
          {
            operationSettingsByOperationName: new Map([
              [configuredSettings.operationName, configuredSettings]
            ])
          } as unknown as RushProjectConfiguration
        ]
      ]);
      const iterator: jest.SpyInstance = jest.spyOn(operations, Symbol.iterator);
      const beforeExecuteIteration: BeforeExecuteIteration = await applyPluginAsync(
        cacheAction,
        terminal,
        operations,
        configurations
      );
      const records: ReadonlyMap<Operation, IOperationExecutionResult> = createRecords(selectedOperations);

      await beforeExecuteIteration(records, {});

      expect(iterator).toHaveBeenCalledTimes(cacheAction === 'read' ? 1 : 0);
      const calls = jest.mocked(OperationBuildCache.forOperation).mock.calls;
      expect(calls).toHaveLength(selectedOperations.length);
      const reservations = calls[0][1].projectOperationSettings;
      expect(reservations).toEqual(cacheAction === 'read' ? [configuredSettings, graphSettings] : undefined);
      for (const [, options] of calls) {
        expect(options.projectOperationSettings).toBe(reservations);
      }

      const laterSettings: IOperationSettings = {
        operationName: '_phase:later',
        outputFolderNames: ['.rush/temp/build-cache-restore-2/nested']
      };
      operations.add(
        Object.assign(createOperation('later', false), {
          associatedProject: project,
          settings: laterSettings
        })
      );
      jest.mocked(OperationBuildCache.forOperation).mockClear();

      await beforeExecuteIteration(records, {});

      expect(iterator).toHaveBeenCalledTimes(cacheAction === 'read' ? 2 : 0);
      expect(jest.mocked(OperationBuildCache.forOperation).mock.calls[0][1].projectOperationSettings).toEqual(
        cacheAction === 'read' ? [configuredSettings, graphSettings, laterSettings] : undefined
      );
      iterator.mockRestore();
    }
  );
});
