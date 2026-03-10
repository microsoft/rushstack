// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { OperationExecutionRecord } from './OperationExecutionRecord.ts';
import { OperationStatus } from './OperationStatus.ts';
import { RushConstants } from '../RushConstants.ts';

/**
 * Implementation of the async iteration protocol for a collection of IOperation objects.
 * The async iterator will wait for an operation to be ready for execution, or terminate if there are no more operations.
 *
 * @remarks
 * If the caller does not update dependencies prior to invoking `next()` on the iterator again,
 * it must manually invoke `assignOperations()` after performing the updates, otherwise iterators will
 * stall until another operations completes.
 */
export class AsyncOperationQueue
  implements AsyncIterable<OperationExecutionRecord>, AsyncIterator<OperationExecutionRecord>
{
  private readonly _queue: OperationExecutionRecord[];
  private readonly _pendingIterators: ((result: IteratorResult<OperationExecutionRecord>) => void)[];
  private readonly _totalOperations: number;
  private readonly _completedOperations: Set<OperationExecutionRecord>;

  private _isDone: boolean;

  /**
   * @param operations - The set of operations to be executed
   * @param sortFn - A function that sorts operations in reverse priority order:
   *   - Returning a positive value indicates that `a` should execute before `b`.
   *   - Returning a negative value indicates that `b` should execute before `a`.
   *   - Returning 0 indicates no preference.
   */
  public constructor(operations: Iterable<OperationExecutionRecord>, sortFn: IOperationSortFunction) {
    this._queue = computeTopologyAndSort(operations, sortFn);
    this._pendingIterators = [];
    this._totalOperations = this._queue.length;
    this._isDone = false;
    this._completedOperations = new Set<OperationExecutionRecord>();
  }

  /**
   * For use with `for await (const operation of taskQueue)`
   * @see {AsyncIterator}
   */
  public next(): Promise<IteratorResult<OperationExecutionRecord>> {
    const { _pendingIterators: waitingIterators } = this;

    const promise: Promise<IteratorResult<OperationExecutionRecord>> = new Promise(
      (resolve: (result: IteratorResult<OperationExecutionRecord>) => void) => {
        waitingIterators.push(resolve);
      }
    );

    this.assignOperations();

    return promise;
  }

  /**
   * Set a callback to be invoked when one operation is completed.
   * If all operations are completed, set the queue to done, resolve all pending iterators in next cycle.
   */
  public complete(record: OperationExecutionRecord): void {
    this._completedOperations.add(record);

    // Apply status changes to direct dependents
    if (record.status !== OperationStatus.Failure && record.status !== OperationStatus.Blocked) {
      // Only do so if the operation did not fail or get blocked
      for (const item of record.consumers) {
        // Remove this operation from the dependencies, to unblock the scheduler
        if (
          item.dependencies.delete(record) &&
          item.dependencies.size === 0 &&
          item.status === OperationStatus.Waiting
        ) {
          item.status = OperationStatus.Ready;
        }
      }
    }

    this.assignOperations();

    if (this._completedOperations.size === this._totalOperations) {
      this._isDone = true;
    }
  }

  /**
   * Routes ready operations with 0 dependencies to waiting iterators. Normally invoked as part of `next()`, but
   * if the caller does not update operation dependencies prior to calling `next()`, may need to be invoked manually.
   */
  public assignOperations(): void {
    const { _queue: queue, _pendingIterators: waitingIterators } = this;

    // By iterating in reverse order we do less array shuffling when removing operations
    for (let i: number = queue.length - 1; waitingIterators.length > 0 && i >= 0; i--) {
      const record: OperationExecutionRecord = queue[i];

      if (
        record.status === OperationStatus.Blocked ||
        record.status === OperationStatus.Skipped ||
        record.status === OperationStatus.Success ||
        record.status === OperationStatus.SuccessWithWarning ||
        record.status === OperationStatus.FromCache ||
        record.status === OperationStatus.NoOp ||
        record.status === OperationStatus.Failure ||
        record.status === OperationStatus.Aborted
      ) {
        // It shouldn't be on the queue, remove it
        queue.splice(i, 1);
      } else if (record.status === OperationStatus.Queued || record.status === OperationStatus.Executing) {
        // This operation is currently executing
        // next one plz :)
      } else if (record.status === OperationStatus.Waiting) {
        // This operation is not yet ready to be executed
        // next one plz :)
        continue;
      } else if (record.status !== OperationStatus.Ready) {
        // Sanity check
        throw new Error(`Unexpected status "${record.status}" for queued operation: ${record.name}`);
      } else {
        // This task is ready to process, hand it to the iterator.
        // Needs to have queue semantics, otherwise tools that iterate it get confused
        record.status = OperationStatus.Queued;
        waitingIterators.shift()!({
          value: record,
          done: false
        });
      }
      // Otherwise operation is still waiting
    }

    // Since items only get removed from the queue when they have a final status, this should be safe.
    if (queue.length === 0) {
      this._isDone = true;
    }

    if (this._isDone) {
      for (const resolveAsyncIterator of waitingIterators.splice(0)) {
        resolveAsyncIterator({
          value: undefined,
          done: true
        });
      }
      return;
    }
  }

  /**
   * Returns this queue as an async iterator, such that multiple functions iterating this object concurrently
   * receive distinct iteration results.
   */
  public [Symbol.asyncIterator](): AsyncIterator<OperationExecutionRecord> {
    return this;
  }
}

