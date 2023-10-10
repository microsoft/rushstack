// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Operation } from '../Operation';
import { type IOperationExecutionRecordContext, OperationExecutionRecord } from '../OperationExecutionRecord';
import { MockOperationRunner } from './MockOperationRunner';
import {
  AsyncOperationQueue,
  type IOperationIteratorResult,
  type IOperationSortFunction,
  UNASSIGNED_OPERATION
} from '../AsyncOperationQueue';
import { OperationStatus } from '../OperationStatus';
import { Async } from '@rushstack/node-core-library';

function addDependency(consumer: OperationExecutionRecord, dependency: OperationExecutionRecord): void {
  consumer.dependencies.add(dependency);
  dependency.consumers.add(consumer);
  consumer.status = OperationStatus.Waiting;
}

function nullSort(a: OperationExecutionRecord, b: OperationExecutionRecord): number {
  return 0;
}

function createRecord(name: string): OperationExecutionRecord {
  return new OperationExecutionRecord(
    new Operation({
      runner: new MockOperationRunner(name)
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
    // Nothing sets the RemoteExecuting status, this should be a error if it happens
    let hasUnassignedOperation: boolean = false;
    const queue: AsyncOperationQueue = new AsyncOperationQueue(operations, nullSort);
    for await (const operation of queue) {
      actualOrder.push(operation);
      if (operation === UNASSIGNED_OPERATION) {
        hasUnassignedOperation = true;
        continue;
      }
      operation.status = OperationStatus.Success;
      queue.complete(operation);
    }

    expect(actualOrder).toEqual(expectedOrder);
    expect(hasUnassignedOperation).toEqual(false);
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
    // Nothing sets the RemoteExecuting status, this should be a error if it happens
    let hasUnassignedOperation: boolean = false;

    const queue: AsyncOperationQueue = new AsyncOperationQueue(operations, customSort);
    for await (const operation of queue) {
      actualOrder.push(operation);
      if (operation === UNASSIGNED_OPERATION) {
        hasUnassignedOperation = true;
        continue;
      }
      operation.status = OperationStatus.Success;
      queue.complete(operation);
    }

    expect(actualOrder).toEqual(expectedOrder);

    expect(hasUnassignedOperation).toEqual(false);
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
    // Nothing sets the RemoteExecuting status, this should be a error if it happens
    let hasUnassignedOperation: boolean = false;

    // Use 3 concurrent iterators to verify that it handles having more than the operation concurrency
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        for await (const operation of queue) {
          if (operation === UNASSIGNED_OPERATION) {
            hasUnassignedOperation = true;
            continue;
          }
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

    expect(hasUnassignedOperation).toEqual(false);
  });

  it('handles remote executed operations', async () => {
    const operations = [
      createRecord('a'),
      createRecord('b'),
      createRecord('c'),
      createRecord('d'),
      createRecord('e')
    ];

    addDependency(operations[2], operations[1]);
    addDependency(operations[3], operations[1]);
    addDependency(operations[4], operations[1]);
    addDependency(operations[3], operations[2]);
    addDependency(operations[4], operations[3]);

    // b remote executing -> a -> b (remote executed) -> c -> d -> e
    const expectedOrder: string[] = ['b', 'a', 'b', 'c', 'd', 'e'];

    const queue: AsyncOperationQueue = new AsyncOperationQueue(operations, nullSort);

    const actualOrder: string[] = [];
    let remoteExecuted: boolean = false;
    for await (const operation of queue) {
      let record: OperationExecutionRecord | undefined;
      if (operation === UNASSIGNED_OPERATION) {
        await Async.sleep(100);
        record = queue.tryGetRemoteExecutingOperation();
      } else {
        record = operation;
      }
      if (!record) {
        continue;
      }

      actualOrder.push(record.name);

      if (record === operations[1]) {
        if (!remoteExecuted) {
          operations[1].status = OperationStatus.RemoteExecuting;
          // remote executed operation is finished later
          remoteExecuted = true;
          continue;
        }
      }
      record.status = OperationStatus.Success;
      queue.complete(record);
    }

    expect(actualOrder).toEqual(expectedOrder);
  });

  it('handles an empty queue', async () => {
    const operations: OperationExecutionRecord[] = [];

    const queue: AsyncOperationQueue = new AsyncOperationQueue(operations, nullSort);
    const iterator: AsyncIterator<IOperationIteratorResult> = queue[Symbol.asyncIterator]();
    const result: IteratorResult<IOperationIteratorResult> = await iterator.next();
    expect(result.done).toEqual(true);
  });
});
