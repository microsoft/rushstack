/**
 * @file TaskRunner.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * Executes an arbitrary sequence of tasks based on their dependency graph
 */

import * as colors from 'colors';
import * as assert from 'assert';

import ITask, { ITaskDefinition } from './ITask';
import TaskStatus from './TaskStatus';
import TaskError from '../errorDetection/TaskError';
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
  private _hasAnyFailures: boolean;

  constructor(quietMode: boolean = false) {
    this._tasks = new Map<string, ITask>();
    this._readyTaskQueue = [];
    this._quietMode = quietMode;
    this._hasAnyFailures = false;
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
    task.status = TaskStatus.Ready;
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
      if (task.dependencies.length === 0 && task.status === TaskStatus.Ready) {
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
    if (!this._areAnyTasksReadyOrExecuting()) {
      if (this._hasAnyFailures) {
        console.log(colors.red('> TaskRunner :: Failures'));
        reject();
      } else {
        console.log(colors.green('> TaskRunner :: All tasks completed!\n'));
        complete();
      }
    }

    // @todo - add ability to limit execution to n number of simultaneous tasks
    // @todo - we should sort the ready task queue in such a way that we build projects with deps first
    while (this._readyTaskQueue.length) {
      const task: ITask = this._readyTaskQueue.shift();
      if (task.status === TaskStatus.Ready) {
        task.status = TaskStatus.Executing;
        console.log(colors.yellow(`> TaskRunner :: Starting task [${task.name}]`));

        let taskWriter = TaskWriterFactory.registerTask(task.name, this._quietMode);

        let onTaskComplete = (completedTask: ITask, writer: ITaskWriter) => {
          writer.close();
          this._markTaskAsSuccess(completedTask);
          this._startAvailableTasks(complete, reject);
        };

        let onTaskFail = (failedTask: ITask, writer: ITaskWriter, errors: TaskError[]) => {
          writer.close();
          this._hasAnyFailures = true;
          this._markTaskAsFailed(failedTask);
          this._startAvailableTasks(complete, reject);
        };

        task.execute(taskWriter).then(onTaskComplete.bind(this, task, taskWriter), onTaskFail.bind(this, task, taskWriter));
      }
    }
  }

  /**
   * Marks a task as having failed and marks each of its dependents as blocked
   */
  private _markTaskAsFailed(task: ITask) {
    console.log(colors.red(`> TaskRunner :: Completed task [${task.name}] with errors!`));
    task.status = TaskStatus.Failure;
    task.dependents.forEach((dependent: ITask) => {
      this._markTaskAsBlocked(dependent, task);
    });
  }

  /**
   * Marks a task and all its dependents as blocked
   */
  private _markTaskAsBlocked(task: ITask, failedTask: ITask) {
    assert.equal(task.status, TaskStatus.Ready, 'Tasks being marked as blocked should be in the ready state');
    console.log(colors.red(`> TaskRunner :: [${task.name}] blocked by [${failedTask.name}]!`));
    task.status = TaskStatus.Blocked;
    task.dependents.forEach((dependent: ITask) => {
      this._markTaskAsBlocked(dependent, failedTask);
    });
  }

  /**
   * Marks a task as being completed, and removes it from the dependencies list of all its dependents
   */
  private _markTaskAsSuccess(task: ITask) {
    console.log(colors.green(`> TaskRunner :: Completed task [${task.name}]`));
    task.status = TaskStatus.Success;
    task.dependents.forEach((dependent: ITask) => {
      const i = dependent.dependencies.indexOf(task);
      if (i !== -1) {
        dependent.dependencies.splice(i, 1);
      }

      if (dependent.dependencies.length === 0 && dependent.status === TaskStatus.Ready) {
        this._readyTaskQueue.push(dependent);
      }
    });
  }

  /**
   * Do any Ready or Executing tasks exist?
   */
  private _areAnyTasksReadyOrExecuting(): boolean {
    let anyNonCompletedTasks = false;
    this._tasks.forEach((task: ITask) => {
      if (task.status === TaskStatus.Executing || task.status === TaskStatus.Ready) {
        anyNonCompletedTasks = true;
      }
    });
    return anyNonCompletedTasks;
  }
}
