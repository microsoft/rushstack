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
import type { CobuildConfiguration } from '../../../api/CobuildConfiguration';
import type { RushProjectConfiguration } from '../../../api/RushProjectConfiguration';
import type { ICobuildContext, ICobuildLockProvider } from '../../cobuild/ICobuildLockProvider';
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
import { setCommandExecution, skipBuildCacheRead } from '../IncrementalExecutionState';
import { getTrustedStateHash, markSkipVerified } from '../RetainedResultVerification';
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
  readonly #failingNames: ReadonlySet<string>;

  public constructor(
    name: string,
    executions: string[],
    incrementalNames: ReadonlySet<string>,
    failingNames: ReadonlySet<string>
  ) {
    this.name = name;
    this.#executions = executions;
    this.#incrementalNames = incrementalNames;
    this.#failingNames = failingNames;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    if (this.#failingNames.has(this.name)) {
      this.#executions.push(`${this.name}:failed`);
      return OperationStatus.Failure;
    }
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
   * The operations that acquired a cobuild lock, if enabled by `cobuild`.
   */
  cobuildLocks: string[];
  /**
   * The operations that the emulated change detection plugin checked, if enabled by `upToDate`.
   */
  checks: string[];
  /**
   * The names of the operations whose runner executes its incremental command
   */
  incrementalNames: Set<string>;
  /**
   * The names of the operations whose runner fails
   */
  failingNames: Set<string>;
  /**
   * The names of the operations whose build cache entry cannot be written
   */
  failingWrites: Set<string>;
  /**
   * What an `afterExecuteOperationAsync` tap with a later stage than `CacheableOperationPlugin` saw for each
   * operation in the last iteration
   */
  results: Map<string, IRecordedResult>;
  executeAsync(isIncrementalBuildAllowed?: boolean): Promise<IExecutionResult>;
}

interface IRecordedResult {
  status: OperationStatus;
  stateHash: string;
  trustedStateHash: string | undefined;
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
  /**
   * If true, enables cobuilds with a lock provider that grants every lock and has no completed states.
   */
  cobuild?: boolean;
  /**
   * The operations whose skipped results the emulated change detection plugin marks as verified, each with the
   * state hash that it marks, or undefined for the state hash of the operation in the iteration.
   */
  verifiedSkips?: ReadonlyMap<string, string | undefined>;
  /**
   * If set, emulates a plugin that reports a selected operation as restored from the build cache if its name is in
   * this set and the build cache has no entry for it, because the plugin restored its outputs from elsewhere.
   */
  pluginFromCache?: ReadonlySet<string>;
  /**
   * The build cache entries, to share them with another test graph. By default, each test graph has its own.
   */
  cacheEntries?: Set<string>;
}

/**
 * Creates a graph of cacheable operations. By default it is a linear chain: names[0] <- names[1] <- ...
 * The mock build cache stores an entry per operation and state hash, and restores it if it exists.
 */
