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
    public tryRestoreStopwatch<T>(originalStopwatch: T): T {
      return originalStopwatch;
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
import type { IExecutionResult, IOperationExecutionResult } from '../IOperationExecutionResult';
import type { OperationExecutionRecord } from '../OperationExecutionRecord';
import { setCommandExecution } from '../IncrementalExecutionState';
import { NullOperationRunner } from '../NullOperationRunner';

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
  public cacheable: boolean = true;
  public readonly warningsAreAllowed: boolean = false;
  public readonly isNoOp: boolean = false;
  public readonly name: string;
  readonly #executions: string[];
  readonly #incrementalNames: ReadonlySet<string>;

  public constructor(name: string, executions: string[], incrementalNames: ReadonlySet<string>) {
    this.name = name;
    this.#executions = executions;
    this.#incrementalNames = incrementalNames;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    if (this.#incrementalNames.has(this.name)) {
      // Like a ShellOperationRunner whose incremental execution guard allowed its incremental command
      setCommandExecution(context, { kind: 'incremental', hasIncrementalCommand: true });
      this.#executions.push(`${this.name}:incremental`);
    } else {
      this.#executions.push(this.name);
    }
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
  cacheRestores: string[];
  /**
   * The operations that the emulated change detection plugin checked, if enabled by `upToDate`.
   */
  checks: string[];
  /**
   * The names of the operations whose runner executes its incremental command
   */
  incrementalNames: Set<string>;
  executeAsync(): Promise<IExecutionResult>;
}

interface ITestGraphOptions {
  /**
   * The names of the operations that have no script, like a phase whose script is missing
   */
  noOpNames?: ReadonlySet<string>;
  /**
   * The names of the dependencies of each operation. By default, each operation depends on the previous one.
   */
  dependencies?: Record<string, string[]>;
  cacheWriteEnabled?: boolean;
  /**
   * If set, emulates a plugin with its own change detection (e.g. by tracing the files that each operation reads),
   * which reports a selected operation as skipped if its name is in this set, because its outputs are up to date.
   */
  upToDate?: ReadonlySet<string>;
}

/**
 * Creates a graph of cacheable operations. By default it is a linear chain: names[0] <- names[1] <- ...
 * The mock build cache stores an entry per operation and state hash, and restores it if it exists.
 */
