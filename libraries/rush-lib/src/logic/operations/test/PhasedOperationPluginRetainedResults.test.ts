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

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { MockWritable, StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import { PhasedCommandHooks, type IOperationGraphContext } from '../../../pluginFramework/PhasedCommandHooks';
import type { IInputsSnapshot } from '../../incremental/InputsSnapshot';
import { LegacySkipPlugin } from '../LegacySkipPlugin';
import { PhasedOperationPlugin } from '../PhasedOperationPlugin';
import { OperationGraph } from '../OperationGraph';
import { Operation } from '../Operation';
import { OperationStatus } from '../OperationStatus';
import type { IOperationRunner, IOperationRunnerContext } from '../IOperationRunner';
import type { IExecutionResult, IOperationExecutionResult } from '../IOperationExecutionResult';
import { markResultUnverifiable } from '../RetainedResultVerification';

const mockPhase: IPhase = {
  name: 'phase',
  allowWarningsOnSuccess: false,
  associatedParameters: new Set(),
  dependencies: { self: new Set(), upstream: new Set() },
  isSynthetic: false,
  logFilenameIdentifier: 'phase',
  missingScriptBehavior: 'silent'
};

class MockRunner implements IOperationRunner {
  public readonly reportTiming: boolean = true;
  public readonly silent: boolean = false;
  public readonly cacheable: boolean = true;
  public readonly warningsAreAllowed: boolean = false;
  public readonly name: string;
  public readonly isNoOp: boolean;
  readonly #executions: string[];
  readonly #incrementalExecutions: string[];

  public constructor(name: string, isNoOp: boolean, executions: string[], incrementalExecutions: string[]) {
    this.name = name;
    this.isNoOp = isNoOp;
    this.#executions = executions;
    this.#incrementalExecutions = incrementalExecutions;
  }

  public async executeAsync(
    context: IOperationRunnerContext,
    lastState?: IOperationExecutionResult
  ): Promise<OperationStatus> {
    if (this.isNoOp) {
      return OperationStatus.NoOp;
    }
    this.#executions.push(this.name);
    if (lastState) {
      this.#incrementalExecutions.push(this.name);
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
  /** The executions that were given the result of the previous execution. */
  incrementalExecutions: string[];
  /**
   * The operations that the emulated change detection plugin checked, if enabled by `upToDate`.
   */
  checks: string[];
  executeAsync(isIncrementalBuildAllowed?: boolean): Promise<IExecutionResult>;
}

interface ITestGraphOptions {
  /**
   * Operations that have no work.
   */
  noOps?: ReadonlySet<string>;
  /**
   * If set, the incremental state files of the legacy skip detection are stored in this folder.
   */
  legacySkipFolder?: string;
  /**
   * If set, emulates a plugin with its own change detection (e.g. by tracing the files that each operation reads),
   * which reports a selected operation as skipped if its name is in this set, because its outputs are up to date.
   */
  upToDate?: ReadonlySet<string>;
  /**
   * Whether the command may skip operations. It is false for `rush rebuild`. Defaults to true.
   */
  isIncrementalBuildAllowed?: boolean;
}

/**
 * Creates a graph from the names of the dependencies of each operation, without the build cache.
 */
async function createTestGraphAsync(
  dependencies: Record<string, string[]>,
  options: ITestGraphOptions = {}
): Promise<ITestGraph> {
  const {
    noOps,
    legacySkipFolder,
    upToDate,
    isIncrementalBuildAllowed: isIncrementalCommand = true
  } = options;
  const executions: string[] = [];
  const incrementalExecutions: string[] = [];
  const checks: string[] = [];
  const localHashes: Map<string, string> = new Map();
  const operations: Map<string, Operation> = new Map();

  for (const name of Object.keys(dependencies)) {
    const projectFolder: string = path.join(legacySkipFolder ?? '/repo', name);
    const project: RushConfigurationProject = {
      packageName: name,
      projectFolder,
      projectRushTempFolder: projectFolder
    } as unknown as RushConfigurationProject;
    const operation: Operation = new Operation({
      runner: new MockRunner(name, !!noOps?.has(name), executions, incrementalExecutions),
      logFilenameIdentifier: name,
      phase: mockPhase,
      project
    });
    operations.set(name, operation);
    localHashes.set(name, `${name}-v1`);
  }
  for (const [name, dependencyNames] of Object.entries(dependencies)) {
    for (const dependencyName of dependencyNames) {
      operations.get(name)!.addDependency(operations.get(dependencyName)!);
    }
  }

  const hooks: PhasedCommandHooks = new PhasedCommandHooks();
  new PhasedOperationPlugin().apply(hooks);
  if (legacySkipFolder) {
    new LegacySkipPlugin({
      allowWarningsInSuccessfulBuild: false,
      terminal: new Terminal(new StringBufferTerminalProvider()),
      changedProjectsOnly: false,
      isIncrementalBuildAllowed: isIncrementalCommand
    }).apply(hooks);
  }

  const graph: OperationGraph = new OperationGraph(new Set(operations.values()), {
    quietMode: true,
    debugMode: false,
    parallelism: 1,
    allowOversubscription: true,
    destinations: [new MockWritable()],
    abortController: new AbortController()
  });
  await hooks.onGraphCreatedAsync.promise(graph, {
    isIncrementalBuildAllowed: isIncrementalCommand,
    projectConfigurations: new Map()
  } as unknown as IOperationGraphContext);
  if (upToDate) {
    graph.hooks.beforeExecuteOperationAsync.tapPromise(
      { name: 'TestChangeDetectionPlugin', stage: -200 },
      async (
        record: IOperationRunnerContext & IOperationExecutionResult
      ): Promise<OperationStatus | undefined> => {
        if (record.silent) {
          return;
        }
        const { name } = record.operation;
        checks.push(name);
        return upToDate.has(name) ? OperationStatus.Skipped : undefined;
      }
    );
  }

  const inputsSnapshot: IInputsSnapshot = {
    hashes: new Map(),
    rootDirectory: '/repo',
    hasUncommittedChanges: false,
    getTrackedFileHashesForOperation: (project: RushConfigurationProject) =>
      new Map([[`${project.packageName}/src/index.ts`, localHashes.get(project.packageName)!]]),
    getOperationOwnStateHash: (project: RushConfigurationProject) => localHashes.get(project.packageName)!
  };

  return {
    graph,
    operations,
    localHashes,
    executions,
    incrementalExecutions,
    checks,
    executeAsync: async (isIncrementalBuildAllowed?: boolean) => {
      executions.length = 0;
      incrementalExecutions.length = 0;
      checks.length = 0;
      return await graph.executeAsync({ inputsSnapshot, isIncrementalBuildAllowed });
    }
  };
}

/**
 * Returns the status of each operation in the result of an iteration, or "silent" if it was not selected.
 */
function getStatuses(testGraph: ITestGraph, result: IExecutionResult): Record<string, string> {
  const statuses: Record<string, string> = {};
  for (const [name, operation] of testGraph.operations) {
    const record: IOperationExecutionResult = result.operationResults.get(operation)!;
    statuses[name] = record.silent ? 'silent' : record.status;
  }
  return statuses;
}

// How results retained by earlier iterations of a long-lived graph (e.g. the Rush daemon) are verified,
// whether or not the build cache is in use.
describe(`${PhasedOperationPlugin.name} retained results`, () => {
  it('re-executes a retained result that was built against a dependency that has since been rebuilt', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync({ a: [], b: ['a'] });
    const a: Operation = testGraph.operations.get('a')!;
    await testGraph.executeAsync();

    // --only b, after editing both: "b" is built against the outputs of the previous "a".
    testGraph.localHashes.set('a', 'a-v2');
    testGraph.localHashes.set('b', 'b-v2');
    a.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b']);

    // --to b: "b" has the same state hash as its retained result, but "a" is rebuilt.
    a.enabled = true;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['a', 'b']);

    const hotResult: IExecutionResult = await testGraph.executeAsync();
    expect(hotResult.status).toBe(OperationStatus.NoOp);
    expect(testGraph.executions).toEqual([]);
  });

  it('re-executes every retained result in a chain that was built against unverified outputs', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync({ a: [], b: ['a'], c: ['b'] });
    const a: Operation = testGraph.operations.get('a')!;
    const b: Operation = testGraph.operations.get('b')!;
    const c: Operation = testGraph.operations.get('c')!;
    await testGraph.executeAsync();

    // --only b, then --only c, after editing "a" and "b"
    testGraph.localHashes.set('a', 'a-v2');
    testGraph.localHashes.set('b', 'b-v2');
    a.enabled = false;
    c.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b']);
    b.enabled = false;
    c.enabled = true;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['c']);

    // --to c
    a.enabled = true;
    b.enabled = true;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['a', 'b', 'c']);
  });

  it('verifies results through operations without work', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(
      { a: [], n: ['a'], b: ['n'] },
      { noOps: new Set(['n']) }
    );
    const a: Operation = testGraph.operations.get('a')!;
    const n: Operation = testGraph.operations.get('n')!;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['a', 'b']);

    // --only b, after editing "a" and "b"
    testGraph.localHashes.set('a', 'a-v2');
    testGraph.localHashes.set('b', 'b-v2');
    a.enabled = false;
    n.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b']);

    // --to b
    a.enabled = true;
    n.enabled = true;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['a', 'b']);

    const hotResult: IExecutionResult = await testGraph.executeAsync();
    expect(hotResult.status).toBe(OperationStatus.NoOp);
    expect(testGraph.executions).toEqual([]);
  });

  it('does not re-execute a retained result that was built against unchanged dependencies that were not selected', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync({ a: [], b: ['a'] });
    const a: Operation = testGraph.operations.get('a')!;
    await testGraph.executeAsync();

    // --only b, after editing "b"
    testGraph.localHashes.set('b', 'b-v2');
    a.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b']);

    // --to b
    a.enabled = true;
    const result: IExecutionResult = await testGraph.executeAsync();
    expect(result.status).toBe(OperationStatus.NoOp);
    expect(testGraph.executions).toEqual([]);
  });

  it('does not re-execute a retained result while a dependency that was not selected is unverified', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync({ a: [], b: ['a'] });
    testGraph.operations.get('a')!.enabled = false;

    // Cold --only b: "a" has never executed in this graph.
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b']);

    // Repeating the request cannot produce a verified result for "b", so it is skipped.
    const result: IExecutionResult = await testGraph.executeAsync();
    expect(result.status).toBe(OperationStatus.NoOp);
    expect(testGraph.executions).toEqual([]);
  });

  it('re-executes a consumer whose dependency was rebuilt by a request that did not select it', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync({ b: [], c: ['b'] });
    const c: Operation = testGraph.operations.get('c')!;
    await testGraph.executeAsync();

    // --to b, after editing "b"
    testGraph.localHashes.set('b', 'b-v2');
    c.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b']);

    // --to c
    c.enabled = true;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['c']);
  });

  it('re-executes a result that a plugin marked unverifiable, and the results built against it', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync({ a: [], b: ['a'] });
    const a: Operation = testGraph.operations.get('a')!;
    let isMarkingA: boolean = true;
    // Like CacheableOperationPlugin when input files of "a" changed while "a" was executing
    testGraph.graph.hooks.afterExecuteOperationAsync.tap(
      'TestPlugin',
      (record: IOperationExecutionResult) => {
        if (isMarkingA && record.operation === a) {
          markResultUnverifiable(record);
        }
      }
    );
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['a', 'b']);

    // The same state hashes
    isMarkingA = false;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['a', 'b']);

    const hotResult: IExecutionResult = await testGraph.executeAsync();
    expect(hotResult.status).toBe(OperationStatus.NoOp);
    expect(testGraph.executions).toEqual([]);
  });

  it('does not re-execute retained results of operations that ignore dependency changes', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync({ a: [], b: ['a'] });
    const a: Operation = testGraph.operations.get('a')!;
    const b: Operation = testGraph.operations.get('b')!;
    await testGraph.executeAsync();

    // --only b, after editing both
    testGraph.localHashes.set('a', 'a-v2');
    testGraph.localHashes.set('b', 'b-v2');
    a.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b']);

    // --to b --changed-projects-only
    a.enabled = 'ignore-dependency-changes';
    b.enabled = 'ignore-dependency-changes';
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['a']);
  });

  it('does not re-enable operations that a later configureIteration tap disabled', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync({ a: [], b: ['a'] });
    const a: Operation = testGraph.operations.get('a')!;
    await testGraph.executeAsync();

    // --only b, after editing both
    testGraph.localHashes.set('a', 'a-v2');
    testGraph.localHashes.set('b', 'b-v2');
    a.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b']);

    // Like a plugin that performs the work itself.
    testGraph.graph.hooks.configureIteration.tap({ name: 'TestPlugin', stage: 1 }, (records) => {
      for (const record of records.values()) {
        record.enabled = false;
      }
    });
    a.enabled = true;
    const result: IExecutionResult = await testGraph.executeAsync();
    expect(result.status).toBe(OperationStatus.NoOp);
    expect(testGraph.executions).toEqual([]);
  });

  it('runs every selected operation of a non-incremental iteration without its previous result', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync({ a: [], b: ['a'] });
    const b: Operation = testGraph.operations.get('b')!;
    await testGraph.executeAsync();

    // rebuild --to b
    await testGraph.executeAsync(false);
    expect(testGraph.executions).toEqual(['a', 'b']);
    expect(testGraph.incrementalExecutions).toEqual([]);
    const hotResult: IExecutionResult = await testGraph.executeAsync();
    expect(hotResult.status).toBe(OperationStatus.NoOp);

    // rebuild --only a: "a" has the same state hash, so "b" stays verified.
    b.enabled = false;
    await testGraph.executeAsync(false);
    expect(testGraph.executions).toEqual(['a']);
    b.enabled = true;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual([]);

    // An incremental iteration gives each operation its previous result.
    testGraph.localHashes.set('a', 'a-v2');
    await testGraph.executeAsync();
    expect(testGraph.incrementalExecutions).toEqual(['a', 'b']);
  });

  it('reuses the result of a selected operation that a plugin found up to date while its state hash is unchanged', async () => {
    const upToDate: Set<string> = new Set(['a', 'b']);
    const testGraph: ITestGraph = await createTestGraphAsync({ a: [], b: ['a'] }, { upToDate });

    // The outputs were built before this graph was created.
    await testGraph.executeAsync();
    expect(testGraph.checks).toEqual(['a', 'b']);
    expect(testGraph.executions).toEqual([]);

    const hotResult: IExecutionResult = await testGraph.executeAsync();
    expect(hotResult.status).toBe(OperationStatus.NoOp);
    expect(testGraph.checks).toEqual([]);

    // Edit "b"
    testGraph.localHashes.set('b', 'b-v2');
    upToDate.delete('b');
    await testGraph.executeAsync();
    expect(testGraph.checks).toEqual(['b']);
    expect(testGraph.executions).toEqual(['b']);

    const secondHotResult: IExecutionResult = await testGraph.executeAsync();
    expect(secondHotResult.status).toBe(OperationStatus.NoOp);
    expect(testGraph.checks).toEqual([]);
    expect(testGraph.executions).toEqual([]);
  });

  it('checks a result that a plugin found up to date against outputs of a dependency that were not current again', async () => {
    const upToDate: Set<string> = new Set(['a', 'b']);
    const testGraph: ITestGraph = await createTestGraphAsync({ a: [], b: ['a'] }, { upToDate });
    const a: Operation = testGraph.operations.get('a')!;
    await testGraph.executeAsync();
    expect(testGraph.checks).toEqual(['a', 'b']);

    // --only b, after editing "a": "b" is found up to date with the outputs of the previous "a".
    testGraph.localHashes.set('a', 'a-v2');
    upToDate.delete('a');
    a.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.checks).toEqual(['b']);
    expect(testGraph.executions).toEqual([]);

    // --to b: "b" has the same state hash as its retained result, but "a" is rebuilt, which changes the inputs of "b".
    a.enabled = true;
    upToDate.delete('b');
    await testGraph.executeAsync();
    expect(testGraph.checks).toEqual(['a', 'b']);
    expect(testGraph.executions).toEqual(['a', 'b']);

    const hotResult: IExecutionResult = await testGraph.executeAsync();
    expect(hotResult.status).toBe(OperationStatus.NoOp);
    expect(testGraph.checks).toEqual([]);
  });

  it('checks a result that a plugin found up to date again if it was marked unverifiable, and the results checked against it', async () => {
    const upToDate: Set<string> = new Set(['a', 'b']);
    const testGraph: ITestGraph = await createTestGraphAsync({ a: [], b: ['a'] }, { upToDate });
    const a: Operation = testGraph.operations.get('a')!;
    let isMarkingA: boolean = true;
    // Like CacheableOperationPlugin when input files of "a" changed during the iteration
    testGraph.graph.hooks.afterExecuteOperationAsync.tap(
      'TestPlugin',
      (record: IOperationExecutionResult) => {
        if (isMarkingA && record.operation === a) {
          markResultUnverifiable(record);
        }
      }
    );
    await testGraph.executeAsync();
    expect(testGraph.checks).toEqual(['a', 'b']);

    // The same state hashes
    isMarkingA = false;
    await testGraph.executeAsync();
    expect(testGraph.checks).toEqual(['a', 'b']);
    expect(testGraph.executions).toEqual([]);

    const hotResult: IExecutionResult = await testGraph.executeAsync();
    expect(hotResult.status).toBe(OperationStatus.NoOp);
    expect(testGraph.checks).toEqual([]);
  });

  it('enables every selected operation of a non-incremental iteration, even with a result that a plugin found up to date', async () => {
    const upToDate: Set<string> = new Set(['a', 'b']);
    const testGraph: ITestGraph = await createTestGraphAsync({ a: [], b: ['a'] }, { upToDate });
    await testGraph.executeAsync();
    expect(testGraph.checks).toEqual(['a', 'b']);
    await testGraph.executeAsync();
    expect(testGraph.checks).toEqual([]);

    // rebuild --to b: the retained results are current, but each operation is checked again.
    await testGraph.executeAsync(false);
    expect(testGraph.checks).toEqual(['a', 'b']);
    expect(testGraph.executions).toEqual([]);

    // The plugin no longer finds "b" up to date, so it runs without its previous result.
    upToDate.delete('b');
    await testGraph.executeAsync(false);
    expect(testGraph.checks).toEqual(['a', 'b']);
    expect(testGraph.executions).toEqual(['b']);
    expect(testGraph.incrementalExecutions).toEqual([]);

    const hotResult: IExecutionResult = await testGraph.executeAsync();
    expect(hotResult.status).toBe(OperationStatus.NoOp);
    expect(testGraph.checks).toEqual([]);
  });

  describe('with legacy skip detection', () => {
    let legacySkipFolder: string;

    beforeEach(() => {
      legacySkipFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-lib-legacy-skip-'));
    });

    afterEach(() => {
      fs.rmSync(legacySkipFolder, { recursive: true, force: true });
    });

    it('re-executes a retained result that was built against a dependency that has since been rebuilt', async () => {
      const testGraph: ITestGraph = await createTestGraphAsync({ a: [], b: ['a'] }, { legacySkipFolder });
      const a: Operation = testGraph.operations.get('a')!;
      await testGraph.executeAsync();
      expect(testGraph.executions).toEqual(['a', 'b']);

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

      const hotResult: IExecutionResult = await testGraph.executeAsync();
      expect(hotResult.status).toBe(OperationStatus.NoOp);
      expect(testGraph.executions).toEqual([]);
    });

    it('re-executes a consumer whose dependency was rebuilt by a request that did not select it', async () => {
      const testGraph: ITestGraph = await createTestGraphAsync({ b: [], c: ['b'] }, { legacySkipFolder });
      const c: Operation = testGraph.operations.get('c')!;
      await testGraph.executeAsync();

      // --to b, after editing "b"
      testGraph.localHashes.set('b', 'b-v2');
      c.enabled = false;
      await testGraph.executeAsync();
      expect(testGraph.executions).toEqual(['b']);

      // --to c: the files of "c" did not change, and "b" does not execute.
      c.enabled = true;
      await testGraph.executeAsync();
      expect(testGraph.executions).toEqual(['c']);
    });

    it('skips no operation of a non-incremental iteration', async () => {
      // Build once in another process, then start a long-lived graph.
      await (await createTestGraphAsync({ a: [], b: ['a'] }, { legacySkipFolder })).executeAsync();
      const testGraph: ITestGraph = await createTestGraphAsync({ a: [], b: ['a'] }, { legacySkipFolder });
      await testGraph.executeAsync(false);
      expect(testGraph.executions).toEqual(['a', 'b']);

      const hotResult: IExecutionResult = await testGraph.executeAsync();
      expect(hotResult.status).toBe(OperationStatus.NoOp);
      expect(testGraph.executions).toEqual([]);
    });

    it('still skips an unverified retained result if no dependency executes', async () => {
      // Build once in another process, then start a long-lived graph.
      await (await createTestGraphAsync({ a: [], b: ['a'] }, { legacySkipFolder })).executeAsync();
      const testGraph: ITestGraph = await createTestGraphAsync({ a: [], b: ['a'] }, { legacySkipFolder });
      const a: Operation = testGraph.operations.get('a')!;

      // --only b, after editing "b": "a" is not selected, so it is not verified in this graph.
      testGraph.localHashes.set('b', 'b-v2');
      a.enabled = false;
      await testGraph.executeAsync();
      expect(testGraph.executions).toEqual(['b']);

      // --to b: the legacy skip detection skips "a", and still skips "b".
      a.enabled = true;
      await testGraph.executeAsync();
      expect(testGraph.executions).toEqual([]);

      const hotResult: IExecutionResult = await testGraph.executeAsync();
      expect(hotResult.status).toBe(OperationStatus.NoOp);
      expect(testGraph.executions).toEqual([]);
    });

    it('reuses results that the legacy skip detection found up to date while their state hashes are unchanged', async () => {
      // Build once in another process, then start a long-lived graph.
      await (await createTestGraphAsync({ a: [], b: ['a'] }, { legacySkipFolder })).executeAsync();
      const testGraph: ITestGraph = await createTestGraphAsync({ a: [], b: ['a'] }, { legacySkipFolder });
      const result: IExecutionResult = await testGraph.executeAsync();
      expect(getStatuses(testGraph, result)).toEqual({ a: 'SKIPPED', b: 'SKIPPED' });
      expect(testGraph.executions).toEqual([]);

      // No iteration is scheduled.
      const hotResult: IExecutionResult = await testGraph.executeAsync();
      expect(hotResult.status).toBe(OperationStatus.NoOp);

      // Edit "b": "a" is not checked again.
      testGraph.localHashes.set('b', 'b-v2');
      const changedResult: IExecutionResult = await testGraph.executeAsync();
      expect(getStatuses(testGraph, changedResult)).toEqual({ a: 'silent', b: 'SUCCESS' });
      expect(testGraph.executions).toEqual(['b']);
    });

    it("forgets a dependency's change after the iteration, so a later rebuild keeps the records of consumers that it doesn't execute", async () => {
      // Like the engine of a daemon for "rush rebuild"
      const testGraph: ITestGraph = await createTestGraphAsync(
        { a: [], b: ['a'], x: [] },
        { legacySkipFolder, isIncrementalBuildAllowed: false }
      );
      const a: Operation = testGraph.operations.get('a')!;
      const b: Operation = testGraph.operations.get('b')!;
      const x: Operation = testGraph.operations.get('x')!;
      const recordPathOfB: string = path.join(legacySkipFolder, 'b', 'package-deps_b.json');
      await testGraph.executeAsync();
      expect([...testGraph.executions].sort()).toEqual(['a', 'b', 'x']);

      // --only a, after editing "a": "b" was built against the old outputs of "a", so its record is deleted.
      testGraph.localHashes.set('a', 'a-v2');
      b.enabled = false;
      x.enabled = false;
      await testGraph.executeAsync();
      expect(testGraph.executions).toEqual(['a']);
      expect(fs.existsSync(recordPathOfB)).toBe(false);

      // --only b
      a.enabled = false;
      b.enabled = true;
      await testGraph.executeAsync();
      expect(testGraph.executions).toEqual(['b']);
      expect(fs.existsSync(recordPathOfB)).toBe(true);

      // --only x, after editing "x": nothing that "b" depends on changed since "b" was built.
      testGraph.localHashes.set('x', 'x-v2');
      b.enabled = false;
      x.enabled = true;
      await testGraph.executeAsync();
      expect(testGraph.executions).toEqual(['x']);
      expect(fs.existsSync(recordPathOfB)).toBe(true);
    });

    it('keeps the records of operations that a rebuild iteration of a build engine does not execute, until a dependency changes', async () => {
      // Like the engine of a daemon for "rush build", which also runs "rush rebuild"
      const testGraph: ITestGraph = await createTestGraphAsync(
        { a: [], b: ['a'], x: [] },
        { legacySkipFolder }
      );
      const b: Operation = testGraph.operations.get('b')!;
      const x: Operation = testGraph.operations.get('x')!;
      const getRecordPath = (name: string): string =>
        path.join(legacySkipFolder, name, `package-deps_${name}.json`);
      await testGraph.executeAsync();
      expect([...testGraph.executions].sort()).toEqual(['a', 'b', 'x']);

      // rush rebuild --only a: "a" reproduces its outputs.
      b.enabled = false;
      x.enabled = false;
      await testGraph.executeAsync(false);
      expect(testGraph.executions).toEqual(['a']);
      expect(fs.existsSync(getRecordPath('b'))).toBe(true);
      expect(fs.existsSync(getRecordPath('x'))).toBe(true);

      // rush rebuild --only a, after editing "a": "b" was built against the old outputs of "a".
      testGraph.localHashes.set('a', 'a-v2');
      await testGraph.executeAsync(false);
      expect(testGraph.executions).toEqual(['a']);
      expect(fs.existsSync(getRecordPath('b'))).toBe(false);
      expect(fs.existsSync(getRecordPath('x'))).toBe(true);
    });
  });
});
