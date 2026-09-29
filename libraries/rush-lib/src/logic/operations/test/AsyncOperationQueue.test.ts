// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Operation } from '../Operation';
import { type IOperationExecutionRecordContext, OperationExecutionRecord } from '../OperationExecutionRecord';
import { MockOperationRunner } from './MockOperationRunner';
import { AsyncOperationQueue, type IOperationSortFunction } from '../AsyncOperationQueue';
import { OperationStatus } from '../OperationStatus';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import type { IPhase } from '../../../api/CommandLineConfiguration';

function addDependency(consumer: OperationExecutionRecord, dependency: OperationExecutionRecord): void {
  consumer.dependencies.add(dependency);
  dependency.consumers.add(consumer);
  consumer.status = OperationStatus.Waiting;
}

function nullSort(a: OperationExecutionRecord, b: OperationExecutionRecord): number {
  return 0;
}

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
const projectsByName: Map<string, RushConfigurationProject> = new Map();
function getOrCreateProject(name: string): RushConfigurationProject {
  let project: RushConfigurationProject | undefined = projectsByName.get(name);
  if (!project) {
    project = {
      packageName: name
    } as unknown as RushConfigurationProject;
    projectsByName.set(name, project);
  }
  return project;
}

function createRecord(name: string, weight?: number): OperationExecutionRecord {
  return new OperationExecutionRecord(
    new Operation({
      runner: new MockOperationRunner(name),
      logFilenameIdentifier: 'operation',
      phase: mockPhase,
      project: getOrCreateProject(name),
      settings: weight === undefined ? undefined : { operationName: mockPhase.name, weight }
    }),
    { maxParallelism: 10 } as unknown as IOperationExecutionRecordContext
  );
}

const criticalPathSort: IOperationSortFunction = (
  a: OperationExecutionRecord,
  b: OperationExecutionRecord
): number => {
  return a.criticalPathLength! - b.criticalPathLength!;
};

function getPermutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) {
    return [items.slice()];
  }
  const permutations: T[][] = [];
  for (let i: number = 0; i < items.length; i++) {
    const rest: T[] = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const permutation of getPermutations(rest)) {
      permutations.push([items[i], ...permutation]);
    }
  }
  return permutations;
}

/**
 * Creates a record for each entry of `weights`, adds each `[consumer, dependency]` edge, and returns the records.
 */
function createGraph(
  weights: Record<string, number>,
  edges: readonly [consumer: string, dependency: string][]
): Map<string, OperationExecutionRecord> {
  const records: Map<string, OperationExecutionRecord> = new Map();
  for (const [name, weight] of Object.entries(weights)) {
    records.set(name, createRecord(name, weight));
  }
  for (const [consumer, dependency] of edges) {
    addDependency(records.get(consumer)!, records.get(dependency)!);
  }
  return records;
}

