/**
 * @file TaskRunner.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * Executes an arbitrary sequence of tasks based on their dependency graph
 */

import * as colors from 'colors';
import * as os from 'os';

import ITask, { ITaskDefinition } from './ITask';
import TaskStatus from './TaskStatus';
import TaskError from '../errorDetection/TaskError';
import ConsoleModerator, { DualTaskStream } from '@ms/console-moderator';
import { ErrorDetectionMode } from '../errorDetection/ErrorDetector';

/**
 * A class which manages the execution of a set of tasks with interdependencies.
 * Any class of task definition may be registered, and dependencies between tasks are
 * easily specified. Initially, and at the end of each task execution, all unblocked tasks
 * are added to a ready queue which is then executed. This is done continually until all
 * tasks are complete, or prematurely fails if any of the tasks fail. Note that all task
 * definitions must
 * @todo #168352: add unit tests
 */
export default class TaskRunner {
  private _tasks: Map<string, ITask>;
  private _readyTaskQueue: ITask[];
  private _quietMode: boolean;
  private _hasAnyFailures: boolean;
  private _moderator: ConsoleModerator<DualTaskStream>;

  constructor(quietMode: boolean = false) {
    this._tasks = new Map<string, ITask>();
    this._readyTaskQueue = [];
    this._quietMode = quietMode;
    this._hasAnyFailures = false;
    this._moderator = new ConsoleModerator<DualTaskStream>();
  }

  /**
   * Registers a task definition to the map of defined tasks
   */
  public addTask(taskDefinition: ITaskDefinition): void {
    if (this._tasks.has(taskDefinition.name)) {
      throw new Error('A task with that name has already been registered.');
    }

    // @todo #168287: do a copy here
    const task: ITask = taskDefinition as ITask;
    task.dependencies = [];
    task.dependents = [];
    task.errors = [];
    task.status = TaskStatus.Ready;
    this._tasks.set(task.name, task);
  }

  /**
   * Defines the list of dependencies for an individual task.
   * @param taskName - the string name of the task for which we are defining dependencies. A task with this
   * name must already have been registered.
   * @taskDependencies
   */
  public addDependencies(taskName: string, taskDependencies: string[]): void {
    const task: ITask = this._tasks.get(taskName);

    if (!task) {
      throw new Error(`The task '${taskName}' has not been registered`);
    }
    if (!taskDependencies) {
      throw new Error('The list of dependencies must be defined');
    }

    taskDependencies.forEach((dependencyName: string) => {
      const dependency: ITask = this._tasks.get(dependencyName);
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
  private _startAvailableTasks(complete: () => void, reject: () => void): void {
    if (!this._areAnyTasksReadyOrExecuting()) {
      this._printTaskStatus();
      if (this._hasAnyFailures) {
        reject();
      } else {
        complete();
      }
    }

    // @todo #168344: add ability to limit execution to n number of simultaneous tasks
    // @todo #168346: we should sort the ready task queue in such a way that we build projects with deps first
    while (this._readyTaskQueue.length) {
      const task: ITask = this._readyTaskQueue.shift();
      if (task.status === TaskStatus.Ready) {
        task.status = TaskStatus.Executing;
        console.log(colors.yellow(`> Starting task [${task.name}]`));

        const taskStream: DualTaskStream = new DualTaskStream(this._quietMode);

        this._moderator.registerTask(task.name, taskStream);

        task.execute(taskStream)
          .then(() => {
            taskStream.end();
            this._markTaskAsSuccess(task);
            this._startAvailableTasks(complete, reject);
          }).catch((errors: TaskError[]) => {
            taskStream.end();
            this._hasAnyFailures = true;
            task.errors = errors;
            this._markTaskAsFailed(task);
            this._startAvailableTasks(complete, reject);
          });
      }
    }
  }

  /**
   * Marks a task as having failed and marks each of its dependents as blocked
   */
  private _markTaskAsFailed(task: ITask): void {
    console.log(colors.red(`${os.EOL}> Completed task [${task.name}] with errors!`));
    task.status = TaskStatus.Failure;
    task.dependents.forEach((dependent: ITask) => {
      this._markTaskAsBlocked(dependent, task);
    });
  }

  /**
   * Marks a task and all its dependents as blocked
   */
  private _markTaskAsBlocked(task: ITask, failedTask: ITask): void {
    if (task.status === TaskStatus.Ready) {
      console.log(colors.red(`> [${task.name}] blocked by [${failedTask.name}]!`));
      task.status = TaskStatus.Blocked;
      task.dependents.forEach((dependent: ITask) => {
        this._markTaskAsBlocked(dependent, failedTask);
      });
    }
  }

  /**
   * Marks a task as being completed, and removes it from the dependencies list of all its dependents
   */
  private _markTaskAsSuccess(task: ITask): void {
    console.log(colors.green(`> Completed task [${task.name}]`));
    task.status = TaskStatus.Success;
    task.dependents.forEach((dependent: ITask) => {
      const i: number = dependent.dependencies.indexOf(task);
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
    let anyNonCompletedTasks: boolean = false;
    this._tasks.forEach((task: ITask) => {
      if (task.status === TaskStatus.Executing || task.status === TaskStatus.Ready) {
        anyNonCompletedTasks = true;
      }
    });
    return anyNonCompletedTasks;
  }

  /**
   * Prints out a report of the status of each project
   */
  private _printTaskStatus(): void {
    const tasksByStatus: { [status: number]: ITask[] } = {};
    this._tasks.forEach((task: ITask) => {
      if (tasksByStatus[task.status]) {
        tasksByStatus[task.status].push(task);
      } else {
        tasksByStatus[task.status] = [task];
      }
    });

    console.log('');

    this._printStatus('EXECUTING', tasksByStatus[TaskStatus.Executing], colors.yellow);
    this._printStatus('READY', tasksByStatus[TaskStatus.Ready], colors.white);
    this._printStatus('SUCCESS', tasksByStatus[TaskStatus.Success], colors.green);
    this._printStatus('BLOCKED', tasksByStatus[TaskStatus.Blocked], colors.red);
    this._printStatus('FAILURE', tasksByStatus[TaskStatus.Failure], colors.red);

    const tasksWithErrors: ITask[] = tasksByStatus[TaskStatus.Failure];
    if (tasksWithErrors) {
      tasksWithErrors.forEach((task: ITask) => {
        task.errors.forEach((error: TaskError) => {
          console.log(colors.red(`[${task.name}] ${error.toString(ErrorDetectionMode.LocalBuild) }`));
        });
      });
    }

    console.log('');
  }

  private _printStatus(status: string, tasks: ITask[], color: (a: string) => string): void {
    if (tasks && tasks.length) {
      console.log(color(`${status} (${tasks.length})`));
      console.log(color('================================'));
      for (const task of tasks) {
        console.log(color(task.name));
      }
      console.log(color('================================' + os.EOL));
    }
  }

}
