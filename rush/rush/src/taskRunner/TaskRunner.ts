/**
 * @file TaskRunner.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * Executes an arbitrary sequence of tasks based on their dependency graph
 */

import * as colors from 'colors';
import ITask, { ITaskDefinition } from './ITask';
import TaskStatus from './TaskStatus';
import TaskWriterFactory, { ITaskWriter } from './TaskWriterFactory';

/**
 * A class which manages the execution of a set of tasks with interdependencies.
 * Any class of task definition may be registered, and dependencies between tasks are
 * easily specified. Initially, and at the end of each task execution, all unblocked tasks
 * are added to a ready queue which is then executed. This is done continually until all
 * tasks are complete, or prematurely fails if any of the tasks fail. Note that all task
 * definitions must
 */
export default class TaskRunner {
  private _tasks: Map<string, ITask>;
  private _readyTaskQueue: ITask[];
  private _quietMode: boolean;

  constructor(quietMode: boolean = false) {
    this._tasks = new Map<string, ITask>();
    this._readyTaskQueue = [];
    this._quietMode = quietMode;
  }

  /**
   * Registers a task definition to the map of defined tasks
   */
  public addTask(taskDefinition: ITaskDefinition) {
    if (this._tasks.has(taskDefinition.name)) {
      throw new Error('A task with that name has already been registered.');
    }

    // @todo - do a copy here
    const task = taskDefinition as ITask;
    task.dependencies = [];
    task.dependents = [];
    task.status = TaskStatus.NotStarted;
    this._tasks.set(task.name, task);
  }

  /**
   * Defines the list of dependencies for an individual task.
   * @param taskName - the string name of the task for which we are defining dependencies. A task with this
   * name must already have been registered.
   * @taskDependencies
   */
  public addDependencies(taskName: string, taskDependencies: string[]) {
    const task = this._tasks.get(taskName);

    if (!task) {
      throw new Error(`The task '${taskName}' has not been registered`);
    }
    if (!taskDependencies) {
      throw new Error('The list of dependencies must be defined');
    }

    taskDependencies.forEach((dependencyName: string) => {
      const dependency = this._tasks.get(dependencyName);
      task.dependencies.push(dependency);
      dependency.dependents.push(task);
    });
  }

  /**
   * Executes all tasks which have been registered, returning a promise which is resolved when all the
   * tasks are completed successfully, or rejects when any task fails.
   */
  public execute(): Promise<void> {
    this._tasks.forEach((task: ITask) => {
      if (task.dependencies.length === 0 && task.status === TaskStatus.NotStarted) {
        this._readyTaskQueue.push(task);
      }
    });

    return new Promise<void>((complete: () => void, reject: () => void) => {
      this._startAvailableTasks(complete, reject);
    });
  }

  /**
   * Helper function which finds any tasks which are available to run and begins executing them.
   * It calls the complete callback when all tasks are completed, or rejects if any task fails.
   */
  private _startAvailableTasks(complete: () => void, reject: () => void) {
    if (this._areAllTasksCompleted()) {
      console.log(colors.green('> TaskRunner :: All tasks completed!\n'));
      complete();
    }

    // @todo - add ability to limit execution to n number of simultaneous tasks
    while (this._readyTaskQueue.length) {
      const task: ITask = this._readyTaskQueue.shift();
      if (task.status === TaskStatus.NotStarted) {
        task.status = TaskStatus.Executing;
        console.log(colors.yellow(`> TaskRunner :: Starting task [${task.name}]`));

        let taskWriter = TaskWriterFactory.registerTask(task.name, this._quietMode);

        let onTaskComplete = (completedTask: ITask, writer: ITaskWriter) => {
          writer.close();
          this._markTaskAsCompleted(completedTask);
          this._startAvailableTasks(complete, reject);
        };

        let onTaskFail = (failedTask: ITask, writer: ITaskWriter) => {
          writer.close();
          reject();
        };

        task.execute(taskWriter).then(onTaskComplete.bind(this, task, taskWriter), onTaskFail.bind(this, task, taskWriter));
      }
    }
  }

  /**
   * Marks a task as being completed, and removes it from the dependencies list of all its dependents
   */
  private _markTaskAsCompleted(task: ITask) {
    console.log(colors.green(`> TaskRunner :: Completed task [${task.name}]\n`));
    task.status = TaskStatus.Completed;
    task.dependents.forEach((dependent: ITask) => {
      const i = dependent.dependencies.indexOf(task);
      if (i !== -1) {
        dependent.dependencies.splice(i, 1);
      }

      if (dependent.dependencies.length === 0 && dependent.status === TaskStatus.NotStarted) {
        this._readyTaskQueue.push(dependent);
      }
    });
  }

  /**
   * Iterates through all tasks and returns true if all have been completed.
   */
  private _areAllTasksCompleted(): boolean {
    let anyNonCompletedTasks = true;
    this._tasks.forEach((task: ITask) => {
      if (task.status !== TaskStatus.Completed) {
        anyNonCompletedTasks = false;
      }
    });
    return anyNonCompletedTasks;
  }
}
