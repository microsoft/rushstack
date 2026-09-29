// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { OperationExecutionRecord } from './OperationExecutionRecord';
import { OperationStatus } from './OperationStatus';
import { RushConstants } from '../RushConstants';

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
  readonly #queue: OperationExecutionRecord[];
  readonly #pendingIterators: ((result: IteratorResult<OperationExecutionRecord>) => void)[];
  readonly #totalOperations: number;
  readonly #completedOperations: Set<OperationExecutionRecord>;
  readonly #sortFn: IOperationSortFunction;

  /**
   * Operations that are not dispatched until they are released. They are kept out of `#queue`, so that
   * `assignOperations()` does not scan them.
   */
  readonly #heldOperations: Set<OperationExecutionRecord>;
  /** Operations that are dispatched before all others, see `prioritizeOperations()`. */
  readonly #prioritizedOperations: Set<OperationExecutionRecord>;
  #holdRetainCount: number;

  /**
   * Tracks how many times each operation has been assigned to an execution slot.
   * Operations that have been assigned more times (e.g. cobuild retries) are sorted
   * after operations with fewer attempts, so untried work is preferred.
   */
  readonly #numberOfTimesQueuedByOperation: Map<OperationExecutionRecord, number>;

  #isDone: boolean;
  #hasDispatched: boolean;

  /**
   * @param operations - The set of operations to be executed
   * @param sortFn - A function that sorts operations in reverse priority order:
   *   - Returning a positive value indicates that `a` should execute before `b`.
   *   - Returning a negative value indicates that `b` should execute before `a`.
   *   - Returning 0 indicates no preference.
   * @param heldOperations - Operations of `operations` that are not dispatched until they are released, see
   *   `releaseHeldOperations()`. They are released when every other operation has completed, unless a caller
   *   retains them (see `retainHeldOperations()`).
   */
  public constructor(
    operations: Iterable<OperationExecutionRecord>,
    sortFn: IOperationSortFunction,
    heldOperations?: Iterable<OperationExecutionRecord>
  ) {
    const sortedOperations: OperationExecutionRecord[] = computeTopologyAndSort(operations, sortFn);
    const held: Set<OperationExecutionRecord> = new Set();
    if (heldOperations) {
      const candidates: ReadonlySet<OperationExecutionRecord> = new Set(heldOperations);
      for (const record of sortedOperations) {
        if (candidates.has(record)) {
          held.add(record);
        }
      }
    }
    this.#queue = held.size
      ? sortedOperations.filter((record: OperationExecutionRecord) => !held.has(record))
      : sortedOperations;
    this.#heldOperations = held;
    this.#prioritizedOperations = new Set();
    this.#holdRetainCount = 0;
    this.#sortFn = sortFn;
    this.#pendingIterators = [];
    this.#totalOperations = sortedOperations.length;
    this.#isDone = false;
    this.#hasDispatched = false;
    this.#completedOperations = new Set<OperationExecutionRecord>();
    this.#numberOfTimesQueuedByOperation = new Map();
    // If every operation is held, none would ever complete to release them.
    this.#releaseIfOnlyHeldOperationsRemain();
  }

  /**
   * Whether every operation has completed, or the queue has nothing left to dispatch.
   */
  public get isDone(): boolean {
    return this.#isDone;
  }

  /**
   * Whether an iterator has requested an operation and the queue is not done.
   */
  public get isDispatching(): boolean {
    return this.#hasDispatched && !this.#isDone;
  }

  /**
   * The operations that are held back from dispatch.
   */
  public get heldOperations(): ReadonlySet<OperationExecutionRecord> {
    return this.#heldOperations;
  }

  /**
   * Keeps the held operations held even when every other operation has completed, until the returned function is
   * called. Aborting the iteration still releases them, see `releaseHeldOperations()`.
   */
  public retainHeldOperations(): () => void {
    this.#holdRetainCount++;
    let released: boolean = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.#holdRetainCount--;
      this.#releaseIfOnlyHeldOperationsRemain();
      this.assignOperations();
    };
  }

  /**
   * Makes held operations available for dispatch.
   * @param operations - The held operations to release, or undefined to release all of them.
   */
  public releaseHeldOperations(operations?: Iterable<OperationExecutionRecord>): void {
    const held: Set<OperationExecutionRecord> = this.#heldOperations;
    let releasedAny: boolean = false;
    for (const record of operations ?? Array.from(held)) {
      if (held.delete(record)) {
        this.#queue.push(record);
        releasedAny = true;
      }
    }
    if (releasedAny) {
      this.#sortQueue();
      this.assignOperations();
    }
  }

  /**
   * Dispatches the given operations before all other ready operations. Among each other, they keep the order of the
   * sort function.
   */
  public prioritizeOperations(operations: Iterable<OperationExecutionRecord>): void {
    let changed: boolean = false;
    for (const record of operations) {
      if (!this.#prioritizedOperations.has(record)) {
        this.#prioritizedOperations.add(record);
        changed = true;
      }
    }
    if (changed) {
      this.#sortQueue();
      this.assignOperations();
    }
  }

  /**
   * For use with `for await (const operation of taskQueue)`
   * @see {AsyncIterator}
   */
  public next(): Promise<IteratorResult<OperationExecutionRecord>> {
    this.#hasDispatched = true;
    const waitingIterators: Array<(result: IteratorResult<OperationExecutionRecord>) => void> =
      this.#pendingIterators;

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
    // A held operation completes without dispatch if a failure blocks it.
    this.#heldOperations.delete(record);
    this.#completedOperations.add(record);
    this.#numberOfTimesQueuedByOperation.delete(record);

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

    this.#releaseIfOnlyHeldOperationsRemain();
    this.assignOperations();

    if (this.#completedOperations.size === this.#totalOperations) {
      this.#isDone = true;
    }
  }

  /**
   * Routes ready operations with 0 dependencies to waiting iterators. Normally invoked as part of `next()`, but
   * if the caller does not update operation dependencies prior to calling `next()`, may need to be invoked manually.
   */
  public assignOperations(): void {
    const queue: OperationExecutionRecord[] = this.#queue;
    const waitingIterators: Array<(result: IteratorResult<OperationExecutionRecord>) => void> =
      this.#pendingIterators;
    const timesQueued: Map<OperationExecutionRecord, number> = this.#numberOfTimesQueuedByOperation;

    const readyOperations: OperationExecutionRecord[] = [];

    // Operations that were never assigned are assigned first, in the order in which they are found, so the
    // scan can stop once it has found one for each waiting iterator. This method runs each time an operation
    // is requested, completes or becomes ready, and the queue of a long-lived graph (such as the Rush
    // daemon's) can hold thousands of operations, so scanning all of them each time would be quadratic.
    let untriedReadyCount: number = 0;

    // By iterating in reverse order we do less array shuffling when removing operations
    for (let i: number = queue.length - 1; untriedReadyCount < waitingIterators.length && i >= 0; i--) {
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
        timesQueued.delete(record);
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
        readyOperations.push(record);
        if (!timesQueued.has(record)) {
          untriedReadyCount++;
        }
      }
      // Otherwise operation is still waiting
    }

    if (readyOperations.length > 1) {
      // Sort by times queued ascending. Operations that have never been queued (0)
      // come first, then operations with fewer attempts. This ensures cobuild retries
      // (queued 1+ times, returned to Ready) are tried after untried operations.
      readyOperations.sort((a, b) => (timesQueued.get(a) ?? 0) - (timesQueued.get(b) ?? 0));
    }

    for (const record of readyOperations) {
      if (waitingIterators.length === 0) {
        break;
      }
      // This task is ready to process, hand it to the iterator.
      // Needs to have queue semantics, otherwise tools that iterate it get confused
      timesQueued.set(record, (timesQueued.get(record) ?? 0) + 1);
      record.status = OperationStatus.Queued;
      waitingIterators.shift()!({
        value: record,
        done: false
      });
    }

    // Since items only get removed from the queue when they have a final status, this should be safe.
    if (queue.length === 0 && this.#heldOperations.size === 0) {
      this.#isDone = true;
    }

    if (this.#isDone) {
      for (const resolveAsyncIterator of waitingIterators.splice(0)) {
        resolveAsyncIterator({
          value: undefined,
          done: true
        });
      }
      return;
    }
  }

  #releaseIfOnlyHeldOperationsRemain(): void {
    const heldCount: number = this.#heldOperations.size;
    if (
      heldCount > 0 &&
      this.#holdRetainCount === 0 &&
      this.#completedOperations.size + heldCount === this.#totalOperations
    ) {
      for (const record of this.#heldOperations) {
        this.#queue.push(record);
      }
      this.#heldOperations.clear();
      this.#sortQueue();
    }
  }

  #sortQueue(): void {
    const sortFn: IOperationSortFunction = this.#sortFn;
    const prioritized: ReadonlySet<OperationExecutionRecord> = this.#prioritizedOperations;
    // The queue is scanned from its end, so the prioritized operations go last.
    this.#queue.sort(
      prioritized.size
        ? (a: OperationExecutionRecord, b: OperationExecutionRecord) =>
            Number(prioritized.has(a)) - Number(prioritized.has(b)) || sortFn(a, b)
        : sortFn
    );
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
  // Include the contribution from the current operation, and return the same value that later visits will read
  criticalPathLength += operation.weight;
  operation.criticalPathLength = criticalPathLength;

  // Directly writing operations to an output collection here would yield a topological sorted set
  // However, we want a bit more fine-tuning of the output than just the raw topology

  return criticalPathLength;
}
