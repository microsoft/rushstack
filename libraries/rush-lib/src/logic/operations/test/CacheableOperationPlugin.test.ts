// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('../../../utilities/Utilities');
jest.mock('../OperationStateFile');
jest.mock('../ProjectLogWritable', () => {
  const actual = jest.requireActual('../ProjectLogWritable');
  const { TerminalWritable } = jest.requireActual('@rushstack/terminal');
  class MockTerminalWritable extends TerminalWritable {
    protected onWriteChunk(): void {
      /* noop */
    }
    protected onClose(): void {
      /* noop */
    }
  }
  return {
    ...actual,
    initializeProjectLogFilesAsync: jest.fn(async () => new MockTerminalWritable())
  };
});
jest.mock('../OperationMetadataManager', () => {
  class MockOperationMetadataManager {
    public readonly logFilenameIdentifier: string;
    public readonly metadataFolderPath: string = '.rush/temp/operation/mock';
    public readonly stateFile: { state: undefined } = { state: undefined };
    public constructor({ operation }: { operation: { logFilenameIdentifier: string } }) {
      this.logFilenameIdentifier = operation.logFilenameIdentifier;
    }
    public async saveAsync(): Promise<void> {
      /* noop */
    }
    public async tryRestoreAsync(): Promise<void> {
      /* noop */
    }
  }
  return { OperationMetadataManager: MockOperationMetadataManager };
});
jest.mock('../../buildCache/OperationBuildCache', () => ({
  OperationBuildCache: { forOperation: jest.fn() }
}));

import { MockWritable, StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import type { BuildCacheConfiguration } from '../../../api/BuildCacheConfiguration';
import type { RushProjectConfiguration } from '../../../api/RushProjectConfiguration';
import { PhasedCommandHooks, type IOperationGraphContext } from '../../../pluginFramework/PhasedCommandHooks';
import type { IInputsSnapshot } from '../../incremental/InputsSnapshot';
import { OperationBuildCache } from '../../buildCache/OperationBuildCache';
import { CacheableOperationPlugin } from '../CacheableOperationPlugin';
import { PhasedOperationPlugin } from '../PhasedOperationPlugin';
import { OperationGraph } from '../OperationGraph';
import { Operation } from '../Operation';
import { OperationStatus } from '../OperationStatus';
import type { IOperationRunner, IOperationRunnerContext } from '../IOperationRunner';
import type { IExecutionResult } from '../IOperationExecutionResult';
import type { OperationExecutionRecord } from '../OperationExecutionRecord';

const mockPhase: IPhase = {
  name: 'phase',
  allowWarningsOnSuccess: false,
  associatedParameters: new Set(),
  dependencies: { self: new Set(), upstream: new Set() },
  isSynthetic: false,
  logFilenameIdentifier: 'phase',
  missingScriptBehavior: 'silent'
};

class CacheableMockRunner implements IOperationRunner {
  public readonly reportTiming: boolean = true;
  public readonly silent: boolean = false;
  public readonly cacheable: boolean = true;
  public readonly warningsAreAllowed: boolean = false;
  public readonly isNoOp: boolean = false;

  public constructor(
    public readonly name: string,
    private readonly _executions: string[]
  ) {}

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    this._executions.push(this.name);
    return OperationStatus.Success;
  }

  public getConfigHash(): string {
    return 'config';
  }
}

interface ITestGraph {
  graph: OperationGraph;
  operations: Map<string, Operation>;
  localHashes: Map<string, string>;
  executions: string[];
  cacheWrites: string[];
  executeAsync(): Promise<IExecutionResult>;
}

/**
 * Creates a linear chain of cacheable operations: names[0] <- names[1] <- ... (each depends on the previous).
 */
async function createTestGraphAsync(names: string[]): Promise<ITestGraph> {
  const executions: string[] = [];
  const cacheWrites: string[] = [];
  const localHashes: Map<string, string> = new Map();
  const operations: Map<string, Operation> = new Map();
  const projectConfigurations: Map<RushConfigurationProject, RushProjectConfiguration> = new Map();

  let previous: Operation | undefined;
  for (const name of names) {
    const project: RushConfigurationProject = {
      packageName: name,
      projectFolder: `/repo/${name}`
    } as unknown as RushConfigurationProject;
    projectConfigurations.set(project, {
      getCacheDisabledReason: () => undefined
    } as unknown as RushProjectConfiguration);
    const operation: Operation = new Operation({
      runner: new CacheableMockRunner(name, executions),
      logFilenameIdentifier: name,
      phase: mockPhase,
      project
    });
    if (previous) {
      operation.addDependency(previous);
    }
    previous = operation;
    operations.set(name, operation);
    localHashes.set(name, `${name}-v1`);
  }

  jest.mocked(OperationBuildCache.forOperation).mockImplementation(
    (record) =>
      ({
        tryRestoreFromCacheAsync: async () => false,
        trySetCacheEntryAsync: async () => {
          cacheWrites.push(record.name);
          return true;
        }
      }) as unknown as OperationBuildCache
  );

  const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());
  const hooks: PhasedCommandHooks = new PhasedCommandHooks();
  new PhasedOperationPlugin().apply(hooks);
  new CacheableOperationPlugin({
    allowWarningsInSuccessfulBuild: false,
    buildCacheConfiguration: {
      buildCacheEnabled: true,
      cacheWriteEnabled: true
    } as unknown as BuildCacheConfiguration,
    cobuildConfiguration: undefined,
    terminal,
    excludeAppleDoubleFiles: false,
    useDirectFileTransfersForBuildCache: false
  }).apply(hooks);

  const graph: OperationGraph = new OperationGraph(new Set(operations.values()), {
    quietMode: true,
    debugMode: false,
    parallelism: 1,
    allowOversubscription: true,
    destinations: [new MockWritable()],
    abortController: new AbortController()
  });
  await hooks.onGraphCreatedAsync.promise(graph, {
    isIncrementalBuildAllowed: true,
    projectConfigurations
  } as unknown as IOperationGraphContext);

  const inputsSnapshot: IInputsSnapshot = {
    hashes: new Map(),
    rootDirectory: '/repo',
    hasUncommittedChanges: false,
    getTrackedFileHashesForOperation: () => new Map(),
    getOperationOwnStateHash: (project: RushConfigurationProject) => localHashes.get(project.packageName)!
  };

  return {
    graph,
    operations,
    localHashes,
    executions,
    cacheWrites,
    executeAsync: async () => {
      executions.length = 0;
      cacheWrites.length = 0;
      return await graph.executeAsync({ inputsSnapshot });
    }
  };
}

