// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Async, MinimumHeap } from '@rushstack/node-core-library';
import type {
  IExecuteOperationContext,
  IOperationExecutionOptions,
  IOperationState,
  Operation,
  OperationGroupRecord
} from '@rushstack/operation-graph';
import { OperationStatus } from '@rushstack/operation-graph/lib/OperationStatus';

// This module is self-contained on purpose (fewer modules to resolve and load before the first task runs).

interface ISortableOperation<T extends ISortableOperation<T>> {
  name: string | undefined;
  criticalPathLength?: number | undefined;
  weight: number;
  consumers: Set<T>;
}

// The functions below are the same as the ones in @rushstack/operation-graph's calculateCriticalPath module.

function calculateCriticalPathLengths<T extends ISortableOperation<T>>(operations: Iterable<T>): T[] {
  // Clone the set of operations as an array, so that we can sort it.
  const queue: T[] = Array.from(operations);

  // Create a collection for detecting visited nodes
  const cycleDetectorStack: Set<T> = new Set();
  for (const operation of queue) {
    calculateCriticalPathLength(operation, cycleDetectorStack);
  }

  return queue;
}

function calculateShortestPath<T extends ISortableOperation<T>>(startOperation: T, endOperation: T): T[] {
  // Map of each operation to the most optimal parent
  const parents: Map<T, T | undefined> = new Map([[endOperation, undefined]]);
  let finalParent: T | undefined;

  // Run a breadth-first search to find the shortest path between the start and end operations
  outer: for (const [operation] of parents) {
    for (const consumer of operation.consumers) {
      // Since this is a breadth-first traversal, the first encountered path to a given node
      // will be tied for shortest, so only the first encountered path needs to be tracked
      if (!parents.has(consumer)) {
        parents.set(consumer, operation);
      }

      if (consumer === startOperation) {
        finalParent = operation;
        break outer;
      }
    }
  }

  if (!finalParent) {
    throw new Error(`Could not find a path from "${startOperation.name}" to "${endOperation.name}"`);
  }

  // Walk back up the path from the end operation to the start operation
  let currentOperation: T = finalParent;
  const path: T[] = [startOperation];
  while (currentOperation !== undefined) {
    path.push(currentOperation);
    currentOperation = parents.get(currentOperation)!;
  }
  return path;
}

