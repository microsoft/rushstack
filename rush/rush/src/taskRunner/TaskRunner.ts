/**
 * @file TaskRunner.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * Executes an arbitrary sequence of tasks based on their dependency graph
 */

import * as colors from 'colors';
import * as os from 'os';
import { Interleaver, ITaskWriter } from '@microsoft/stream-collator';
import {
  TaskError,
  ErrorDetectionMode,
  Stopwatch
} from '@microsoft/rush-lib';

import ITask, { ITaskDefinition } from './ITask';
import TaskStatus from './TaskStatus';

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
  private _buildQueue: ITask[];
  private _quietMode: boolean;
  private _hasAnyFailures: boolean;
  private _parallelism: number;
  private _currentActiveTasks: number;

  constructor(quietMode: boolean = false, parallelism?: number) {
    this._tasks = new Map<string, ITask>();
    this._buildQueue = [];
    this._quietMode = quietMode;
    this._hasAnyFailures = false;

    this._parallelism = parallelism || os.cpus().length;
  }

  /**
   * Registers a task definition to the map of defined tasks
   */
  public addTask(taskDefinition: ITaskDefinition): void {
    if (this._tasks.has(taskDefinition.name)) {
      throw new Error('A task with that name has already been registered.');
    }

    const task: ITask = taskDefinition as ITask;
    task.dependencies = [];
    task.dependents = [];
    task.errors = [];
    task.status = TaskStatus.Ready;
    task.criticalPathLength = undefined;
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
    this._currentActiveTasks = 0;
    console.log(`Executing a maximum of ${this._parallelism} simultaneous processes...`);

    // Precalculate the number of dependent packages
    this._tasks.forEach((task: ITask) => {
      this._calculateCriticalPaths(task);
    });

    // Add everything to the buildQueue
    this._tasks.forEach((task: ITask) => {
      this._buildQueue.push(task);
    });

    // Sort the queue in descending order, nothing will mess with the order
    this._buildQueue.sort((taskA: ITask, taskB: ITask): number => {
      return taskB.criticalPathLength - taskA.criticalPathLength;
    });

    return new Promise<void>((complete: () => void, reject: () => void) => {
      this._startAvailableTasks(complete, reject);
    });
  }

  /**
   * Pulls the next task with no dependencies off the build queue
   * Removes any non-ready tasks from the build queue (this should only be blocked tasks)
   */
  private _getNextTask(): ITask {
    for (let i: number = 0; i < this._buildQueue.length; i++) {
      const task: ITask = this._buildQueue[i];

      if (task.status !== TaskStatus.Ready) {
        // It shouldn't be on the queue, remove it
        this._buildQueue.splice(i, 1);
        // Decrement since we modified the array
        i--;
      } else if (task.dependencies.length === 0 && task.status === TaskStatus.Ready) {
        // this is a task which is ready to go. remove it and return it
        return this._buildQueue.splice(i, 1)[0];
      }
      // Otherwise task is still waiting
    }
    return undefined; // There are no tasks ready to go at this time
  }

  /**
   * Helper function which finds any tasks which are available to run and begins executing them.
   * It calls the complete callback when all tasks are completed, or rejects if any task fails.
   */
  private _startAvailableTasks(complete: () => void, reject: (err?: Object) => void): void {
    if (!this._areAnyTasksReadyOrExecuting()) {
      this._printTaskStatus();
      if (this._hasAnyFailures) {
        reject();
      } else {
        complete();
      }
    }

    let ctask: ITask;
    while (this._currentActiveTasks < this._parallelism && (ctask = this._getNextTask())) {
      const task: ITask = ctask;
      task.status = TaskStatus.Executing;
      console.log(colors.yellow(`> Starting task [${task.name}]`));

      const taskWriter: ITaskWriter = Interleaver.registerTask(task.name, this._quietMode);

      task.stopwatch = Stopwatch.start();

      task.execute(taskWriter)
        .then(() => {
          task.stopwatch.stop();
          taskWriter.close();

          this._markTaskAsSuccess(task);
          this._startAvailableTasks(complete, reject);

        }).catch((errors: TaskError[]) => {
          taskWriter.close();

          this._hasAnyFailures = true;
          task.errors = errors;
          this._markTaskAsFailed(task);
          this._startAvailableTasks(complete, reject);
        }
      );
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
    console.log(colors.green(`> Completed task [${task.name}] in ${task.stopwatch.toString()}`));
    task.status = TaskStatus.Success;
    task.dependents.forEach((dependent: ITask) => {
      const i: number = dependent.dependencies.indexOf(task);
      if (i !== -1) {
        dependent.dependencies.splice(i, 1);
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
   * Calculate the number of packages which must be build before we reach
   * the furthest away "root" node
   */
  private _calculateCriticalPaths(task: ITask): number {
    // Return the memoized value
    if (task.criticalPathLength !== undefined) {
      return task.criticalPathLength;
    }

    // If no dependents, we are in a "root"
    if (task.dependents.length === 0) {
      return task.criticalPathLength = 0;
    } else {
      // Otherwise we are as long as the longest package + 1
      return task.criticalPathLength = Math.max(
        ...task.dependents.map((dep) => this._calculateCriticalPaths(dep))
      ) + 1;
    }
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
