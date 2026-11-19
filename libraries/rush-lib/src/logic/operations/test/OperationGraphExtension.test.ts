// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('../OperationStateFile');
// Mock project log file creation to avoid filesystem writes.
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

import type { CollatedTerminal } from '@rushstack/stream-collator';
import { MockWritable } from '@rushstack/terminal';

import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import type { IInputsSnapshot, IRushConfigurationProjectForSnapshot } from '../../incremental/InputsSnapshot';
import type {
  IConfigurableOperation,
  IExecutionResult,
  IOperationExecutionResult
} from '../IOperationExecutionResult';
import type { IOperationGraphExtensionResult, IOperationGraphIterationOptions } from '../IOperationGraph';
import { Operation } from '../Operation';
import { OperationGraph } from '../OperationGraph';
import { OperationStatus } from '../OperationStatus';
import { MockOperationRunner } from './MockOperationRunner';

const mockPhase: IPhase = {
  name: 'phase',
  allowWarningsOnSuccess: false,
  associatedParameters: new Set(),
  dependencies: {
    self: new Set(),
    upstream: new Set()
  },
  isSynthetic: false,
  logFilenameIdentifier: 'phase',
  missingScriptBehavior: 'silent'
};

function createSnapshot(localHashes: Record<string, string>): IInputsSnapshot {
  return {
    hashes: new Map(),
    rootDirectory: '/repo',
    hasUncommittedChanges: false,
    getTrackedFileHashesForOperation: () => new Map(),
    getOperationOwnStateHash: (project: IRushConfigurationProjectForSnapshot) =>
      localHashes[(project as RushConfigurationProject).packageName]
  };
}

/**
 * Lets the graph dispatch and complete whatever it can.
 */
async function settleAsync(): Promise<void> {
  for (let i: number = 0; i < 20; i++) {
    await new Promise((resolve: (value: unknown) => void) => setImmediate(resolve));
  }
}

async function waitForAsync(condition: () => boolean): Promise<void> {
  for (let i: number = 0; i < 100; i++) {
    if (condition()) {
      return;
    }
    await new Promise((resolve: (value: unknown) => void) => setImmediate(resolve));
  }
  throw new Error('The condition was not met');
}

interface IGraphOptions {
  readonly edges?: readonly [consumer: string, dependency: string][];
  readonly enabled?: readonly string[];
  readonly parallelism?: number;
  readonly weights?: Readonly<Record<string, number>>;
}

/**
 * A graph of operations whose runners run until the test finishes them.
 */
class TestGraph {
  public readonly graph: OperationGraph;
  public readonly started: string[] = [];
  public records: ReadonlyMap<Operation, IOperationExecutionResult> | undefined;
  readonly #operations: Map<string, Operation> = new Map();
  readonly #finishers: Map<string, () => void> = new Map();
  readonly #finished: Set<string> = new Set();

  public constructor(names: readonly string[], options: IGraphOptions = {}) {
    const { edges = [], enabled = names, parallelism = 4, weights = {} } = options;
    for (const name of names) {
      const weight: number | undefined = weights[name];
      this.#operations.set(
        name,
        new Operation({
          runner: new MockOperationRunner(name, async (terminal: CollatedTerminal) => {
            this.started.push(name);
            terminal.writeStdoutLine(`${name} started`);
            if (!this.#finished.has(name)) {
              await new Promise<void>((resolve: () => void) => this.#finishers.set(name, resolve));
            }
            return OperationStatus.Success;
          }),
          logFilenameIdentifier: name,
          phase: mockPhase,
          project: { packageName: name } as unknown as RushConfigurationProject,
          settings: weight === undefined ? undefined : { operationName: mockPhase.name, weight },
          enabled: enabled.includes(name)
        })
      );
    }
    for (const [consumer, dependency] of edges) {
      this.operation(consumer).addDependency(this.operation(dependency));
    }

    this.graph = new OperationGraph(new Set(this.#operations.values()), {
      quietMode: true,
      debugMode: false,
      parallelism,
      allowOversubscription: false,
      destinations: [new MockWritable()],
      abortController: new AbortController()
    });
    this.graph.hooks.beforeExecuteIterationAsync.tap('test', (records) => {
      this.records = records;
    });
  }

