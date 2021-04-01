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

  public constructor(tasks: ReadonlyArray<Task>) {
    this._queue = tasks.slice().reverse();
    this._pendingIterators = [];
  }

  /**
   * For use with `for await (const task of taskQueue)`
   * @see {AsyncIterable}
   */
  public next(): Promise<IteratorResult<Task>> {
    const { _queue: taskQueue, _pendingIterators: waitingIterators } = this;

    const promise: Promise<IteratorResult<Task>> = new Promise(
      (resolve: (result: IteratorResult<Task>) => void) => {
        waitingIterators.push(resolve);
      }
    );

    // By iterating in reverse order we do less array shuffling when removing items
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

  public [Symbol.asyncIterator](): AsyncIterator<Task> {
    return this;
  }
}