function calculateCriticalPathLength<T extends ISortableOperation<T>>(
  operation: T,
  dependencyChain: Set<T>
): number {
  if (dependencyChain.has(operation)) {
    // Ensure we have the shortest path to the cycle
    const shortestPath: T[] = calculateShortestPath(operation, operation);

    throw new Error(
      'A cyclic dependency was encountered:\n  ' +
        shortestPath.map((visitedTask) => visitedTask.name).join('\n  -> ')
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
  criticalPathLength += operation.weight ?? 1;

  // Record result
  operation.criticalPathLength = criticalPathLength;

  return criticalPathLength;
}

interface IQueueItem {
  task: () => Promise<void>;
  priority: number;
}

function getSignal(): [Promise<void>, () => void] {
  let resolver: () => void;
  const promise: Promise<void> = new Promise<void>((resolve) => {
    resolver = resolve;
  });
  return [promise, resolver!];
}

/**
 * A priority queue of work items, consumed via async iteration.
 *
 * @remarks
 * This is equivalent to the `WorkQueue` in `@rushstack/operation-graph`, except that:
 * - the consumer is woken up with `setImmediate()` instead of `setTimeout()`. Both batch every item that was
 *   pushed while the current macrotask (including its microtasks) runs, so that items are dequeued in priority
 *   order; however `setTimeout()` imposes a minimum delay of 1ms for every wave of newly-ready operations.
 * - it observes the caller's abort signal directly and is stopped via {@link WorkQueue.stop} when execution
 *   completes, instead of the caller aborting a dedicated `AbortController` (dispatching an abort event).
 */
class WorkQueue {
  readonly #queue: MinimumHeap<IQueueItem>;
  readonly #abortSignal: AbortSignal;
  readonly #onAbort: () => void;
  readonly #stopPromise: Promise<void>;

  #isStopped: boolean = false;
  #resolveStop!: () => void;
  #pushPromise: Promise<void>;
  #resolvePush: () => void;
  #resolvePushImmediate: NodeJS.Immediate | undefined;

  public constructor(abortSignal: AbortSignal) {
    // Sort by priority descending. Thus the comparator returns a negative number if a has higher priority than b.
    this.#queue = new MinimumHeap((a: IQueueItem, b: IQueueItem) => b.priority - a.priority);
    this.#abortSignal = abortSignal;
    this.#stopPromise = new Promise<void>((resolve) => {
      this.#resolveStop = resolve;
    });
    this.#onAbort = () => this.stop();
    if (abortSignal.aborted) {
      this.stop();
    } else {
      abortSignal.addEventListener('abort', this.#onAbort, { once: true });
    }

    [this.#pushPromise, this.#resolvePush] = getSignal();
    this.#resolvePushImmediate = undefined;
  }

  public async *[Symbol.asyncIterator](): AsyncIterableIterator<() => Promise<void>> {
    while (!this.#isStopped) {
      while (this.#queue.size > 0) {
        const item: IQueueItem = this.#queue.poll()!;
        yield item.task;
      }

      await Promise.race([this.#pushPromise, this.#stopPromise]);
    }
  }

  /**
   * Ends the iteration. Items that have not started yet resolve with `OperationStatus.Aborted`.
   * This happens automatically when the abort signal is aborted.
   */
  public stop(): void {
    this.#isStopped = true;
    this.#resolveStop();
  }

  /**
   * Stops observing the abort signal.
   */
  public detachAbortSignal(): void {
    this.#abortSignal.removeEventListener('abort', this.#onAbort);
  }

  public pushAsync(task: () => Promise<OperationStatus>, priority: number): Promise<OperationStatus> {
    return new Promise((resolve, reject) => {
      this.#queue.push({
        task: () => task().then(resolve, reject),
        priority
      });

      // ESLINT: "Promises must be awaited, end with a call to .catch, end with a call to .then ..."
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.#stopPromise.finally(() => resolve(OperationStatus.Aborted));

      this.#resolvePushDebounced();
    });
  }

  #resolvePushDebounced(): void {
    if (!this.#resolvePushImmediate) {
      this.#resolvePushImmediate = setImmediate(() => {
        this.#resolvePushImmediate = undefined;
        this.#resolvePush();

        [this.#pushPromise, this.#resolvePush] = getSignal();
      });
    }
  }
}


/**
 * Executes a graph of operations, honoring their dependencies and the requested parallelism.
 *
 * @remarks
 * This mirrors `OperationExecutionManager` from `@rushstack/operation-graph` (same scheduling order, logging,
 * hooks and result), but uses a {@link WorkQueue} that does not add a timer delay for every wave of
 * newly-ready operations.
 */
export class OperationExecutionManager<TOperationMetadata extends {} = {}, TGroupMetadata extends {} = {}> {
  /**
   * The set of operations that will be executed
   */
  readonly #operations: Operation<TOperationMetadata, TGroupMetadata>[];
  /**
   * The total number of non-silent operations in the graph.
   * Silent operations are generally used to simplify the construction of the graph.
   */
  readonly #trackedOperationCount: number;

  readonly #groupRecords: Set<OperationGroupRecord<TGroupMetadata>>;

  public constructor(operations: ReadonlySet<Operation<TOperationMetadata, TGroupMetadata>>) {
    let trackedOperationCount: number = 0;
    for (const operation of operations) {
      if (!operation.runner?.silent) {
        // Only count non-silent operations
        trackedOperationCount++;
      }
    }

    this.#trackedOperationCount = trackedOperationCount;

    this.#operations = calculateCriticalPathLengths(operations);

    this.#groupRecords = new Set(Array.from(this.#operations, (e) => e.group).filter((e) => e !== undefined));

    for (const consumer of operations) {
      for (const dependency of consumer.dependencies) {
        if (!operations.has(dependency)) {
          throw new Error(
            `Operation ${JSON.stringify(consumer.name)} declares a dependency on operation ` +
              `${JSON.stringify(dependency.name)} that is not in the set of operations to execute.`
          );
        }
      }
    }
  }

