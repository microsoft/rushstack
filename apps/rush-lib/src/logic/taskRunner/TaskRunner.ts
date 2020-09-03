// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import { Interleaver } from '@rushstack/stream-collator';
import {
  Terminal,
  ConsoleTerminalProvider,
  Colors,
  IColorableSequence,
  AlreadyReportedError
} from '@rushstack/node-core-library';

import { Stopwatch } from '../../utilities/Stopwatch';
import { Task } from './Task';
import { TaskStatus } from './TaskStatus';
import { TaskError } from './TaskError';

export interface ITaskRunnerOptions {
  quietMode: boolean;
  parallelism: string | undefined;
  changedProjectsOnly: boolean;
  allowWarningsInSuccessfulBuild: boolean;
  terminal?: Terminal;
}

/**
 * A class which manages the execution of a set of tasks with interdependencies.
 * Initially, and at the end of each task execution, all unblocked tasks
 * are added to a ready queue which is then executed. This is done continually until all
 * tasks are complete, or prematurely fails if any of the tasks fail.
 */
export class TaskRunner {
  private _tasks: Task[];
  private _changedProjectsOnly: boolean;
  private _allowWarningsInSuccessfulBuild: boolean;
  private _buildQueue: Task[];
  private _quietMode: boolean;
  private _hasAnyFailures: boolean;
  private _hasAnyWarnings: boolean;
  private _parallelism: number;
  private _currentActiveTasks: number;
  private _totalTasks: number;
  private _completedTasks: number;
  private _terminal: Terminal;

  public constructor(orderedTasks: Task[], options: ITaskRunnerOptions) {
    const {
      quietMode,
      parallelism,
      changedProjectsOnly,
      allowWarningsInSuccessfulBuild,
      terminal = new Terminal(new ConsoleTerminalProvider())
    } = options;
    this._tasks = orderedTasks;
    this._buildQueue = orderedTasks.slice(0);
    this._quietMode = quietMode;
    this._hasAnyFailures = false;
    this._hasAnyWarnings = false;
    this._changedProjectsOnly = changedProjectsOnly;
    this._allowWarningsInSuccessfulBuild = allowWarningsInSuccessfulBuild;
    this._terminal = terminal;

    const numberOfCores: number = os.cpus().length;

    if (parallelism) {
      if (parallelism === 'max') {
        this._parallelism = numberOfCores;
      } else {
        const parallelismInt: number = parseInt(parallelism, 10);

        if (isNaN(parallelismInt)) {
          throw new Error(`Invalid parallelism value of '${parallelism}', expected a number or 'max'`);
        }

        this._parallelism = parallelismInt;
      }
    } else {
      // If an explicit parallelism number wasn't provided, then choose a sensible
      // default.
      if (os.platform() === 'win32') {
        // On desktop Windows, some people have complained that their system becomes
        // sluggish if Rush is using all the CPU cores.  Leave one thread for
        // other operations. For CI environments, you can use the "max" argument to use all available cores.
        this._parallelism = Math.max(numberOfCores - 1, 1);
      } else {
        // Unix-like operating systems have more balanced scheduling, so default
        // to the number of CPU cores
        this._parallelism = numberOfCores;
      }
    }
  }

  /**
   * Executes all tasks which have been registered, returning a promise which is resolved when all the
   * tasks are completed successfully, or rejects when any task fails.
   */
  public async executeAsync(): Promise<void> {
    this._currentActiveTasks = 0;
    this._completedTasks = 0;
    this._totalTasks = this._buildQueue.length;
    this._terminal.writeLine(
      `Executing a maximum of ${this._parallelism} simultaneous processes...${os.EOL}`
    );

    await this._startAvailableTasksAsync();

    this._printTaskStatus();

    if (this._hasAnyFailures) {
      throw new Error('Project(s) failed');
    } else if (this._hasAnyWarnings && !this._allowWarningsInSuccessfulBuild) {
      this._terminal.writeWarningLine('Project(s) succeeded with warnings');
      throw new AlreadyReportedError();
    }
  }

