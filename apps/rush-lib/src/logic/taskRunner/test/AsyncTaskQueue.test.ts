// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Task } from '../Task';
import { TaskStatus } from '../TaskStatus';
import { AsyncTaskQueue } from '../AsyncTaskQueue';

function link(dependent: Task, dependency: Task): void {
  dependent.dependencies.add(dependency);
  dependency.dependents.add(dependent);
}

describe('AsyncTaskQueue', () => {
  it('iterates tasks in the expected order', async () => {
    const tasks = [
      new Task(undefined!, TaskStatus.Ready),
      new Task(undefined!, TaskStatus.Ready),
      new Task(undefined!, TaskStatus.Ready),
      new Task(undefined!, TaskStatus.Ready)
    ];

    link(tasks[0], tasks[2]);
    link(tasks[3], tasks[1]);
    link(tasks[1], tasks[0]);

    const expectedOrder = [tasks[2], tasks[0], tasks[1], tasks[3]];
    const actualOrder = [];
    const queue: AsyncTaskQueue = new AsyncTaskQueue(tasks);
    for await (const task of queue) {
      actualOrder.push(task);
      for (const dependent of task.dependents) {
        dependent.dependencies.delete(task);
      }
    }

    expect(actualOrder).toEqual(expectedOrder);
  });

  it('handles concurrent iteration', async () => {
    const tasks = [
      new Task(undefined!, TaskStatus.Ready),
      new Task(undefined!, TaskStatus.Ready),
      new Task(undefined!, TaskStatus.Ready),
      new Task(undefined!, TaskStatus.Ready),
      new Task(undefined!, TaskStatus.Ready)
    ];

    // Set up to allow (0,1) -> (2) -> (3,4)
    link(tasks[2], tasks[0]);
    link(tasks[2], tasks[1]);
    link(tasks[3], tasks[2]);
    link(tasks[4], tasks[2]);

    const expectedConcurrency = new Map([
      [tasks[0], 2],
      [tasks[1], 2],
      [tasks[2], 1],
      [tasks[3], 2],
      [tasks[4], 2]
    ]);

    const actualConcurrency: Map<Task, number> = new Map();
    const queue: AsyncTaskQueue = new AsyncTaskQueue(tasks);
    let concurrency: number = 0;

    await Promise.all(
      Array.from(Array(2), async (unused: unknown, worker: number) => {
        for await (const task of queue) {
          ++concurrency;
          await Promise.resolve();

          actualConcurrency.set(task, concurrency);

          await Promise.resolve();

          for (const dependent of task.dependents) {
            dependent.dependencies.delete(task);
          }

          --concurrency;
        }
      })
    );

    for (const [task, taskConcurrency] of expectedConcurrency) {
      expect(actualConcurrency.get(task)).toEqual(taskConcurrency);
    }
  });
});
