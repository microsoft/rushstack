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

function createRecord(name: string): OperationExecutionRecord {
  return new OperationExecutionRecord(
    new Operation({
      runner: new MockOperationRunner(name),
      logFilenameIdentifier: 'operation',
      phase: mockPhase,
      project: getOrCreateProject(name)
    }),
    {} as unknown as IOperationExecutionRecordContext
  );
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

    // Assign all three — untried operations should come before the retry
    const results: OperationExecutionRecord[] = [];
    const r2: IteratorResult<OperationExecutionRecord> = await queue.next();
    results.push(r2.value);
    const r3: IteratorResult<OperationExecutionRecord> = await queue.next();
    results.push(r3.value);
    const r4: IteratorResult<OperationExecutionRecord> = await queue.next();
    results.push(r4.value);

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

    // B is freshly unblocked (never assigned), A is a cobuild retry — B should be first
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
});