  public operation(name: string): Operation {
    return this.#operations.get(name)!;
  }

  public record(name: string): IOperationExecutionResult {
    return this.records!.get(this.operation(name))!;
  }

  public async startedAsync(name: string): Promise<void> {
    await waitForAsync(() => this.started.includes(name));
  }

  public finish(name: string): void {
    this.#finished.add(name);
    this.#finishers.get(name)?.();
  }

  public block(name: string): void {
    this.#finished.delete(name);
  }

  public finishAll(): void {
    for (const name of this.#operations.keys()) {
      this.finish(name);
    }
  }

  public getStatuses(result: IExecutionResult): Record<string, OperationStatus> {
    const statuses: Record<string, OperationStatus> = {};
    for (const [operation, record] of result.operationResults) {
      statuses[operation.name] = record.status;
    }
    return statuses;
  }
}

async function getStateHashesAsync(
  names: readonly string[],
  edges: IGraphOptions['edges'],
  inputsSnapshot: IInputsSnapshot
): Promise<Record<string, string>> {
  const testGraph: TestGraph = new TestGraph(names, { edges });
  testGraph.finishAll();
  const result: IExecutionResult = await testGraph.graph.executeAsync({ inputsSnapshot });
  expect(result.status).toBe(OperationStatus.Success);
  const hashes: Record<string, string> = {};
  for (const [operation, record] of result.operationResults) {
    hashes[operation.name] = record.getStateHash();
  }
  return hashes;
}