  /**
   * Executes all operations which have been registered, returning a promise which is resolved when all the
   * operations are completed successfully, or rejects when any operation fails.
   */
  public async executeAsync(
    executionOptions: IOperationExecutionOptions<TOperationMetadata, TGroupMetadata>
  ): Promise<OperationStatus> {
    let hasReportedFailures: boolean = false;

    const { abortSignal, parallelism, terminal, requestRun } = executionOptions;

    if (abortSignal.aborted) {
      return OperationStatus.Aborted;
    }

    const startedGroups: Set<OperationGroupRecord> = new Set();
    const finishedGroups: Set<OperationGroupRecord> = new Set();

    const maxParallelism: number = Math.min(this.#operations.length, parallelism);

    for (const groupRecord of this.#groupRecords) {
      groupRecord.reset();
    }

    for (const operation of this.#operations) {
      operation.reset();
    }

    terminal.writeVerboseLine(`Executing a maximum of ${maxParallelism} simultaneous tasks...`);

    // The work queue stops when the abort signal is aborted, or when it is stopped below.
    const workQueue: WorkQueue = new WorkQueue(abortSignal);
    try {

      const executionContext: IExecuteOperationContext = {
        terminal,
        abortSignal,

        requestRun,

        queueWork: (workFn: () => Promise<OperationStatus>, priority: number): Promise<OperationStatus> => {
          return workQueue.pushAsync(workFn, priority);
        },

        beforeExecute: (operation: Operation<TOperationMetadata, TGroupMetadata>): void => {
          // Initialize group if uninitialized and log the group name
          const { group, runner } = operation;
          if (group) {
            if (!startedGroups.has(group)) {
              startedGroups.add(group);
              group.startTimer();
              terminal.writeLine(` ---- ${group.name} started ---- `);
              executionOptions.beforeExecuteOperationGroup?.(group);
            }
          }
          if (!runner?.silent) {
            executionOptions.beforeExecuteOperation?.(operation);
          }
        },

        afterExecute: (
          operation: Operation<TOperationMetadata, TGroupMetadata>,
          state: IOperationState
        ): void => {
          const { group, runner } = operation;
          if (group) {
            group.setOperationAsComplete(operation, state);
          }

          if (state.status === OperationStatus.Failure) {
            // This operation failed. Mark it as such and all reachable dependents as blocked.
            // Failed operations get reported, even if silent.
            // Generally speaking, silent operations shouldn't be able to fail, so this is a safety measure.
            const message: string | undefined = state.error?.message;
            if (message) {
              terminal.writeErrorLine(message);
            }
            hasReportedFailures = true;
          }

          if (!runner?.silent) {
            executionOptions.afterExecuteOperation?.(operation);
          }

          if (group) {
            // Log out the group name and duration if it is the last operation in the group
            if (group?.finished && !finishedGroups.has(group)) {
              finishedGroups.add(group);
              const finishedLoggingWord: string = group.hasFailures
                ? 'encountered an error'
                : group.hasCancellations
                  ? 'cancelled'
                  : 'finished';
              terminal.writeLine(
                ` ---- ${group.name} ${finishedLoggingWord} (${group.duration.toFixed(3)}s) ---- `
              );
              executionOptions.afterExecuteOperationGroup?.(group);
            }
          }
        }
      };

      const workQueuePromise: Promise<void> = Async.forEachAsync(
        workQueue,
        (workFn: () => Promise<void>) => workFn(),
        {
          concurrency: maxParallelism
        }
      );

      await Promise.all(this.#operations.map((record: Operation) => record._executeAsync(executionContext)));

      // Terminate queue execution.
      workQueue.stop();
      await workQueuePromise;
    } finally {
      // Cleanup resources
      workQueue.detachAbortSignal();
    }

    const finalStatus: OperationStatus =
      this.#trackedOperationCount === 0
        ? OperationStatus.NoOp
        : abortSignal.aborted
          ? OperationStatus.Aborted
          : hasReportedFailures
            ? OperationStatus.Failure
            : OperationStatus.Success;

    return finalStatus;
  }
}
