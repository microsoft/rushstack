// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Operation } from '../Operation.ts';
import {
  type IOperationExecutionRecordContext,
  OperationExecutionRecord
} from '../OperationExecutionRecord.ts';
import { MockOperationRunner } from './MockOperationRunner.ts';
import { AsyncOperationQueue, type IOperationSortFunction } from '../AsyncOperationQueue.ts';
import { OperationStatus } from '../OperationStatus.ts';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject.ts';
import type { IPhase } from '../../../api/CommandLineConfiguration.ts';

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
});
