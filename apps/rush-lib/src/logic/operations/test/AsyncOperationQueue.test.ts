// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Task } from '../Task';
import { TaskStatus } from '../TaskStatus';
import { MockTaskRunner } from './MockTaskRunner';
import { AsyncTaskQueue, ITaskSortFunction } from '../AsyncTaskQueue';

function addDependency(dependent: Task, dependency: Task): void {
  dependent.dependencies.add(dependency);
}

function nullSort(a: Task, b: Task): number {
  return 0;
}

describe('AsyncTaskQueue', () => {
  it('iterates tasks in topological order', async () => {
    const tasks = [
      new Task(new MockTaskRunner('a')!, TaskStatus.Ready),
      new Task(new MockTaskRunner('b')!, TaskStatus.Ready),
      new Task(new MockTaskRunner('c')!, TaskStatus.Ready),
      new Task(new MockTaskRunner('d')!, TaskStatus.Ready)
    ];

    addDependency(tasks[0], tasks[2]);
    addDependency(tasks[3], tasks[1]);
    addDependency(tasks[1], tasks[0]);

    const expectedOrder = [tasks[2], tasks[0], tasks[1], tasks[3]];
    const actualOrder = [];
    const queue: AsyncTaskQueue = new AsyncTaskQueue(tasks, nullSort);
    for await (const task of queue) {
      actualOrder.push(task);
      for (const dependent of task.dependents) {
        dependent.dependencies.delete(task);
      }
    }

    expect(actualOrder).toEqual(expectedOrder);
  });

  it('respects the sort predicate', async () => {
    const tasks = [
      new Task(new MockTaskRunner('a')!, TaskStatus.Ready),
      new Task(new MockTaskRunner('b')!, TaskStatus.Ready),
      new Task(new MockTaskRunner('c')!, TaskStatus.Ready),
      new Task(new MockTaskRunner('d')!, TaskStatus.Ready)
    ];

    const expectedOrder = [tasks[2], tasks[0], tasks[1], tasks[3]];
    const actualOrder = [];
    const customSort: ITaskSortFunction = (a: Task, b: Task): number => {
      return expectedOrder.indexOf(b) - expectedOrder.indexOf(a);
    };

    const queue: AsyncTaskQueue = new AsyncTaskQueue(tasks, customSort);
    for await (const task of queue) {
      actualOrder.push(task);
      for (const dependent of task.dependents) {
        dependent.dependencies.delete(task);
      }
    }

    expect(actualOrder).toEqual(expectedOrder);
  });

  it('detects cyles', async () => {
    const tasks = [
      new Task(new MockTaskRunner('a')!, TaskStatus.Ready),
      new Task(new MockTaskRunner('b')!, TaskStatus.Ready),
      new Task(new MockTaskRunner('c')!, TaskStatus.Ready),
      new Task(new MockTaskRunner('d')!, TaskStatus.Ready)
    ];

    addDependency(tasks[0], tasks[2]);
    addDependency(tasks[2], tasks[3]);
    addDependency(tasks[3], tasks[1]);
    addDependency(tasks[1], tasks[0]);

    expect(() => {
      new AsyncTaskQueue(tasks, nullSort);
    }).toThrowErrorMatchingSnapshot();
  });

  it('handles concurrent iteration', async () => {
    const tasks = [
      new Task(new MockTaskRunner('a')!, TaskStatus.Ready),
      new Task(new MockTaskRunner('b')!, TaskStatus.Ready),
      new Task(new MockTaskRunner('c')!, TaskStatus.Ready),
      new Task(new MockTaskRunner('d')!, TaskStatus.Ready),
      new Task(new MockTaskRunner('e')!, TaskStatus.Ready)
    ];

    // Set up to allow (0,1) -> (2) -> (3,4)
    addDependency(tasks[2], tasks[0]);
    addDependency(tasks[2], tasks[1]);
    addDependency(tasks[3], tasks[2]);
    addDependency(tasks[4], tasks[2]);

    const expectedConcurrency = new Map([
      [tasks[0], 2],
      [tasks[1], 2],
      [tasks[2], 1],
      [tasks[3], 2],
      [tasks[4], 2]
    ]);

    const actualConcurrency: Map<Task, number> = new Map();
    const queue: AsyncTaskQueue = new AsyncTaskQueue(tasks, nullSort);
    let concurrency: number = 0;

    // Use 3 concurrent iterators to verify that it handles having more than the task concurrency
    await Promise.all(
      Array.from({ length: 3 }, async () => {
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
