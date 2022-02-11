// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Operation } from './Operation';
import { OperationStatus } from './OperationStatus';

/**
 * Implmentation of the async iteration protocol for a collection of Task objects.
 * The async iterator will wait for an operation to be ready for execution, or terminate if there are no more operations.
 *
 * @remarks
 * If the caller does not update dependencies prior to invoking `next()` on the iterator again,
 * it must manually invoke `assignOperations()` after performing the updates, otherwise iterators will
 * stall until another operations completes.
 */
export class AsyncOperationQueue implements AsyncIterable<Operation>, AsyncIterator<Operation> {
  private readonly _queue: Operation[];
  private readonly _pendingIterators: ((result: IteratorResult<Operation>) => void)[];

  /**
   * @param opeartions - The set of operations to be executed
   * @param sortFn - A function that sorts operations in reverse priority order:
   *   - Returning a positive value indicates that `a` should execute before `b`.
   *   - Returning a negative value indicates that `b` should execute before `a`.
   *   - Returning 0 indicates no preference.
   */
  public constructor(opeartions: Iterable<Operation>, sortFn: IOperationSortFunction) {
    this._queue = computeTopologyAndSort(opeartions, sortFn);
    this._pendingIterators = [];
  }

  /**
   * For use with `for await (const operation of taskQueue)`
   * @see {AsyncIterator}
   */
  public next(): Promise<IteratorResult<Operation>> {
    const { _pendingIterators: waitingIterators } = this;

    const promise: Promise<IteratorResult<Operation>> = new Promise(
      (resolve: (result: IteratorResult<Operation>) => void) => {
        waitingIterators.push(resolve);
      }
    );

    this.assignOperations();

    return promise;
  }

  /**
   * Routes ready operations with 0 dependencies to waiting iterators. Normally invoked as part of `next()`, but
   * if the caller does not update operation dependencies prior to calling `next()`, may need to be invoked manually.
   */
  public assignOperations(): void {
    const { _queue: queue, _pendingIterators: waitingIterators } = this;

    // By iterating in reverse order we do less array shuffling when removing operations
    for (let i: number = queue.length - 1; waitingIterators.length > 0 && i >= 0; i--) {
      const operation: Operation = queue[i];

      if (operation.status === OperationStatus.Blocked) {
        // It shouldn't be on the queue, remove it
        queue.splice(i, 1);
      } else if (operation.status !== OperationStatus.Ready) {
        // Sanity check
        throw new Error(`Unexpected status "${operation.status}" for queued task: ${operation.name}`);
      } else if (operation.dependencies.size === 0) {
        // This task is ready to process, hand it to the iterator.
        queue.splice(i, 1);
        waitingIterators.pop()!({
          value: operation,
          done: false
        });
      }
      // Otherwise operation is still waiting
    }

    if (queue.length === 0) {
      // Queue is empty, flush
      for (const resolveAsyncIterator of waitingIterators.splice(0)) {
        resolveAsyncIterator({
          value: undefined,
          done: true
        });
      }
    }
  }

  /**
   * Returns this queue as an async iterator, such that multiple functions iterating this object concurrently
   * receive distinct iteration results.
   */
  public [Symbol.asyncIterator](): AsyncIterator<Operation> {
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
  (a: Operation, b: Operation): number;
}

/**
 * Performs a depth-first search to topologically sort the operations, subject to override via sortFn
 */
function computeTopologyAndSort(
  operations: Iterable<Operation>,
  sortFn: IOperationSortFunction
): Operation[] {
  // Clone the set of operations as an array, so that we can sort it.
  const queue: Operation[] = Array.from(operations);

  // Define the consumer relationships, so the caller doesn't have to
  for (const operation of queue) {
    for (const dependency of operation.dependencies) {
      dependency.dependents.add(operation);
    }
  }

  // Create a collection for detecting visited nodes
  const cycleDetectorStack: Set<Operation> = new Set();
  for (const operation of queue) {
    calculateCriticalPathLength(operation, cycleDetectorStack);
  }

  return queue.sort(sortFn);
}

/**
 * Perform a depth-first search to find critical path length.
 * Cycle detection comes at minimal additional cost.
 */
function calculateCriticalPathLength(operation: Operation, dependencyChain: Set<Operation>): number {
  if (dependencyChain.has(operation)) {
    throw new Error(
      'A cyclic dependency was encountered:\n  ' +
        [...dependencyChain, operation]
          .map((visitedTask) => visitedTask.name)
          .reverse()
          .join('\n  -> ') +
        '\nConsider using the cyclicDependencyProjects option for rush.json.'
    );
  }

  let { criticalPathLength } = operation;

  if (criticalPathLength !== undefined) {
    // This has been visited already
    return criticalPathLength;
  }

  criticalPathLength = 0;
  if (operation.dependents.size) {
    dependencyChain.add(operation);
    for (const consumer of operation.dependents) {
      criticalPathLength = Math.max(
        criticalPathLength,
        calculateCriticalPathLength(consumer, dependencyChain) + 1
      );
    }
    dependencyChain.delete(operation);
  }
  operation.criticalPathLength = criticalPathLength;

  // Directly writing operations to an output collection here would yield a topological sorted set
  // However, we want a bit more fine-tuning of the output than just the raw topology

  return criticalPathLength;
}