  /**
   * Pulls the next task with no dependencies off the build queue
   * Removes any non-ready tasks from the build queue (this should only be blocked tasks)
   */
  private _getNextTask(): Task | undefined {
    for (let i: number = 0; i < this._buildQueue.length; i++) {
      const task: Task = this._buildQueue[i];

      if (task.status !== TaskStatus.Ready) {
        // It shouldn't be on the queue, remove it
        this._buildQueue.splice(i, 1);
        // Decrement since we modified the array
        i--;
      } else if (task.dependencies.size === 0 && task.status === TaskStatus.Ready) {
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
  private _startAvailableTasksAsync(): Promise<void> {
    const taskPromises: Promise<void>[] = [];
    let ctask: Task | undefined;
    while (this._currentActiveTasks < this._parallelism && (ctask = this._getNextTask())) {
      this._currentActiveTasks++;
      const task: Task = ctask;
      task.status = TaskStatus.Executing;
      this._terminal.writeLine(Colors.white(`[${task.name}] started`));

      task.stopwatch = Stopwatch.start();
      task.writer = Interleaver.registerTask(task.name, this._quietMode);

      taskPromises.push(
        task.builder
          .executeAsync(task.writer)
          .then((result: TaskStatus) => {
            task.stopwatch.stop();
            task.writer.close();

            this._currentActiveTasks--;
            this._completedTasks++;
            switch (result) {
              case TaskStatus.Success:
                this._markTaskAsSuccess(task);
                break;
              case TaskStatus.SuccessWithWarning:
                this._hasAnyWarnings = true;
                this._markTaskAsSuccessWithWarning(task);
                break;
              case TaskStatus.Skipped:
                this._markTaskAsSkipped(task);
                break;
              case TaskStatus.Failure:
                this._hasAnyFailures = true;
                this._markTaskAsFailed(task);
                break;
            }
          })
          .catch((error: TaskError) => {
            task.writer.close();

            this._currentActiveTasks--;

            this._hasAnyFailures = true;
            task.error = error;
            this._markTaskAsFailed(task);
          })
          .then(() => this._startAvailableTasksAsync())
      );
    }

    return Promise.all(taskPromises).then(() => {
      /* collapse void[] to void */
    });
  }

  /**
   * Marks a task as having failed and marks each of its dependents as blocked
   */
  private _markTaskAsFailed(task: Task): void {
    this._terminal.writeErrorLine(`${os.EOL}${this._getCurrentCompletedTaskString()}[${task.name}] failed!`);
    task.status = TaskStatus.Failure;
    task.dependents.forEach((dependent: Task) => {
      this._markTaskAsBlocked(dependent, task);
    });
  }

  /**
   * Marks a task and all its dependents as blocked
   */
  private _markTaskAsBlocked(task: Task, failedTask: Task): void {
    if (task.status === TaskStatus.Ready) {
      this._completedTasks++;
      this._terminal.writeErrorLine(
        `${this._getCurrentCompletedTaskString()}[${task.name}] blocked by [${failedTask.name}]!`
      );
      task.status = TaskStatus.Blocked;
      task.dependents.forEach((dependent: Task) => {
        this._markTaskAsBlocked(dependent, failedTask);
      });
    }
  }

  /**
   * Marks a task as being completed, and removes it from the dependencies list of all its dependents
   */
  private _markTaskAsSuccess(task: Task): void {
    if (task.builder.hadEmptyScript) {
      this._terminal.writeLine(
        Colors.green(`${this._getCurrentCompletedTaskString()}[${task.name}] had an empty script`)
      );
    } else {
      this._terminal.writeLine(
        Colors.green(
          `${this._getCurrentCompletedTaskString()}` +
            `[${task.name}] completed successfully in ${task.stopwatch.toString()}`
        )
      );
    }
    task.status = TaskStatus.Success;

    task.dependents.forEach((dependent: Task) => {
      if (!this._changedProjectsOnly) {
        dependent.builder.isIncrementalBuildAllowed = false;
      }
      dependent.dependencies.delete(task);
    });
  }

  /**
   * Marks a task as being completed, but with warnings written to stderr, and removes it from the dependencies
   * list of all its dependents
   */
  private _markTaskAsSuccessWithWarning(task: Task): void {
    this._terminal.writeWarningLine(
      `${this._getCurrentCompletedTaskString()}` +
        `[${task.name}] completed with warnings in ${task.stopwatch.toString()}`
    );
    task.status = TaskStatus.SuccessWithWarning;
    task.dependents.forEach((dependent: Task) => {
      if (!this._changedProjectsOnly) {
        dependent.builder.isIncrementalBuildAllowed = false;
      }
      dependent.dependencies.delete(task);
    });
  }

  /**
   * Marks a task as skipped.
   */
  private _markTaskAsSkipped(task: Task): void {
    this._terminal.writeLine(Colors.green(`${this._getCurrentCompletedTaskString()}[${task.name}] skipped`));
    task.status = TaskStatus.Skipped;
    task.dependents.forEach((dependent: Task) => {
      dependent.dependencies.delete(task);
    });
  }

  private _getCurrentCompletedTaskString(): string {
    return `${this._completedTasks} of ${this._totalTasks}: `;
  }

  /**
   * Prints out a report of the status of each project
   */
  private _printTaskStatus(): void {
    const tasksByStatus: { [status: number]: Task[] } = {};
    this._tasks.forEach((task: Task) => {
      if (tasksByStatus[task.status]) {
        tasksByStatus[task.status].push(task);
      } else {
        tasksByStatus[task.status] = [task];
      }
    });

    this._terminal.writeLine('');

    this._printStatus(TaskStatus.Executing, tasksByStatus, Colors.yellow);
    this._printStatus(TaskStatus.Ready, tasksByStatus, Colors.white);
    this._printStatus(TaskStatus.Skipped, tasksByStatus, Colors.gray);
    this._printStatus(TaskStatus.Success, tasksByStatus, Colors.green);
    this._printStatus(
      TaskStatus.SuccessWithWarning,
      tasksByStatus,
      (text: string) => Colors.yellow(text),
      (text: string) => Colors.yellow(Colors.underline(text))
    );
    this._printStatus(TaskStatus.Blocked, tasksByStatus, Colors.red);
    this._printStatus(TaskStatus.Failure, tasksByStatus, Colors.red);

    const tasksWithErrors: Task[] = tasksByStatus[TaskStatus.Failure];
    if (tasksWithErrors) {
      tasksWithErrors.forEach((task: Task) => {
        if (task.error) {
          this._terminal.writeErrorLine(`[${task.name}] ${task.error.message}`);
        }
      });
    }

    this._terminal.writeLine('');
  }

  private _printStatus(
    status: TaskStatus,
    tasksByStatus: { [status: number]: Task[] },
    color: (text: string) => IColorableSequence,
    headingColor: (text: string) => IColorableSequence = color
  ): void {
    const tasks: Task[] = tasksByStatus[status];

    if (tasks && tasks.length) {
      this._terminal.writeLine(headingColor(`${status} (${tasks.length})`));
      this._terminal.writeLine(color('================================'));
      for (let i: number = 0; i < tasks.length; i++) {
        const task: Task = tasks[i];

        switch (status) {
          case TaskStatus.Executing:
          case TaskStatus.Ready:
          case TaskStatus.Skipped:
            this._terminal.writeLine(color(task.name));
            break;

          case TaskStatus.Success:
          case TaskStatus.SuccessWithWarning:
          case TaskStatus.Blocked:
          case TaskStatus.Failure:
            if (task.stopwatch && !task.builder.hadEmptyScript) {
              const time: string = task.stopwatch.toString();
              this._terminal.writeLine(headingColor(`${task.name} (${time})`));
            } else {
              this._terminal.writeLine(headingColor(`${task.name}`));
            }
            break;
        }

        if (task.writer) {
          const stderr: string = task.writer.getStdError();
          const shouldPrintDetails: boolean =
            task.status === TaskStatus.Failure || task.status === TaskStatus.SuccessWithWarning;
          let details: string = stderr ? stderr : task.writer.getStdOutput();
          if (details && shouldPrintDetails) {
            details = this._abridgeTaskReport(details);
            this._terminal.writeLine(details + (i !== tasks.length - 1 ? os.EOL : ''));
          }
        }
      }

      this._terminal.writeLine(color('================================' + os.EOL));
    }
  }

  /**
   * Remove trailing blanks, and all middle lines if text is large
   */
  private _abridgeTaskReport(text: string): string {
    const headSize: number = 10;
    const tailSize: number = 20;
    const margin: number = 10;
    const lines: string[] = text.split(/\s*\r?\n/).filter((line) => line);
    if (lines.length < headSize + tailSize + margin) {
      return lines.join(os.EOL);
    }
    const amountRemoved: number = lines.length - headSize - tailSize;
    const head: string = lines.splice(0, headSize).join(os.EOL);
    const tail: string = lines.splice(-tailSize).join(os.EOL);
    return `${head}${os.EOL}[...${amountRemoved} lines omitted...]${os.EOL}${tail}`;
  }
}
