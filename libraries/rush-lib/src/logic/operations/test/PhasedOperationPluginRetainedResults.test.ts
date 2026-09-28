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
import type { IExecutionResult } from '../IOperationExecutionResult';

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

  public constructor(name: string, isNoOp: boolean, executions: string[]) {
    this.name = name;
    this.isNoOp = isNoOp;
    this.#executions = executions;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    if (this.isNoOp) {
      return OperationStatus.NoOp;
    }
    this.#executions.push(this.name);
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
  executeAsync(): Promise<IExecutionResult>;
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
}

/**
 * Creates a graph from the names of the dependencies of each operation, without the build cache.
 */
async function createTestGraphAsync(
  dependencies: Record<string, string[]>,
  options: ITestGraphOptions = {}
): Promise<ITestGraph> {
  const { noOps, legacySkipFolder } = options;
  const executions: string[] = [];
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
      runner: new MockRunner(name, !!noOps?.has(name), executions),
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
      isIncrementalBuildAllowed: true
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
    isIncrementalBuildAllowed: true,
    projectConfigurations: new Map()
  } as unknown as IOperationGraphContext);

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
    executeAsync: async () => {
      executions.length = 0;
      return await graph.executeAsync({ inputsSnapshot });
    }
  };
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

    it('still skips an unverified retained result if no dependency executes', async () => {
      // Build once in another process, then start a long-lived graph.
      await (await createTestGraphAsync({ a: [], b: ['a'] }, { legacySkipFolder })).executeAsync();
      const testGraph: ITestGraph = await createTestGraphAsync({ a: [], b: ['a'] }, { legacySkipFolder });
      await testGraph.executeAsync();
      expect(testGraph.executions).toEqual([]);

      // --to b, after editing "b": "a" is skipped, so it is not verified in this graph.
      testGraph.localHashes.set('b', 'b-v2');
      await testGraph.executeAsync();
      expect(testGraph.executions).toEqual(['b']);

      // --to b: the legacy skip detection still skips "b".
      await testGraph.executeAsync();
      expect(testGraph.executions).toEqual([]);
    });
  });
});