async function createTestGraphAsync(names: string[], options: ITestGraphOptions = {}): Promise<ITestGraph> {
  const {
    dependencies,
    cacheWriteEnabled = true,
    upToDate,
    cobuild,
    verifiedSkips,
    pluginFromCache,
    cacheEntries = new Set()
  } = options;
  const executions: string[] = [];
  const checks: string[] = [];
  const cacheWrites: string[] = [];
  const cacheRestores: string[] = [];
  const cobuildLocks: string[] = [];
  const incrementalNames: Set<string> = new Set();
  const failingNames: Set<string> = new Set();
  const failingWrites: Set<string> = new Set();
  const results: Map<string, IRecordedResult> = new Map();
  const localHashes: Map<string, string> = new Map();
  const operations: Map<string, Operation> = new Map();
  const projectConfigurations: Map<RushConfigurationProject, RushProjectConfiguration> = new Map();

  let previous: Operation | undefined;
  for (const name of names) {
    const project: RushConfigurationProject = {
      packageName: name,
      projectFolder: `/repo/${name}`,
      projectRelativeFolder: name
    } as unknown as RushConfigurationProject;
    projectConfigurations.set(project, {
      getCacheDisabledReason: () => undefined
    } as unknown as RushProjectConfiguration);
    const operation: Operation = new Operation({
      runner: options.noOpNames?.has(name)
        ? new NullOperationRunner({ name, result: OperationStatus.NoOp, silent: true })
        : new CacheableMockRunner(name, executions, incrementalNames, failingNames),
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
      get cacheId(): string {
        return getCacheKey();
      },
      tryRestoreFromCacheAsync: async () => {
        const restored: boolean = cacheEntries.has(getCacheKey());
        if (restored) {
          cacheRestores.push(name);
        }
        return restored;
      },
      trySetCacheEntryAsync: async () => {
        if (failingWrites.has(name)) {
          return false;
        }
        cacheWrites.push(name);
        cacheEntries.add(getCacheKey());
        return true;
      }
    } as unknown as OperationBuildCache;
  });

  const cobuildLockProvider: Pick<
    ICobuildLockProvider,
    'acquireLockAsync' | 'renewLockAsync' | 'getCompletedStateAsync' | 'setCompletedStateAsync'
  > = {
    acquireLockAsync: async ({ packageName }: ICobuildContext) => {
      cobuildLocks.push(packageName);
      return true;
    },
    renewLockAsync: async () => {
      /* noop */
    },
    getCompletedStateAsync: async () => undefined,
    setCompletedStateAsync: async () => {
      /* noop */
    }
  };

  const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());
  const hooks: PhasedCommandHooks = new PhasedCommandHooks();
  new PhasedOperationPlugin().apply(hooks);
  new CacheableOperationPlugin({
    allowWarningsInSuccessfulBuild: false,
    buildCacheConfiguration: {
      buildCacheEnabled: true,
      cacheWriteEnabled
    } as unknown as BuildCacheConfiguration,
    cobuildConfiguration: cobuild
      ? ({
          cobuildFeatureEnabled: true,
          cobuildContextId: 'context',
          cobuildRunnerId: 'runner',
          cobuildLeafProjectLogOnlyAllowed: false,
          getCobuildLockProvider: () => cobuildLockProvider
        } as unknown as CobuildConfiguration)
      : undefined,
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
        if (verifiedSkips?.has(name)) {
          markSkipVerified(record, verifiedSkips.get(name) ?? record.getStateHash());
        }
        return OperationStatus.Skipped;
      }
    );
  }
  if (pluginFromCache) {
    graph.hooks.beforeExecuteOperationAsync.tapPromise(
      // After the build cache is read
      { name: 'TestRestorePlugin', stage: 10 },
      async (
        record: IOperationRunnerContext & IOperationExecutionResult
      ): Promise<OperationStatus | undefined> => {
        if (record.silent || !pluginFromCache.has(record.operation.name)) {
          return;
        }
        return OperationStatus.FromCache;
      }
    );
  }
  graph.hooks.afterExecuteOperationAsync.tap(
    // After CacheableOperationPlugin decided whether to trust the result
    { name: 'TestTrustObserverPlugin', stage: 100 },
    (record: IOperationRunnerContext & IOperationExecutionResult): void => {
      results.set(record.operation.name, {
        status: record.status,
        stateHash: record.getStateHash(),
        trustedStateHash: getTrustedStateHash(record)
      });
    }
  );

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
    cobuildLocks,
    checks,
    incrementalNames,
    failingNames,
    failingWrites,
    results,
    executeAsync: async (isIncrementalBuildAllowed?: boolean) => {
      executions.length = 0;
      cacheWrites.length = 0;
      cacheRestores.length = 0;
      cobuildLocks.length = 0;
      checks.length = 0;
      results.clear();
      return await graph.executeAsync({ inputsSnapshot, isIncrementalBuildAllowed });
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

    // S2: edit "tool", then --only tool. As in a run that does not select "lib", its entry is not written.
    testGraph.localHashes.set('tool', 'tool-v2');
    lib.enabled = false;
    app.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['tool']);
    expect(testGraph.cacheWrites).toEqual([]);

    // S3: --to app
    lib.enabled = true;
    app.enabled = true;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['tool', 'app']);
    expect(testGraph.cacheWrites).toEqual(['tool', 'app']);

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

  it('does not write a result built against a trusted dependency that the request did not select', async () => {
    // The outputs of "a" are not part of its state hash, so they may have been edited in place since it executed.
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b']);
    const a: Operation = testGraph.operations.get('a')!;
    await testGraph.executeAsync();

    // Edit "b", then --only b: "b" is built against outputs of "a" that this iteration did not verify.
    testGraph.localHashes.set('b', 'b-v2');
    a.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b']);
    expect(testGraph.cacheWrites).toEqual([]);

    // Repeating the request cannot produce a trusted result for "b", so it is skipped.
    const repeatedResult: IExecutionResult = await testGraph.executeAsync();
    expect(repeatedResult.status).toBe(OperationStatus.NoOp);
    expect(testGraph.executions).toEqual([]);

    // --to b: "b" has no entry at its state hash, so it executes again.
    a.enabled = true;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b']);
    expect(testGraph.cacheWrites).toEqual(['b']);

    const hotResult: IExecutionResult = await testGraph.executeAsync();
    expect(hotResult.status).toBe(OperationStatus.NoOp);
    expect(testGraph.executions).toEqual([]);
  });

  it('does not acquire a cobuild lock for a result built against a trusted dependency that the request did not select', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b'], { cobuild: true });
    const a: Operation = testGraph.operations.get('a')!;
    await testGraph.executeAsync();
    expect(testGraph.cobuildLocks).toEqual(['a', 'b']);
    expect(testGraph.cacheWrites).toEqual(['a', 'b']);

    // Edit "b", then --only b: as for a write, a lock is only acquired for a result that can be written.
    testGraph.localHashes.set('b', 'b-v2');
    a.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b']);
    expect(testGraph.cobuildLocks).toEqual([]);
    expect(testGraph.cacheWrites).toEqual([]);
  });

  it('does not write a result built against a trusted dependency that the request did not select, through an operation without a script', async () => {
    // "a" <- "n" <- "b", where "n" has no script
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'n', 'b'], {
      noOpNames: new Set(['n'])
    });
    const { operations } = testGraph;
    await testGraph.executeAsync();
    expect(testGraph.cacheWrites).toEqual(['a', 'b']);

    // Edit "b", then --only b: "b" is built against outputs of "a" that this iteration did not verify.
    testGraph.localHashes.set('b', 'b-v2');
    operations.get('a')!.enabled = false;
    operations.get('n')!.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b']);
    expect(testGraph.cacheWrites).toEqual([]);

    // --to b
    operations.get('a')!.enabled = true;
    operations.get('n')!.enabled = true;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b']);
    expect(testGraph.cacheWrites).toEqual(['b']);
  });

  it('keeps trusting a skipped consumer of an operation without a script whose dependency the request did not select', async () => {
    // "a" <- "n" <- "c", where "n" has no script, and "d"
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'n', 'c', 'd'], {
      noOpNames: new Set(['n']),
      dependencies: { n: ['a'], c: ['n'] }
    });
    const a: Operation = testGraph.operations.get('a')!;
    await testGraph.executeAsync();

    // Edit "d", then --impacted-by n --to d: "n" has no outputs, so it keeps its trust, and so does "c", which
    // is skipped.
    testGraph.localHashes.set('d', 'd-v2');
    a.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['d']);
    expect(testGraph.cacheWrites).toEqual(['d']);

    // --to c --to d
    a.enabled = true;
    const result: IExecutionResult = await testGraph.executeAsync();
    expect(result.status).toBe(OperationStatus.NoOp);
    expect(testGraph.cacheRestores).toEqual([]);
    expect(testGraph.executions).toEqual([]);
  });

  it('keeps trusting a skipped result whose dependency the request did not select, but does not write its consumers', async () => {
    // "a" <- "b" <- "c"
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b', 'c']);
    const a: Operation = testGraph.operations.get('a')!;
    await testGraph.executeAsync();

    // Edit "c", then --impacted-by b: "b" is skipped, and "c" can read the unverified outputs of "a" through it.
    testGraph.localHashes.set('c', 'c-v2');
    a.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['c']);
    expect(testGraph.cacheWrites).toEqual([]);

    // --to c: "b" was not built in that iteration, so it is still trusted.
    a.enabled = true;
    await testGraph.executeAsync();
    expect(testGraph.cacheRestores).toEqual([]);
    expect(testGraph.executions).toEqual(['c']);
    expect(testGraph.cacheWrites).toEqual(['c']);
  });

  it('trusts a result restored from the build cache while its dependency is not selected, but does not write its consumers', async () => {
    // "a" <- "b" <- "c"
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b', 'c']);
    const a: Operation = testGraph.operations.get('a')!;
    await testGraph.executeAsync();
    testGraph.localHashes.set('b', 'b-v2');
    await testGraph.executeAsync();
    expect(testGraph.cacheWrites).toEqual(['b', 'c']);

    // Revert "b" and edit "c", then --impacted-by b: "b" has an entry from the first iteration, and "c" can read
    // the unverified outputs of "a" through it.
    testGraph.localHashes.set('b', 'b-v1');
    testGraph.localHashes.set('c', 'c-v2');
    a.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.cacheRestores).toEqual(['b']);
    expect(testGraph.executions).toEqual(['c']);
    expect(testGraph.cacheWrites).toEqual([]);

    // --to c: the restored outputs of "b" match its state hash.
    a.enabled = true;
    await testGraph.executeAsync();
    expect(testGraph.cacheRestores).toEqual([]);
    expect(testGraph.executions).toEqual(['c']);
    expect(testGraph.cacheWrites).toEqual(['c']);
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

  it('restores nothing from the build cache in a non-incremental iteration, but still writes to it', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b']);
    await testGraph.executeAsync();
    testGraph.localHashes.set('a', 'a-v2');
    await testGraph.executeAsync();

    // Revert "a", then rebuild --to b: both have entries from the first iteration.
    testGraph.localHashes.set('a', 'a-v1');
    const result: IExecutionResult = await testGraph.executeAsync(false);
    expect(getStatus(testGraph, result, 'a')).toBe(OperationStatus.Success);
    expect(testGraph.executions).toEqual(['a', 'b']);
    expect(testGraph.cacheRestores).toEqual([]);
    expect(testGraph.cacheWrites).toEqual(['a', 'b']);

    const hotResult: IExecutionResult = await testGraph.executeAsync();
    expect(hotResult.status).toBe(OperationStatus.NoOp);
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

  it('does not restore an operation whose runner skipped the build cache read, and writes neither it nor its consumers', async () => {
    // "a" <- "b"
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b']);
    // Like a warm worker, whose outputs are what it keeps in memory: a restore would not update them.
    testGraph.graph.hooks.beforeExecuteOperationAsync.tapPromise(
      { name: 'skip-read', stage: -1 },
      async (record: IOperationRunnerContext & IOperationExecutionResult): Promise<undefined> => {
        if (testGraph.incrementalNames.has(record.operation.associatedProject.packageName)) {
          skipBuildCacheRead(record);
        }
        return undefined;
      }
    );
    await testGraph.executeAsync();
    expect(testGraph.cacheWrites).toEqual(['a', 'b']);

    testGraph.localHashes.set('a', 'a-v2');
    testGraph.incrementalNames.add('a');
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['a:incremental', 'b']);
    expect(testGraph.cacheWrites).toEqual([]);

    // Revert "a": both operations have an entry from the first iteration, but only "b" may be restored.
    testGraph.localHashes.set('a', 'a-v1');
    await testGraph.executeAsync();
    expect(testGraph.cacheRestores).toEqual(['b']);
    expect(testGraph.executions).toEqual(['a:incremental']);
    expect(testGraph.cacheWrites).toEqual([]);
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

// Skipped results that a plugin verified, and the state hash at which each result is trusted.
describe(`${CacheableOperationPlugin.name} verified skipped results`, () => {
  function expectTrusted(testGraph: ITestGraph, name: string): void {
    const result: IRecordedResult | undefined = testGraph.results.get(name);
    expect(result?.trustedStateHash).toBeDefined();
    expect(result?.trustedStateHash).toBe(result?.stateHash);
  }

  function expectNotTrusted(testGraph: ITestGraph, name: string): void {
    expect(testGraph.results.has(name)).toBe(true);
    expect(testGraph.results.get(name)?.trustedStateHash).toBeUndefined();
  }

  it('writes the consumers of skipped results that a plugin verified, in the first iteration of a graph', async () => {
    // "lib" <- "tool" <- "app"
    const testGraph: ITestGraph = await createTestGraphAsync(['lib', 'tool', 'app'], {
      upToDate: new Set(['lib', 'tool']),
      verifiedSkips: new Map([
        ['lib', undefined],
        ['tool', undefined]
      ])
    });
    await testGraph.executeAsync();
    expect(testGraph.checks).toEqual(['lib', 'tool', 'app']);
    expect(testGraph.executions).toEqual(['app']);
    expect(testGraph.cacheWrites).toEqual(['app']);
  });

  it('does not write the consumers of a skipped result that a plugin verified at another state hash', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['lib', 'tool', 'app'], {
      upToDate: new Set(['lib', 'tool']),
      verifiedSkips: new Map([
        ['lib', undefined],
        ['tool', 'another-state-hash']
      ])
    });
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['app']);
    expect(testGraph.cacheWrites).toEqual([]);
  });

  it('does not write the consumers of skipped results that no plugin verified', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['lib', 'tool', 'app'], {
      upToDate: new Set(['lib', 'tool'])
    });
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['app']);
    expect(testGraph.cacheWrites).toEqual([]);
  });

  it('does not trust a verified skipped result whose dependency blocks cache writes', async () => {
    // "lib" was skipped without verification, so "tool" was verified against outputs that may not match.
    const testGraph: ITestGraph = await createTestGraphAsync(['lib', 'tool', 'app'], {
      upToDate: new Set(['lib', 'tool']),
      verifiedSkips: new Map([['tool', undefined]])
    });
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['app']);
    expect(testGraph.cacheWrites).toEqual([]);
    expectNotTrusted(testGraph, 'tool');
  });

  it('does not trust a verified skipped result whose dependency blocked cache writes after that dependency runs again', async () => {
    // "lib" was skipped without verification, so "tool" was verified against outputs that may not match.
    const upToDate: Set<string> = new Set(['lib', 'tool']);
    const testGraph: ITestGraph = await createTestGraphAsync(['lib', 'tool', 'app'], {
      upToDate,
      verifiedSkips: new Map([['tool', undefined]])
    });
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['app']);
    expect(testGraph.cacheWrites).toEqual([]);

    // The daemon invalidates "lib", which runs again at the same state hash. "tool" keeps the result that was
    // verified against the unverified outputs of "lib", so "app", which was built against it, is not written.
    upToDate.delete('lib');
    testGraph.graph.invalidateOperations([testGraph.operations.get('lib')!], 'daemon graph invalidate');
    await testGraph.executeAsync();
    expect(testGraph.checks).toEqual(['lib']);
    expect(testGraph.executions).toEqual(['lib']);
    expect(testGraph.cacheWrites).toEqual(['lib']);
  });

  it('does not write the consumers of a verified skipped result whose dependency the request did not select', async () => {
    const upToDate: Set<string> = new Set();
    const verifiedSkips: Map<string, string | undefined> = new Map();
    const testGraph: ITestGraph = await createTestGraphAsync(['lib', 'tool', 'app'], {
      upToDate,
      verifiedSkips
    });
    await testGraph.executeAsync();
    expect(testGraph.cacheWrites).toEqual(['lib', 'tool', 'app']);

    // Edit "tool", which the plugin verifies, then --impacted-by tool: "app" can read the unverified outputs of
    // "lib" through "tool".
    testGraph.localHashes.set('tool', 'tool-v2');
    upToDate.add('tool');
    verifiedSkips.set('tool', undefined);
    testGraph.operations.get('lib')!.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.checks).toEqual(['tool', 'app']);
    expect(testGraph.executions).toEqual(['app']);
    expect(testGraph.cacheWrites).toEqual([]);
  });

  it('keeps trusting skipped results that a plugin verified in later iterations of a long-lived graph', async () => {
    const upToDate: Set<string> = new Set(['lib', 'tool', 'app']);
    const testGraph: ITestGraph = await createTestGraphAsync(['lib', 'tool', 'app'], {
      upToDate,
      verifiedSkips: new Map([
        ['lib', undefined],
        ['tool', undefined],
        ['app', undefined]
      ])
    });
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual([]);

    // Edit "app": its dependencies are trusted, so its cache entry is written.
    testGraph.localHashes.set('app', 'app-v2');
    upToDate.delete('app');
    await testGraph.executeAsync();
    expect(testGraph.checks).toEqual(['app']);
    expect(testGraph.executions).toEqual(['app']);
    expect(testGraph.cacheWrites).toEqual(['app']);
  });

  it('reports the state hash of results built while cache writes are allowed', async () => {
    // "a" <- "b"
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b']);
    await testGraph.executeAsync();
    expect(testGraph.cacheWrites).toEqual(['a', 'b']);
    expectTrusted(testGraph, 'a');
    expectTrusted(testGraph, 'b');
  });

  it('reports the state hash of results restored from the build cache', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b']);
    await testGraph.executeAsync();
    testGraph.localHashes.set('a', 'a-v2');
    await testGraph.executeAsync();

    // Revert "a": both have entries from the first iteration.
    testGraph.localHashes.set('a', 'a-v1');
    await testGraph.executeAsync();
    expect(testGraph.cacheRestores).toEqual(['a', 'b']);
    expectTrusted(testGraph, 'a');
    expectTrusted(testGraph, 'b');
  });

  it('does not report a state hash for a skipped result that no plugin verified, or for its consumers', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b'], { upToDate: new Set(['a']) });
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b']);
    expectNotTrusted(testGraph, 'a');
    expectNotTrusted(testGraph, 'b');
  });

  it('does not report a state hash for a failed result', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b']);
    testGraph.failingNames.add('a');
    await testGraph.executeAsync();
    expect(testGraph.results.get('a')?.status).toBe(OperationStatus.Failure);
    expectNotTrusted(testGraph, 'a');
  });

  it('does not report a state hash for an incremental result, or for the results built against it', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b']);
    await testGraph.executeAsync();

    // Edit "a", which runs its incremental command.
    testGraph.localHashes.set('a', 'a-v2');
    testGraph.incrementalNames.add('a');
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['a:incremental', 'b']);
    expectNotTrusted(testGraph, 'a');
    expectNotTrusted(testGraph, 'b');
  });

  it('does not report a state hash when cache writes are disabled', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b'], { cacheWriteEnabled: false });
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['a', 'b']);
    expectNotTrusted(testGraph, 'a');
    expectNotTrusted(testGraph, 'b');
  });

  it('reports the state hash of a skipped result that a plugin verified at that state hash', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b'], {
      upToDate: new Set(['a']),
      verifiedSkips: new Map([['a', undefined]])
    });
    await testGraph.executeAsync();
    expect(testGraph.results.get('a')?.status).toBe(OperationStatus.Skipped);
    expectTrusted(testGraph, 'a');
  });

  it('does not report a state hash for a skipped result that a plugin verified at another state hash', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b'], {
      upToDate: new Set(['a']),
      verifiedSkips: new Map([['a', 'another-state-hash']])
    });
    await testGraph.executeAsync();
    expect(testGraph.results.get('a')?.status).toBe(OperationStatus.Skipped);
    expectNotTrusted(testGraph, 'a');
  });

  it('reports the state hash of a result that a plugin restored while cache writes are allowed', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a'], { pluginFromCache: new Set(['a']) });
    await testGraph.executeAsync();
    expect(testGraph.cacheRestores).toEqual([]);
    expect(testGraph.results.get('a')?.status).toBe(OperationStatus.FromCache);
    expectTrusted(testGraph, 'a');
  });

  it('does not report a state hash for a result that a plugin restored while a dependency blocks cache writes', async () => {
    // "x" <- "a"
    const testGraph: ITestGraph = await createTestGraphAsync(['x', 'a'], {
      upToDate: new Set(['x']),
      pluginFromCache: new Set(['a'])
    });
    await testGraph.executeAsync();
    expect(testGraph.results.get('a')?.status).toBe(OperationStatus.FromCache);
    expectNotTrusted(testGraph, 'a');
  });

  it('does not report a state hash for a result restored from the build cache while a dependency blocks cache writes', async () => {
    // "x" <- "b"
    const cacheEntries: Set<string> = new Set();
    const firstGraph: ITestGraph = await createTestGraphAsync(['x', 'b'], { cacheEntries });
    await firstGraph.executeAsync();
    expect(firstGraph.cacheWrites).toEqual(['x', 'b']);

    // A new graph with the same build cache, in which a plugin skips "x" without verifying it
    const testGraph: ITestGraph = await createTestGraphAsync(['x', 'b'], {
      cacheEntries,
      upToDate: new Set(['x'])
    });
    await testGraph.executeAsync();
    expect(testGraph.cacheRestores).toEqual(['b']);
    expectNotTrusted(testGraph, 'b');
  });

  it('does not report a state hash for a result whose build cache entry could not be written', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a']);
    testGraph.failingWrites.add('a');
    await testGraph.executeAsync();
    expect(testGraph.results.get('a')?.status).toBe(OperationStatus.SuccessWithWarning);
    expectNotTrusted(testGraph, 'a');
  });

  it('does not report a state hash for a result retained by a previous iteration, or for its consumers', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b']);
    await testGraph.executeAsync();

    // Edit "b", then --only b
    testGraph.localHashes.set('b', 'b-v2');
    testGraph.operations.get('a')!.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b']);
    expect(testGraph.results.get('a')?.status).toBe(OperationStatus.Skipped);
    expectNotTrusted(testGraph, 'a');
    expectNotTrusted(testGraph, 'b');
  });
});