describe(AsyncOperationQueue.name, () => {
  it('iterates operations in topological order', async () => {
    const operations = [createRecord('a'), createRecord('b'), createRecord('c'), createRecord('d')];

    addDependency(operations[0], operations[2]);
    addDependency(operations[3], operations[1]);
    addDependency(operations[1], operations[0]);

    const expectedOrder = [operations[2], operations[0], operations[1], operations[3]];
    const actualOrder = [];
    const queue: AsyncOperationQueue = new AsyncOperationQueue(operations, nullSort);
    for await (const operation of queue) {
      actualOrder.push(operation);
      operation.status = OperationStatus.Success;
      queue.complete(operation);
    }

    expect(actualOrder).toEqual(expectedOrder);
  });

  it('respects the sort predicate', async () => {
    const operations = [createRecord('a'), createRecord('b'), createRecord('c'), createRecord('d')];

    const expectedOrder = [operations[2], operations[0], operations[1], operations[3]];
    const actualOrder = [];
    const customSort: IOperationSortFunction = (
      a: OperationExecutionRecord,
      b: OperationExecutionRecord
    ): number => {
      return expectedOrder.indexOf(b) - expectedOrder.indexOf(a);
    };

    const queue: AsyncOperationQueue = new AsyncOperationQueue(operations, customSort);
    for await (const operation of queue) {
      actualOrder.push(operation);
      operation.status = OperationStatus.Success;
      queue.complete(operation);
    }

    expect(actualOrder).toEqual(expectedOrder);
  });

  it('detects cycles', async () => {
    const operations = [createRecord('a'), createRecord('b'), createRecord('c'), createRecord('d')];

    addDependency(operations[0], operations[2]);
    addDependency(operations[2], operations[3]);
    addDependency(operations[3], operations[1]);
    addDependency(operations[1], operations[0]);

    expect(() => {
      new AsyncOperationQueue(operations, nullSort);
    }).toThrowErrorMatchingSnapshot();
  });

  it('handles concurrent iteration', async () => {
    const operations = [
      createRecord('a'),
      createRecord('b'),
      createRecord('c'),
      createRecord('d'),
      createRecord('e')
    ];

    // Set up to allow (0,1) -> (2) -> (3,4)
    addDependency(operations[2], operations[0]);
    addDependency(operations[2], operations[1]);
    addDependency(operations[3], operations[2]);
    addDependency(operations[4], operations[2]);

    const expectedConcurrency = new Map([
      [operations[0], 2],
      [operations[1], 2],
      [operations[2], 1],
      [operations[3], 2],
      [operations[4], 2]
    ]);

    const actualConcurrency: Map<OperationExecutionRecord, number> = new Map();
    const queue: AsyncOperationQueue = new AsyncOperationQueue(operations, nullSort);
    let concurrency: number = 0;

    // Use 3 concurrent iterators to verify that it handles having more than the operation concurrency
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        for await (const operation of queue) {
          ++concurrency;
          await Promise.resolve();

          actualConcurrency.set(operation, concurrency);

          await Promise.resolve();

          --concurrency;
          operation.status = OperationStatus.Success;
          queue.complete(operation);
        }
      })
    );

    for (const [operation, operationConcurrency] of expectedConcurrency) {
      expect(actualConcurrency.get(operation)).toEqual(operationConcurrency);
    }
  });

  it('handles an empty queue', async () => {
    const operations: OperationExecutionRecord[] = [];

    const queue: AsyncOperationQueue = new AsyncOperationQueue(operations, nullSort);
    const iterator: AsyncIterator<OperationExecutionRecord> = queue[Symbol.asyncIterator]();
    const result: IteratorResult<OperationExecutionRecord> = await iterator.next();
    expect(result.done).toEqual(true);
  });

  it('sorts cobuild retries after untried operations', async () => {
    // Three independent operations: A, B, C (all Ready).
    // A is assigned first, then returns to Ready (cobuild lock failed).
    // On the next pass, B and C should be assigned before A because A
    // has a recent lastAssignedAt timestamp.
    const opA = createRecord('a');
    const opB = createRecord('b');
    const opC = createRecord('c');

    const queue: AsyncOperationQueue = new AsyncOperationQueue([opA, opB, opC], nullSort);

    // Assign one operation
    const r1: IteratorResult<OperationExecutionRecord> = await queue.next();
    const firstAssigned: OperationExecutionRecord = r1.value;

    // Simulate cobuild retry: operation returns to Ready
    firstAssigned.status = OperationStatus.Ready;

    // Assign all three - untried operations should come before the retry
    const results: OperationExecutionRecord[] = [];
    for await (const item of queue) {
      results.push(item);
      queue.complete(item);
    }

    // The cobuild retry should be last
    expect(results[2]).toBe(firstAssigned);
  });

  it('assigns freshly unblocked operations before cobuild retries', async () => {
    // A (no deps), B (depends on C), C (no deps)
    // A is assigned and returns to Ready (cobuild retry).
    // C completes, unblocking B. B should be assigned before A.
    const opA = createRecord('a');
    const opB = createRecord('b');
    const opC = createRecord('c');

    addDependency(opB, opC);

    const queue: AsyncOperationQueue = new AsyncOperationQueue([opA, opB, opC], nullSort);

    // Pull both initially ready operations (A and C)
    const r1: IteratorResult<OperationExecutionRecord> = await queue.next();
    const r2: IteratorResult<OperationExecutionRecord> = await queue.next();
    expect(new Set([r1.value, r2.value])).toEqual(new Set([opA, opC]));

    // Simulate: A fails cobuild lock and returns to Ready
    opA.status = OperationStatus.Ready;

    // C succeeds, which unblocks B
    opC.status = OperationStatus.Success;
    queue.complete(opC);

    // B is freshly unblocked (never assigned), A is a cobuild retry - B should be first
    const r3: IteratorResult<OperationExecutionRecord> = await queue.next();
    expect(r3.value).toBe(opB);

    const r4: IteratorResult<OperationExecutionRecord> = await queue.next();
    expect(r4.value).toBe(opA);

    // Complete remaining
    opA.status = OperationStatus.Success;
    queue.complete(opA);
    opB.status = OperationStatus.Success;
    queue.complete(opB);

    const rEnd: IteratorResult<OperationExecutionRecord> = await queue.next();
    expect(rEnd.done).toBe(true);
  });

  it('keeps the order of the remaining operations when it removes finished operations', async () => {
    const operations: OperationExecutionRecord[] = [];
    for (let i: number = 0; i < 10; i++) {
      operations.push(createRecord(`r${i}`));
    }
    const queue: AsyncOperationQueue = new AsyncOperationQueue(operations, nullSort);
    for (let i: number = 1; i < operations.length; i += 2) {
      operations[i].status = OperationStatus.Skipped;
    }

    const actualOrder: string[] = [];
    for await (const operation of queue) {
      actualOrder.push(operation.name);
      operation.status = OperationStatus.Success;
      queue.complete(operation);
    }

    // Without a preference, the ready operations are assigned from the end of the queue
    expect(actualOrder).toEqual(['r8', 'r6', 'r4', 'r2', 'r0']);
  });

  it('stops scanning the queue once it has found a new operation for each waiting iterator', async () => {
    const a: OperationExecutionRecord = createRecord('a');
    const b: OperationExecutionRecord = createRecord('b');
    const queue: AsyncOperationQueue = new AsyncOperationQueue([a, b], nullSort);

    // The queue is scanned from its end, so "b" is found before "a"
    let status: OperationStatus = a.status;
    let isStatusRead: boolean = false;
    Object.defineProperty(a, 'status', {
      get: () => {
        isStatusRead = true;
        return status;
      },
      set: (value: OperationStatus) => {
        status = value;
      }
    });

    expect((await queue.next()).value).toBe(b);
    expect(isStatusRead).toBe(false);

    expect((await queue.next()).value).toBe(a);
    expect(isStatusRead).toBe(true);
  });

  describe('critical path length', () => {
    // An operation's length is the total weight of the longest chain from it to an operation with no consumers,
    // including its own weight. It must not depend on the order in which the operations are visited.
    it.each([
      {
        title: 'a chain',
        weights: { a: 1, b: 1, c: 1 },
        edges: [
          ['c', 'b'],
          ['b', 'a']
        ],
        expected: { a: 3, b: 2, c: 1 }
      },
      {
        title: 'a diamond',
        weights: { a: 1, b: 1, c: 1, d: 1 },
        edges: [
          ['b', 'a'],
          ['c', 'a'],
          ['d', 'b'],
          ['d', 'c']
        ],
        expected: { a: 3, b: 2, c: 2, d: 1 }
      },
      {
        title: 'a weighted fork',
        weights: { a: 2, b: 3, c: 1, d: 5 },
        edges: [
          ['c', 'b'],
          ['b', 'a'],
          ['d', 'a']
        ],
        expected: { a: 7, b: 4, c: 1, d: 5 }
      }
    ] as {
      title: string;
      weights: Record<string, number>;
      edges: [consumer: string, dependency: string][];
      expected: Record<string, number>;
    }[])('is the same for every insertion order in $title', ({ weights, edges, expected }) => {
      for (const order of getPermutations(Object.keys(weights))) {
        const records: Map<string, OperationExecutionRecord> = createGraph(weights, edges);
        new AsyncOperationQueue(
          order.map((name: string) => records.get(name)!),
          nullSort
        );

        const lengths: Record<string, number | undefined> = {};
        for (const [name, record] of records) {
          lengths[name] = record.criticalPathLength;
        }
        expect({ order, lengths }).toEqual({ order, lengths: expected });
      }
    });

    it('assigns the operation that starts the longest chain first, whatever the insertion order', async () => {
      for (const order of getPermutations(['a', 'b', 'c', 'z'])) {
        // c depends on b, which depends on a. z has no dependencies and no consumers.
        const records: Map<string, OperationExecutionRecord> = createGraph({ a: 1, b: 1, c: 1, z: 1 }, [
          ['c', 'b'],
          ['b', 'a']
        ]);
        const queue: AsyncOperationQueue = new AsyncOperationQueue(
          order.map((name: string) => records.get(name)!),
          criticalPathSort
        );

        const first: IteratorResult<OperationExecutionRecord> = await queue.next();
        expect({ order, first: first.value?.name }).toEqual({ order, first: 'a' });
      }
    });
  });
});