export interface IOperationSortFunction {
  /**
   * A function that sorts operations in reverse priority order:
   * Returning a positive value indicates that `a` should execute before `b`.
   * Returning a negative value indicates that `b` should execute before `a`.
   * Returning 0 indicates no preference.
   */
  (a: OperationExecutionRecord, b: OperationExecutionRecord): number;
}

/**
 * Performs a depth-first search to topologically sort the operations, subject to override via sortFn
 */
function computeTopologyAndSort(
  operations: Iterable<OperationExecutionRecord>,
  sortFn: IOperationSortFunction
): OperationExecutionRecord[] {
  // Clone the set of operations as an array, so that we can sort it.
  const queue: OperationExecutionRecord[] = Array.from(operations);

  // Create a collection for detecting visited nodes
  const cycleDetectorStack: Set<OperationExecutionRecord> = new Set();
  for (const operation of queue) {
    calculateCriticalPathLength(operation, cycleDetectorStack);
  }

  return queue.sort(sortFn);
}

/**
 * Perform a depth-first search to find critical path length.
 * Cycle detection comes at minimal additional cost.
 */
function calculateCriticalPathLength(
  operation: OperationExecutionRecord,
  dependencyChain: Set<OperationExecutionRecord>
): number {
  if (dependencyChain.has(operation)) {
    throw new Error(
      'A cyclic dependency was encountered:\n  ' +
        [...dependencyChain, operation]
          .map((visitedTask) => visitedTask.name)
          .reverse()
          .join('\n  -> ') +
        `\nConsider using the decoupledLocalDependencies option in ${RushConstants.rushJsonFilename}.`
    );
  }

  let { criticalPathLength } = operation;

  if (criticalPathLength !== undefined) {
    // This has been visited already
    return criticalPathLength;
  }

  criticalPathLength = 0;
  if (operation.consumers.size) {
    dependencyChain.add(operation);
    for (const consumer of operation.consumers) {
      criticalPathLength = Math.max(
        criticalPathLength,
        calculateCriticalPathLength(consumer, dependencyChain)
      );
    }
    dependencyChain.delete(operation);
  }
  // Include the contribution from the current operation
  operation.criticalPathLength = criticalPathLength + operation.weight;

  // Directly writing operations to an output collection here would yield a topological sorted set
  // However, we want a bit more fine-tuning of the output than just the raw topology

  return criticalPathLength;
}
