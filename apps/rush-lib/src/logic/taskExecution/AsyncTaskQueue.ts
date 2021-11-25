// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Task } from './Task';
import { TaskStatus } from './TaskStatus';

/**
 * @internal
 *
 * Implmentation of the async iteration protocol for a collection of Task objects.
 * The async iterator will wait for a task to be ready for execution, or terminate if there are no more tasks.
 *
 * @remarks
 * It is imperative that the caller update the status of tasks prior to invoking `next()` on the iterator again,
 * otherwise it will stall forever unless some other call stack invokes next().
 */
export class AsyncTaskQueue implements AsyncIterable<Task>, AsyncIterator<Task> {
  private readonly _queue: Task[];
  private readonly _pendingIterators: ((result: IteratorResult<Task>) => void)[];

  /**
   * @param tasks - The set of tasks to be executed
   * @param taskSortFn - A function that sorts tasks in reverse priority order:
   *   - Returning a positive value indicates that `a` should execute before `b`.
   *   - Returning a negative value indicates that `b` should execute before `a`.
   *   - Returning 0 indicates no preference.
   */
  public constructor(tasks: Iterable<Task>, taskSortFn: ITaskSortFunction) {
    this._queue = computeTopologyAndSort(tasks, taskSortFn);
    this._pendingIterators = [];
  }

  /**
   * For use with `for await (const task of taskQueue)`
   * @see {AsyncIterator}
   */
  public next(): Promise<IteratorResult<Task>> {
    const { _queue: taskQueue, _pendingIterators: waitingIterators } = this;

    const promise: Promise<IteratorResult<Task>> = new Promise(
      (resolve: (result: IteratorResult<Task>) => void) => {
        waitingIterators.push(resolve);
      }
    );

    // By iterating in reverse order we do less array shuffling when removing tasks
    for (let i: number = taskQueue.length - 1; waitingIterators.length > 0 && i >= 0; i--) {
      const task: Task = taskQueue[i];

      if (task.status !== TaskStatus.Ready) {
        // It shouldn't be on the queue, remove it
        // This should be a blocked task
        taskQueue.splice(i, 1);
      } else if (task.dependencies.size === 0) {
        // This task is ready to process, hand it to the iterator.
        taskQueue.splice(i, 1);
        waitingIterators.pop()!({
          value: task,
          done: false
        });
      }
      // Otherwise task is still waiting
    }

    if (taskQueue.length === 0) {
      // Queue is empty, flush
      for (const resolveAsyncIterator of waitingIterators.splice(0)) {
        resolveAsyncIterator({
          value: undefined,
          done: true
        });
      }
    }

    return promise;
  }

  /**
   * Returns this queue as an async iterator, such that multiple functions iterating this object concurrently
   * receive distinct iteration results.
   */
  public [Symbol.asyncIterator](): AsyncIterator<Task> {
    return this;
  }
}

export interface ITaskSortFunction {
  /**
   * A function that sorts tasks in reverse priority order:
   * Returning a positive value indicates that `a` should execute before `b`.
   * Returning a negative value indicates that `b` should execute before `a`.
   * Returning 0 indicates no preference.
   */
  (a: Task, b: Task): number;
}

/**
 * Performs a depth-first search to topologically sort the tasks, subject to override via taskSortFn
 */
function computeTopologyAndSort(tasks: Iterable<Task>, taskSortFn: ITaskSortFunction): Task[] {
  // Clone the set of tasks as an array, so that we can sort it.
  const queue: Task[] = Array.from(tasks);

  // Define the consumer relationships, so the caller doesn't have to
  for (const task of queue) {
    for (const dependency of task.dependencies) {
      dependency.dependents.add(task);
    }
  }

  // Create a collection for detecting visited nodes
  const cycleDetectorStack: Set<Task> = new Set();
  for (const task of queue) {
    calculateCriticalPathLength(task, cycleDetectorStack);
  }

  return queue.sort(taskSortFn);
}

/**
 * Perform a depth-first search to find critical path length.
 * Cycle detection comes at minimal additional cost.
 */
function calculateCriticalPathLength(task: Task, dependencyChain: Set<Task>): number {
  if (dependencyChain.has(task)) {
    throw new Error(
      'A cyclic dependency was encountered:\n  ' +
        [...dependencyChain, task]
          .map((visitedTask) => visitedTask.name)
          .reverse()
          .join('\n  -> ') +
        '\nConsider using the cyclicDependencyProjects option for rush.json.'
    );
  }

  let { criticalPathLength } = task;

  if (criticalPathLength !== undefined) {
    // This has been visited already
    return criticalPathLength;
  }

  criticalPathLength = 0;
  if (task.dependents.size) {
    dependencyChain.add(task);
    for (const consumer of task.dependents) {
      criticalPathLength = Math.max(
        criticalPathLength,
        calculateCriticalPathLength(consumer, dependencyChain) + 1
      );
    }
    dependencyChain.delete(task);
  }
  task.criticalPathLength = criticalPathLength;

  // Directly writing tasks to an output collection here would yield a topological sorted set
  // However, we want a bit more fine-tuning of the output than just the raw topology

  return criticalPathLength;
}