async function createTestGraphAsync(names: string[], options: ITestGraphOptions = {}): Promise<ITestGraph> {
  const { dependencies, cacheWriteEnabled = true, upToDate } = options;
  const executions: string[] = [];
  const checks: string[] = [];
  const cacheWrites: string[] = [];
  const cacheRestores: string[] = [];
  const incrementalNames: Set<string> = new Set();
  const cacheEntries: Set<string> = new Set();
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
      runner: options.noOpNames?.has(name)
        ? new NullOperationRunner({ name, result: OperationStatus.NoOp, silent: true })
        : new CacheableMockRunner(name, executions, incrementalNames),
      logFilenameIdentifier: name,
      phase: mockPhase,
      project
    });
    if (previous && !dependencies) {
      operation.addDependency(previous);
    }
    previous = operation;
    operations.set(name, operation);
    localHashes.set(name, `${name}-v1`);
  }
  for (const [name, dependencyNames] of Object.entries(dependencies ?? {})) {
    for (const dependencyName of dependencyNames) {
      operations.get(name)!.addDependency(operations.get(dependencyName)!);
    }
  }

  jest.mocked(OperationBuildCache.forOperation).mockImplementation((record) => {
    const name: string = record.operation.associatedProject.packageName;
    const getCacheKey = (): string => `${name}@${record.getStateHash()}`;
    return {
      tryRestoreFromCacheAsync: async () => {
        const restored: boolean = cacheEntries.has(getCacheKey());
        if (restored) {
          cacheRestores.push(name);
        }
        return restored;
      },
      trySetCacheEntryAsync: async () => {
        cacheWrites.push(name);
        cacheEntries.add(getCacheKey());
        return true;
      }
    } as unknown as OperationBuildCache;
  });

  const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());
  const hooks: PhasedCommandHooks = new PhasedCommandHooks();
  new PhasedOperationPlugin().apply(hooks);
  new CacheableOperationPlugin({
    allowWarningsInSuccessfulBuild: false,
    buildCacheConfiguration: {
      buildCacheEnabled: true,
      cacheWriteEnabled
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
  if (upToDate) {
    graph.hooks.beforeExecuteIterationAsync.tap('TestChangeDetectionPlugin', (records) => {
      for (const operation of records.keys()) {
        (operation.runner as CacheableMockRunner).cacheable = true;
      }
    });
    graph.hooks.beforeExecuteOperationAsync.tapPromise(
      // Before the build cache is read
      { name: 'TestChangeDetectionPlugin', stage: -200 },
      async (
        record: IOperationRunnerContext & IOperationExecutionResult
      ): Promise<OperationStatus | undefined> => {
        if (record.silent) {
          return;
        }
        const { name } = record.operation;
        checks.push(name);
        if (!upToDate.has(name)) {
          return;
        }
        // The build cache does not handle operations that another plugin skipped.
        (record.operation.runner as CacheableMockRunner).cacheable = false;
        return OperationStatus.Skipped;
      }
    );
  }

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
    cacheRestores,
    checks,
    incrementalNames,
    executeAsync: async () => {
      executions.length = 0;
      cacheWrites.length = 0;
      cacheRestores.length = 0;
      checks.length = 0;
      return await graph.executeAsync({ inputsSnapshot });
    }
  };
}

function getStatus(testGraph: ITestGraph, result: IExecutionResult, name: string): OperationStatus {
  return (result.operationResults.get(testGraph.operations.get(name)!) as OperationExecutionRecord).status;
}

// How results retained by earlier iterations of a long-lived graph (e.g. the Rush daemon) are trusted.
describe(`${CacheableOperationPlugin.name} retained results`, () => {
  it('resumes cache writes for consumers after an --only request', async () => {
    // "lib" <- "tool" <- "app", like @rushstack/node-core-library <- @rushstack/ts-command-line <- @rushstack/heft
    const testGraph: ITestGraph = await createTestGraphAsync(['lib', 'tool', 'app']);
    const lib: Operation = testGraph.operations.get('lib')!;
    const app: Operation = testGraph.operations.get('app')!;
    await testGraph.executeAsync();

    // S1: edit "app", then --to app
    testGraph.localHashes.set('app', 'app-v2');
    await testGraph.executeAsync();
    expect(testGraph.cacheWrites).toEqual(['app']);

    // S2: edit "tool", then --only tool
    testGraph.localHashes.set('tool', 'tool-v2');
    lib.enabled = false;
    app.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['tool']);
    expect(testGraph.cacheWrites).toEqual(['tool']);

    // S3: --to app
    lib.enabled = true;
    app.enabled = true;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['app']);
    expect(testGraph.cacheWrites).toEqual(['app']);

    // S4: edit "app", then --to app
    testGraph.localHashes.set('app', 'app-v3');
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['app']);
    expect(testGraph.cacheWrites).toEqual(['app']);
  });

  it('keeps trusting operations that a request did not select', async () => {
    // "a" <- "b" <- "c", and "a" <- "tool"
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b', 'c', 'tool'], {
      dependencies: { b: ['a'], c: ['b'], tool: ['a'] }
    });
    const { operations } = testGraph;
    await testGraph.executeAsync();

    for (let round: number = 2; round <= 3; round++) {
      // --to tool
      testGraph.localHashes.set('tool', `tool-v${round}`);
      operations.get('b')!.enabled = false;
      operations.get('c')!.enabled = false;
      operations.get('tool')!.enabled = true;
      await testGraph.executeAsync();
      expect(testGraph.executions).toEqual(['tool']);
      expect(testGraph.cacheWrites).toEqual(['tool']);

      // --to c
      testGraph.localHashes.set('c', `c-v${round}`);
      operations.get('b')!.enabled = true;
      operations.get('c')!.enabled = true;
      operations.get('tool')!.enabled = false;
      await testGraph.executeAsync();
      expect(testGraph.executions).toEqual(['c']);
      expect(testGraph.cacheWrites).toEqual(['c']);
    }
  });

  it('re-executes a retained result that was built against a dependency that has since been rebuilt', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b']);
    const a: Operation = testGraph.operations.get('a')!;
    await testGraph.executeAsync();

    // --only b, after editing both: "b" is built against the outputs of the previous "a".
    testGraph.localHashes.set('a', 'a-v2');
    testGraph.localHashes.set('b', 'b-v2');
    a.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b']);
    expect(testGraph.cacheWrites).toEqual([]);

    // --to b: "b" has the same state hash as its retained result, but "a" is rebuilt.
    a.enabled = true;
    const result: IExecutionResult = await testGraph.executeAsync();
    expect(getStatus(testGraph, result, 'b')).toBe(OperationStatus.Success);
    expect(testGraph.executions).toEqual(['a', 'b']);
    expect(testGraph.cacheWrites).toEqual(['a', 'b']);

    const hotResult: IExecutionResult = await testGraph.executeAsync();
    expect(hotResult.status).toBe(OperationStatus.NoOp);
    expect(testGraph.executions).toEqual([]);
  });

  it('does not re-execute an untrusted retained result while a dependency that was not selected is untrusted', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b']);
    testGraph.operations.get('a')!.enabled = false;

    // Cold --only b: "a" has never executed in this graph.
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b']);
    expect(testGraph.cacheWrites).toEqual([]);

    // Repeating the request cannot produce a trusted result for "b", so it is skipped.
    const result: IExecutionResult = await testGraph.executeAsync();
    expect(result.status).toBe(OperationStatus.NoOp);
    expect(testGraph.executions).toEqual([]);
    expect(testGraph.cacheWrites).toEqual([]);
  });

  it('restores an untrusted retained result from the build cache when an entry exists', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b']);
    const a: Operation = testGraph.operations.get('a')!;
    await testGraph.executeAsync();

    // --only b, after editing "a": "b" is built against the outputs of the previous "a".
    testGraph.localHashes.set('a', 'a-v2');
    a.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b']);
    expect(testGraph.cacheWrites).toEqual([]);

    // Revert "a", then --to b: both have entries from the first iteration.
    testGraph.localHashes.set('a', 'a-v1');
    a.enabled = true;
    const result: IExecutionResult = await testGraph.executeAsync();
    expect(getStatus(testGraph, result, 'a')).toBe(OperationStatus.FromCache);
    expect(getStatus(testGraph, result, 'b')).toBe(OperationStatus.FromCache);
    expect(testGraph.executions).toEqual([]);
    expect(testGraph.cacheRestores).toEqual(['a', 'b']);

    // Both are trusted again.
    testGraph.localHashes.set('b', 'b-v2');
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b']);
    expect(testGraph.cacheWrites).toEqual(['b']);
  });

  it('does not re-execute untrusted retained results when cache writes are disabled', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b'], { cacheWriteEnabled: false });
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['a', 'b']);

    testGraph.localHashes.set('b', 'b-v2');
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b']);
    expect(testGraph.cacheWrites).toEqual([]);
  });

  it('re-executes a retained result that was built against a dependency that has since been rebuilt when cache writes are disabled', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b'], { cacheWriteEnabled: false });
    const a: Operation = testGraph.operations.get('a')!;
    await testGraph.executeAsync();

    // --only b, after editing both
    testGraph.localHashes.set('a', 'a-v2');
    testGraph.localHashes.set('b', 'b-v2');
    a.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b']);

    // --to b
    a.enabled = true;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['a', 'b']);
    expect(testGraph.cacheWrites).toEqual([]);

    const hotResult: IExecutionResult = await testGraph.executeAsync();
    expect(hotResult.status).toBe(OperationStatus.NoOp);
    expect(testGraph.executions).toEqual([]);
  });

  it('does not check results that a plugin found up to date again while their state hashes are unchanged', async () => {
    const upToDate: Set<string> = new Set(['lib', 'tool', 'app']);
    const testGraph: ITestGraph = await createTestGraphAsync(['lib', 'tool', 'app'], { upToDate });

    // The outputs were built before this graph was created.
    await testGraph.executeAsync();
    expect(testGraph.checks).toEqual(['lib', 'tool', 'app']);
    expect(testGraph.executions).toEqual([]);

    // Checking a skipped result again cannot make it trusted, so it is not re-enabled.
    const hotResult: IExecutionResult = await testGraph.executeAsync();
    expect(hotResult.status).toBe(OperationStatus.NoOp);
    expect(testGraph.checks).toEqual([]);

    // Edit "app": its dependencies are not trusted, so its cache entry is not written.
    testGraph.localHashes.set('app', 'app-v2');
    upToDate.delete('app');
    await testGraph.executeAsync();
    expect(testGraph.checks).toEqual(['app']);
    expect(testGraph.executions).toEqual(['app']);
    expect(testGraph.cacheWrites).toEqual([]);

    const secondHotResult: IExecutionResult = await testGraph.executeAsync();
    expect(secondHotResult.status).toBe(OperationStatus.NoOp);
    expect(testGraph.checks).toEqual([]);
    expect(testGraph.executions).toEqual([]);
  });

  it('trusts an incremental result, but writes neither it nor the results built against it to the build cache', async () => {
    // "a" <- "b" <- "c"
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b', 'c']);
    await testGraph.executeAsync();
    expect(testGraph.cacheWrites).toEqual(['a', 'b', 'c']);

    // Edit "a", which runs its incremental command.
    testGraph.localHashes.set('a', 'a-v2');
    testGraph.incrementalNames.add('a');
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['a:incremental', 'b', 'c']);
    expect(testGraph.cacheWrites).toEqual([]);

    // Nothing changed, so nothing runs again.
    const hotResult: IExecutionResult = await testGraph.executeAsync();
    expect(hotResult.status).toBe(OperationStatus.NoOp);
    expect(testGraph.executions).toEqual([]);

    // Edit "c": it is built against the retained outputs of "b", which were built against the incremental result.
    testGraph.localHashes.set('c', 'c-v2');
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['c']);
    expect(testGraph.cacheWrites).toEqual([]);

    const secondHotResult: IExecutionResult = await testGraph.executeAsync();
    expect(secondHotResult.status).toBe(OperationStatus.NoOp);
    expect(testGraph.executions).toEqual([]);

    // Edit "a", which runs its initial command: every result can be written again.
    testGraph.localHashes.set('a', 'a-v3');
    testGraph.incrementalNames.delete('a');
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['a', 'b', 'c']);
    expect(testGraph.cacheWrites).toEqual(['a', 'b', 'c']);
  });

  it('does not write results built against an incremental result that the request did not select', async () => {
    // "a" <- "b" <- "c"
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b', 'c']);
    const { operations } = testGraph;
    await testGraph.executeAsync();

    testGraph.localHashes.set('a', 'a-v2');
    testGraph.incrementalNames.add('a');
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['a:incremental', 'b', 'c']);
    expect(testGraph.cacheWrites).toEqual([]);

    // --only b: "b" is built against the retained incremental result of "a".
    testGraph.localHashes.set('b', 'b-v2');
    operations.get('a')!.enabled = false;
    operations.get('c')!.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b']);
    expect(testGraph.cacheWrites).toEqual([]);

    // --only c: "c" is built against "b", which was built against the incremental result of "a".
    testGraph.localHashes.set('c', 'c-v2');
    operations.get('b')!.enabled = false;
    operations.get('c')!.enabled = true;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['c']);
    expect(testGraph.cacheWrites).toEqual([]);
  });

  it('does not write results built against an incremental result through an operation without a script', async () => {
    // "a" <- "b-lite" <- "b", like the phases of the rushstack repo: the build of a project depends only on a phase of
    // its own project that has no script and depends on the builds of upstream projects.
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b-lite', 'b'], {
      noOpNames: new Set(['b-lite'])
    });
    await testGraph.executeAsync();
    expect(testGraph.cacheWrites).toEqual(['a', 'b']);

    testGraph.localHashes.set('a', 'a-v2');
    testGraph.incrementalNames.add('a');
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['a:incremental', 'b']);
    expect(testGraph.cacheWrites).toEqual([]);

    // --only b: "b" is built against the retained incremental result of "a", through the retained "b-lite".
    testGraph.localHashes.set('b', 'b-v2');
    testGraph.operations.get('a')!.enabled = false;
    testGraph.operations.get('b-lite')!.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b']);
    expect(testGraph.cacheWrites).toEqual([]);
  });

  it('restores a consumer of an incremental result from the build cache and trusts it as a cacheable result', async () => {
    // "a" <- "b" <- "c"
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b', 'c']);
    await testGraph.executeAsync();

    // Edit "a", which runs its incremental command, and "c".
    testGraph.localHashes.set('a', 'a-v2');
    testGraph.localHashes.set('c', 'c-v2');
    testGraph.incrementalNames.add('a');
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['a:incremental', 'b', 'c']);
    expect(testGraph.cacheWrites).toEqual([]);

    // Revert both: every operation has an entry from the first iteration.
    testGraph.localHashes.set('a', 'a-v1');
    testGraph.localHashes.set('c', 'c-v1');
    testGraph.incrementalNames.delete('a');
    await testGraph.executeAsync();
    expect(testGraph.cacheRestores).toEqual(['a', 'b', 'c']);
    expect(testGraph.executions).toEqual([]);

    // Edit "c": it is built against restored outputs, so its result is written.
    testGraph.localHashes.set('c', 'c-v3');
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['c']);
    expect(testGraph.cacheWrites).toEqual(['c']);
  });

  it('does not re-enable operations that another plugin disabled', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b']);
    // Like a plugin that performs the work itself. This tap runs after PhasedOperationPlugin's.
    testGraph.graph.hooks.configureIteration.tap('TestPlugin', (records) => {
      for (const record of records.values()) {
        record.enabled = false;
      }
    });

    const result: IExecutionResult = await testGraph.executeAsync();
    expect(result.status).toBe(OperationStatus.NoOp);
    expect(testGraph.executions).toEqual([]);
  });
});