function getStatus(testGraph: ITestGraph, result: IExecutionResult, name: string): OperationStatus {
  return (result.operationResults.get(testGraph.operations.get(name)!) as OperationExecutionRecord).status;
}

describe(CacheableOperationPlugin.name, () => {
  it('writes cache entries for all operations in a cold iteration', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b']);

    const result: IExecutionResult = await testGraph.executeAsync();

    expect(result.status).toBe(OperationStatus.Success);
    expect(testGraph.executions).toEqual(['a', 'b']);
    expect(testGraph.cacheWrites).toEqual(['a', 'b']);
  });

  it('writes a cache entry for an operation whose dependencies were retained from a previous iteration', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b', 'c']);
    await testGraph.executeAsync();

    testGraph.localHashes.set('c', 'c-v2');
    const result: IExecutionResult = await testGraph.executeAsync();

    expect(result.status).toBe(OperationStatus.Success);
    expect(getStatus(testGraph, result, 'a')).toBe(OperationStatus.Skipped);
    expect(getStatus(testGraph, result, 'b')).toBe(OperationStatus.Skipped);
    expect(testGraph.executions).toEqual(['c']);
    expect(testGraph.cacheWrites).toEqual(['c']);
  });

  it('keeps allowing cache writes across several warm iterations', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b', 'c']);
    await testGraph.executeAsync();

    testGraph.localHashes.set('b', 'b-v2');
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b', 'c']);
    expect(testGraph.cacheWrites).toEqual(['b', 'c']);

    testGraph.localHashes.set('c', 'c-v2');
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['c']);
    expect(testGraph.cacheWrites).toEqual(['c']);
  });

  it('does not write a cache entry when a dependency was skipped by the user (e.g. --only)', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b']);
    await testGraph.executeAsync();

    testGraph.operations.get('a')!.enabled = false;
    testGraph.localHashes.set('b', 'b-v2');
    const result: IExecutionResult = await testGraph.executeAsync();

    expect(getStatus(testGraph, result, 'a')).toBe(OperationStatus.Skipped);
    expect(testGraph.executions).toEqual(['b']);
    expect(testGraph.cacheWrites).toEqual([]);
  });

  it('does not write a cache entry when a dependency was never executed (cold --only)', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b']);
    testGraph.operations.get('a')!.enabled = false;

    await testGraph.executeAsync();

    expect(testGraph.executions).toEqual(['b']);
    expect(testGraph.cacheWrites).toEqual([]);
  });

  it('does not trust a retained result that was produced while one of its dependencies was skipped', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b', 'c']);
    const a: Operation = testGraph.operations.get('a')!;

    // Iteration 1: "a" is skipped by the user, so "b" and "c" execute without writing cache entries.
    a.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b', 'c']);
    expect(testGraph.cacheWrites).toEqual([]);

    // Iteration 2: "a" executes for the first time, "b" is retained (same state hash), "c" changed.
    a.enabled = true;
    testGraph.localHashes.set('c', 'c-v2');
    const result: IExecutionResult = await testGraph.executeAsync();

    expect(getStatus(testGraph, result, 'b')).toBe(OperationStatus.Skipped);
    expect(testGraph.executions).toEqual(['a', 'c']);
    // "b" was built against an unknown "a", so "c" must not write to the cache.
    expect(testGraph.cacheWrites).toEqual(['a']);
  });

  it('does not trust results whose state hash changed without re-execution', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b', 'c']);
    await testGraph.executeAsync();

    // "b" ignores dependency changes, so it is not re-run when "a" changes, but its state hash changes.
    testGraph.operations.get('b')!.enabled = 'ignore-dependency-changes';
    testGraph.localHashes.set('a', 'a-v2');
    testGraph.localHashes.set('c', 'c-v2');
    const result: IExecutionResult = await testGraph.executeAsync();

    expect(getStatus(testGraph, result, 'b')).toBe(OperationStatus.Skipped);
    expect(testGraph.executions).toEqual(['a', 'c']);
    expect(testGraph.cacheWrites).toEqual(['a']);
  });
});