describe('OperationGraph iteration extension', () => {
  const snapshotB: IInputsSnapshot = createSnapshot({ a: 'a1', b: 'b1', c: 'c1', d: 'd1', e: 'e1', x: 'x1' });

  it('holds the operations that no enabled operation needs until the others complete', async () => {
    const testGraph: TestGraph = new TestGraph(['a', 'b', 'c'], { edges: [['b', 'a']], enabled: ['a'] });
    const resultPromise: Promise<IExecutionResult> = testGraph.graph.executeAsync({
      inputsSnapshot: snapshotB,
      holdUnneededOperations: true
    });

    await testGraph.startedAsync('a');
    await settleAsync();
    expect(testGraph.record('c').status).toBe(OperationStatus.Ready);

    testGraph.finish('a');
    const result: IExecutionResult = await resultPromise;
    expect(testGraph.getStatuses(result)).toEqual({
      a: OperationStatus.Success,
      b: OperationStatus.Skipped,
      c: OperationStatus.Skipped
    });
  });

  it('dispatches the held operations when a retained iteration is aborted', async () => {
    const testGraph: TestGraph = new TestGraph(['a', 'c'], { enabled: ['a'] });
    const resultPromise: Promise<IExecutionResult> = testGraph.graph.executeAsync({
      inputsSnapshot: snapshotB,
      holdUnneededOperations: true
    });
    await testGraph.startedAsync('a');
    expect(testGraph.graph.retainHeldOperations()).toBeInstanceOf(Function);

    const abortPromise: Promise<void> = testGraph.graph.abortCurrentIterationAsync();
    expect(testGraph.graph.retainHeldOperations()).toBeUndefined();
    testGraph.finish('a');
    await abortPromise;
    const result: IExecutionResult = await resultPromise;
    expect(testGraph.getStatuses(result)).toEqual({
      a: OperationStatus.Success,
      c: OperationStatus.Aborted
    });
  });

  it('extends the iteration with the operations that a joining request needs', async () => {
    const names: string[] = ['a', 'b', 'c', 'd'];
    const edges: [string, string][] = [
      ['b', 'a'],
      ['d', 'c']
    ];
    const testGraph: TestGraph = new TestGraph(names, { edges, enabled: ['a'] });
    const { graph } = testGraph;
    const plans: IOperationGraphIterationOptions[] = [];
    graph.hooks.configureIteration.tap('test', (records, lastStates, iterationOptions) => {
      plans.push(iterationOptions);
    });
    const extensions: [string[], IOperationGraphIterationOptions][] = [];
    graph.hooks.extendIteration.tap('test', (records, iterationOptions) => {
      extensions.push([
        Array.from(records.keys(), (operation: Operation) => operation.name),
        iterationOptions
      ]);
    });
    const totalOperationsByName: Record<string, number> = {};
    graph.eventSink = {
      onOperationHeader: (name: string, completedOperations: number, totalOperations: number) => {
        totalOperationsByName[name] = totalOperations;
      }
    };

    const resultPromise: Promise<IExecutionResult> = graph.executeAsync({
      inputsSnapshot: snapshotB,
      holdUnneededOperations: true
    });
    await testGraph.startedAsync('a');
    const hashesBefore: Record<string, string> = {};
    for (const name of names) {
      hashesBefore[name] = testGraph.record(name).getStateHash();
    }

    // The own inputs of "a", which is executing, and "c" changed
    const snapshotA: IInputsSnapshot = createSnapshot({ a: 'a2', b: 'b1', c: 'c2', d: 'd1' });
    testGraph.operation('c').enabled = true;
    testGraph.operation('d').enabled = true;
    const extension: IOperationGraphExtensionResult = graph.tryExtendCurrentIteration({
      inputsSnapshot: snapshotA,
      neededOperations: [testGraph.operation('d')]
    });
    expect(extension).toEqual({
      extended: true,
      changedOperations: new Set([testGraph.operation('c'), testGraph.operation('d')])
    });

    expect(plans).toHaveLength(2);
    expect(plans[1].inputsSnapshot).toBe(snapshotA);
    expect(plans[1].startedOperations).toEqual(new Set([testGraph.operation('a')]));
    expect(extensions).toHaveLength(1);
    expect(extensions[0][0].sort()).toEqual(['c', 'd']);
    expect(extensions[0][1].inputsSnapshot).toBe(snapshotA);

    // The executing operation keeps its state hash, and so does its held consumer, whose own inputs did not change
    expect(testGraph.record('a').getStateHash()).toBe(hashesBefore.a);
    expect(testGraph.record('b').getStateHash()).toBe(hashesBefore.b);
    // The others are hashed as a new iteration would hash them
    const expectedHashes: Record<string, string> = await getStateHashesAsync(names, edges, snapshotA);
    expect(testGraph.record('c').getStateHash()).toBe(expectedHashes.c);
    expect(testGraph.record('d').getStateHash()).toBe(expectedHashes.d);
    expect(expectedHashes.c).not.toBe(hashesBefore.c);

    await testGraph.startedAsync('c');
    testGraph.finish('c');
    await testGraph.startedAsync('d');
    testGraph.finish('d');
    testGraph.finish('a');
    const result: IExecutionResult = await resultPromise;
    expect(testGraph.getStatuses(result)).toEqual({
      a: OperationStatus.Success,
      b: OperationStatus.Skipped,
      c: OperationStatus.Success,
      d: OperationStatus.Success
    });
    expect(graph.resultByOperation.get(testGraph.operation('d'))?.getStateHash()).toBe(expectedHashes.d);
    // The operations that joined count towards the total
    expect(totalOperationsByName).toEqual({ a: 1, c: 3, d: 3 });
  });

  it('plans the extension without the results that the request invalidates', async () => {
    const testGraph: TestGraph = new TestGraph(['a', 'c']);
    const { graph } = testGraph;
    testGraph.finishAll();
    await graph.executeAsync({ inputsSnapshot: snapshotB });
    const lastResultOfC: IOperationExecutionResult = graph.resultByOperation.get(testGraph.operation('c'))!;

    const lastStatesOfPlans: ReadonlyMap<Operation, IOperationExecutionResult>[] = [];
    graph.hooks.configureIteration.tap('test', (records, lastStates) => {
      lastStatesOfPlans.push(new Map(lastStates));
    });
    const invalidated: string[] = [];
    graph.hooks.onInvalidateOperations.tap('test', (operations: Iterable<Operation>, reason?: string) => {
      invalidated.push(...Array.from(operations, (operation: Operation) => `${operation.name}: ${reason}`));
    });
    testGraph.block('a');
    testGraph.operation('c').enabled = false;
    const resultPromise: Promise<IExecutionResult> = graph.executeAsync({
      inputsSnapshot: snapshotB,
      holdUnneededOperations: true
    });
    await waitForAsync(() => testGraph.started.length === 3);

    testGraph.operation('c').enabled = true;
    expect(
      graph.tryExtendCurrentIteration({
        inputsSnapshot: snapshotB,
        neededOperations: [testGraph.operation('c')],
        invalidatedOperations: [testGraph.operation('c')],
        invalidationReason: 'the request changed it'
      }).extended
    ).toBe(true);

    expect(lastStatesOfPlans).toHaveLength(2);
    expect(lastStatesOfPlans[1].has(testGraph.operation('a'))).toBe(true);
    expect(lastStatesOfPlans[1].has(testGraph.operation('c'))).toBe(false);
    expect(invalidated).toEqual(['c: the request changed it']);
    expect(lastResultOfC.status).toBe(OperationStatus.Ready);

    testGraph.finish('a');
    const result: IExecutionResult = await resultPromise;
    expect(testGraph.getStatuses(result)).toEqual({ a: OperationStatus.Success, c: OperationStatus.Success });
  });

  it('dispatches the operations of the joining request first', async () => {
    // Without a preference, "e" would go first, since it starts the longer chain
    const testGraph: TestGraph = new TestGraph(['a', 'c', 'e'], {
      edges: [['e', 'a']],
      enabled: ['a', 'e'],
      parallelism: 1,
      weights: { e: 10 }
    });
    const { graph } = testGraph;
    const resultPromise: Promise<IExecutionResult> = graph.executeAsync({
      inputsSnapshot: snapshotB,
      holdUnneededOperations: true
    });
    await testGraph.startedAsync('a');

    testGraph.operation('c').enabled = true;
    expect(
      graph.tryExtendCurrentIteration({
        inputsSnapshot: snapshotB,
        neededOperations: [testGraph.operation('c')]
      }).extended
    ).toBe(true);

    testGraph.finishAll();
    expect((await resultPromise).status).toBe(OperationStatus.Success);
    expect(testGraph.started).toEqual(['a', 'c', 'e']);
  });

  it('does not disable operations that the iteration enabled', async () => {
    const testGraph: TestGraph = new TestGraph(['a', 'c', 'e'], {
      edges: [['e', 'a']],
      enabled: ['a', 'e']
    });
    const { graph } = testGraph;
    graph.hooks.configureIteration.tap(
      'test',
      (
        records: ReadonlyMap<Operation, IConfigurableOperation>,
        lastStates: ReadonlyMap<Operation, IOperationExecutionResult>,
        iterationOptions: IOperationGraphIterationOptions
      ) => {
        if (iterationOptions.startedOperations) {
          // The plan of the extension would not run the operations of the iteration
          for (const record of records.values()) {
            record.enabled = record.operation.name === 'c';
          }
        }
      }
    );
    const resultPromise: Promise<IExecutionResult> = graph.executeAsync({
      inputsSnapshot: snapshotB,
      holdUnneededOperations: true
    });
    await testGraph.startedAsync('a');

    testGraph.operation('c').enabled = true;
    expect(
      graph.tryExtendCurrentIteration({
        inputsSnapshot: snapshotB,
        neededOperations: [testGraph.operation('c')]
      }).extended
    ).toBe(true);
    testGraph.finishAll();
    expect(testGraph.getStatuses(await resultPromise)).toEqual({
      a: OperationStatus.Success,
      c: OperationStatus.Success,
      e: OperationStatus.Success
    });
  });

  it('aborts the iteration if an extendIteration tap throws', async () => {
    const testGraph: TestGraph = new TestGraph(['a', 'c'], { enabled: ['a'] });
    const { graph } = testGraph;
    graph.hooks.extendIteration.tap('test', () => {
      throw new Error('The tap failed');
    });
    const resultPromise: Promise<IExecutionResult> = graph.executeAsync({
      inputsSnapshot: snapshotB,
      holdUnneededOperations: true
    });
    await testGraph.startedAsync('a');

    testGraph.operation('c').enabled = true;
    expect(() =>
      graph.tryExtendCurrentIteration({
        inputsSnapshot: snapshotB,
        neededOperations: [testGraph.operation('c')]
      })
    ).toThrow('The tap failed');
    testGraph.finish('a');
    const result: IExecutionResult = await resultPromise;
    expect(testGraph.started).toEqual(['a']);
    expect(testGraph.getStatuses(result).c).toBe(OperationStatus.Aborted);
  });

  it('calls beforeCommit once, after it plans the extension and before it changes the iteration', async () => {
    const testGraph: TestGraph = new TestGraph(['a', 'c'], { enabled: ['a'] });
    const { graph } = testGraph;
    const calls: string[] = [];
    graph.hooks.configureIteration.tap('test', (records, lastStates, iterationOptions) => {
      calls.push(iterationOptions.startedOperations ? 'plan the extension' : 'plan the iteration');
    });
    graph.hooks.extendIteration.tap('test', () => {
      calls.push('extend');
    });
    const resultPromise: Promise<IExecutionResult> = graph.executeAsync({
      inputsSnapshot: snapshotB,
      holdUnneededOperations: true
    });
    await testGraph.startedAsync('a');

    testGraph.operation('c').enabled = true;
    expect(
      graph.tryExtendCurrentIteration({
        inputsSnapshot: snapshotB,
        neededOperations: [testGraph.operation('c')],
        beforeCommit: () => {
          const { enabled, status } = testGraph.record('c');
          calls.push(`before commit: c is ${enabled ? 'enabled' : 'disabled'} and ${status}`);
        }
      }).extended
    ).toBe(true);
    expect(calls).toEqual([
      'plan the iteration',
      'plan the extension',
      `before commit: c is disabled and ${OperationStatus.Ready}`,
      'extend'
    ]);

    testGraph.finishAll();
    expect(testGraph.getStatuses(await resultPromise)).toEqual({
      a: OperationStatus.Success,
      c: OperationStatus.Success
    });
  });

  it('leaves the iteration unchanged if beforeCommit throws', async () => {
    const testGraph: TestGraph = new TestGraph(['a', 'c'], { enabled: ['a'] });
    const { graph } = testGraph;
    const extensions: unknown[] = [];
    graph.hooks.extendIteration.tap('test', (records) => {
      extensions.push(records);
    });
    const resultPromise: Promise<IExecutionResult> = graph.executeAsync({
      inputsSnapshot: snapshotB,
      holdUnneededOperations: true
    });
    await testGraph.startedAsync('a');
    const getStateHashes = (): string[] =>
      Array.from(testGraph.records!.values(), (record: IOperationExecutionResult) => record.getStateHash());
    const hashes: string[] = getStateHashes();

    testGraph.operation('c').enabled = true;
    expect(() =>
      graph.tryExtendCurrentIteration({
        // The own inputs of "c" changed, so an extension would change its state hash
        inputsSnapshot: createSnapshot({ a: 'a1', c: 'c2' }),
        neededOperations: [testGraph.operation('c')],
        beforeCommit: () => {
          throw new Error('The request cannot start');
        }
      })
    ).toThrow('The request cannot start');
    expect(extensions).toHaveLength(0);
    expect(testGraph.record('c').enabled).toBe(false);
    expect(getStateHashes()).toEqual(hashes);

    // As the caller restores the enabled states
    testGraph.operation('c').enabled = false;
    testGraph.finishAll();
    const result: IExecutionResult = await resultPromise;
    expect(testGraph.started).toEqual(['a']);
    expect(testGraph.getStatuses(result)).toEqual({
      a: OperationStatus.Success,
      c: OperationStatus.Skipped
    });
  });

  describe('refuses', () => {
    async function expectRefusalAsync(
      testGraph: TestGraph,
      iterationOptions: IOperationGraphIterationOptions,
      getExtensionAsync: (beforeCommit: () => void) => Promise<IOperationGraphExtensionResult>,
      reason: RegExp
    ): Promise<void> {
      const { graph } = testGraph;
      const extensions: unknown[] = [];
      graph.hooks.extendIteration.tap('test', (records) => {
        extensions.push(records);
      });
      const resultPromise: Promise<IExecutionResult> = graph.executeAsync(iterationOptions);
      await testGraph.startedAsync('a');
      const getStateHashes = (): string[] =>
        iterationOptions.inputsSnapshot
          ? Array.from(testGraph.records!.values(), (record: IOperationExecutionResult) =>
              record.getStateHash()
            )
          : [];
      const hashes: string[] = getStateHashes();

      const beforeCommit: jest.Mock<void, []> = jest.fn();
      const extension: IOperationGraphExtensionResult = await getExtensionAsync(beforeCommit);
      expect(extension.extended).toBe(false);
      expect(extension.reason).toMatch(reason);
      expect(beforeCommit).not.toHaveBeenCalled();
      expect(extensions).toHaveLength(0);
      expect(getStateHashes()).toEqual(hashes);

      testGraph.finishAll();
      expect((await resultPromise).status).toBe(OperationStatus.Success);
    }

    it('when no iteration executes', () => {
      const testGraph: TestGraph = new TestGraph(['a']);
      expect(
        testGraph.graph.tryExtendCurrentIteration({
          inputsSnapshot: snapshotB,
          neededOperations: [testGraph.operation('a')]
        }).reason
      ).toMatch(/No iteration is dispatching/);
    });

    it('before the iteration dispatches operations', async () => {
      const testGraph: TestGraph = new TestGraph(['a', 'c'], { enabled: ['a'] });
      const extensions: IOperationGraphExtensionResult[] = [];
      testGraph.graph.hooks.beforeExecuteIterationAsync.tap('test', () => {
        extensions.push(
          testGraph.graph.tryExtendCurrentIteration({
            inputsSnapshot: snapshotB,
            neededOperations: [testGraph.operation('c')]
          })
        );
      });
      testGraph.finishAll();
      await testGraph.graph.executeAsync({ inputsSnapshot: snapshotB, holdUnneededOperations: true });
      expect(extensions).toHaveLength(1);
      expect(extensions[0].reason).toMatch(/No iteration is dispatching/);
    });

    it('if the iteration does not hold operations', async () => {
      const testGraph: TestGraph = new TestGraph(['a', 'c'], { enabled: ['a'] });
      await expectRefusalAsync(
        testGraph,
        { inputsSnapshot: snapshotB },
        async (beforeCommit: () => void) =>
          testGraph.graph.tryExtendCurrentIteration({
            inputsSnapshot: snapshotB,
            neededOperations: [testGraph.operation('c')],
            beforeCommit
          }),
        /No iteration is dispatching/
      );
    });

    it('if the iteration was aborted', async () => {
      const testGraph: TestGraph = new TestGraph(['a', 'c'], { enabled: ['a'] });
      const { graph } = testGraph;
      const resultPromise: Promise<IExecutionResult> = graph.executeAsync({
        inputsSnapshot: snapshotB,
        holdUnneededOperations: true
      });
      await testGraph.startedAsync('a');
      const abortPromise: Promise<void> = graph.abortCurrentIterationAsync();
      expect(
        graph.tryExtendCurrentIteration({
          inputsSnapshot: snapshotB,
          neededOperations: [testGraph.operation('c')]
        }).reason
      ).toMatch(/aborted/);
      testGraph.finishAll();
      await abortPromise;
      await resultPromise;
    });

    it('if the iteration is not incremental', async () => {
      const testGraph: TestGraph = new TestGraph(['a', 'c'], { enabled: ['a'] });
      await expectRefusalAsync(
        testGraph,
        { inputsSnapshot: snapshotB, holdUnneededOperations: true, isIncrementalBuildAllowed: false },
        async (beforeCommit: () => void) =>
          testGraph.graph.tryExtendCurrentIteration({
            inputsSnapshot: snapshotB,
            neededOperations: [testGraph.operation('c')],
            beforeCommit
          }),
        /not incremental/
      );
    });

    it('if the iteration has no inputs snapshot', async () => {
      const testGraph: TestGraph = new TestGraph(['a', 'c'], { enabled: ['a'] });
      await expectRefusalAsync(
        testGraph,
        { holdUnneededOperations: true },
        async (beforeCommit: () => void) =>
          testGraph.graph.tryExtendCurrentIteration({
            inputsSnapshot: snapshotB,
            neededOperations: [testGraph.operation('c')],
            beforeCommit
          }),
        /no inputs snapshot/
      );
    });

    it('if the inputs of a started operation that the request needs changed', async () => {
      const testGraph: TestGraph = new TestGraph(['a', 'b'], { edges: [['b', 'a']], enabled: ['a'] });
      await expectRefusalAsync(
        testGraph,
        { inputsSnapshot: snapshotB, holdUnneededOperations: true },
        async (beforeCommit: () => void) => {
          testGraph.operation('b').enabled = true;
          return testGraph.graph.tryExtendCurrentIteration({
            inputsSnapshot: createSnapshot({ a: 'a2', b: 'b1' }),
            neededOperations: [testGraph.operation('b')],
            beforeCommit
          });
        },
        /"a" started before its inputs or outputs changed/
      );
    });

    it('if the request invalidates a started operation that it needs', async () => {
      const testGraph: TestGraph = new TestGraph(['a', 'b'], { edges: [['b', 'a']], enabled: ['a'] });
      await expectRefusalAsync(
        testGraph,
        { inputsSnapshot: snapshotB, holdUnneededOperations: true },
        async (beforeCommit: () => void) => {
          testGraph.operation('b').enabled = true;
          return testGraph.graph.tryExtendCurrentIteration({
            inputsSnapshot: snapshotB,
            neededOperations: [testGraph.operation('b')],
            invalidatedOperations: [testGraph.operation('a')],
            beforeCommit
          });
        },
        /"a" started before its inputs or outputs changed/
      );
    });

    it('if the request invalidates an operation that ran in the iteration', async () => {
      const testGraph: TestGraph = new TestGraph(['a', 'c', 'x'], { enabled: ['a', 'x'] });
      testGraph.finish('x');
      await expectRefusalAsync(
        testGraph,
        { inputsSnapshot: snapshotB, holdUnneededOperations: true },
        async (beforeCommit: () => void) => {
          await waitForAsync(() => testGraph.record('x').status === OperationStatus.Success);
          testGraph.operation('c').enabled = true;
          return testGraph.graph.tryExtendCurrentIteration({
            inputsSnapshot: snapshotB,
            neededOperations: [testGraph.operation('c')],
            invalidatedOperations: [testGraph.operation('x')],
            beforeCommit
          });
        },
        /"x" was invalidated after it ran in the iteration/
      );
    });

    it('if an operation that the request needs to run was dispatched without running', async () => {
      const testGraph: TestGraph = new TestGraph(['a', 'x'], { edges: [['a', 'x']], enabled: ['a'] });
      await expectRefusalAsync(
        testGraph,
        { inputsSnapshot: snapshotB, holdUnneededOperations: true },
        async (beforeCommit: () => void) => {
          expect(testGraph.record('x').status).toBe(OperationStatus.Skipped);
          testGraph.operation('x').enabled = true;
          return testGraph.graph.tryExtendCurrentIteration({
            inputsSnapshot: snapshotB,
            neededOperations: [testGraph.operation('x')],
            beforeCommit
          });
        },
        /"x" needs to run, but was dispatched without running/
      );
    });
  });
});
