// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as colors from 'colors';
import {
  StreamCollator,
  CollatedTerminal,
  StdioSummarizer,
  TerminalWritable,
  StdioWritable,
  TerminalChunkKind,
  CharMatcherTransform,
  CollatedWriter
} from '@rushstack/stream-collator';
import { AlreadyReportedError, NewlineKind } from '@rushstack/node-core-library';

import { Stopwatch } from '../../utilities/Stopwatch';
import { Task } from './Task';
import { TaskStatus } from './TaskStatus';
import { IBuilderContext } from './BaseBuilder';

export interface ITaskRunnerOptions {
  quietMode: boolean;
  parallelism: string | undefined;
  changedProjectsOnly: boolean;
  allowWarningsInSuccessfulBuild: boolean;
  destination?: TerminalWritable;
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

  private readonly _outputWritable: TerminalWritable;
  private readonly _colorsNewlinesTransform: CharMatcherTransform;
  private readonly _streamCollator: StreamCollator;

  private _terminal: CollatedTerminal;

  public constructor(orderedTasks: Task[], options: ITaskRunnerOptions) {
    const { quietMode, parallelism, changedProjectsOnly, allowWarningsInSuccessfulBuild } = options;
    this._tasks = orderedTasks;
    this._buildQueue = orderedTasks.slice(0);
    this._quietMode = quietMode;
    this._hasAnyFailures = false;
    this._hasAnyWarnings = false;
    this._changedProjectsOnly = changedProjectsOnly;
    this._allowWarningsInSuccessfulBuild = allowWarningsInSuccessfulBuild;

    // TERMINAL PIPELINE:
    //
    // streamCollator --> colorsNewlinesTransform --> StdioWritable
    //
    this._outputWritable = options.destination ? options.destination : StdioWritable.instance;
    this._colorsNewlinesTransform = new CharMatcherTransform({
      destination: this._outputWritable,
      normalizeNewlines: NewlineKind.OsDefault,
      removeColors: !colors.enabled
    });
    this._streamCollator = new StreamCollator({
      destination: this._colorsNewlinesTransform,
      onWriterActive: this._streamCollator_onWriterActive
    });
    this._terminal = this._streamCollator.terminal;

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

  private _streamCollator_onWriterActive = (writer: CollatedWriter | undefined): void => {
    if (writer) {
      this._completedTasks++;

      // Format a header like this, for a shell window with classic 80 columns
      //
      // ==[ @rushstack/the-long-thing ]=================[ 1 of 1000 ]==
      const headerWidth: number = 79;

      // leftPart: "==[ @rushstack/the-long-thing "
      const leftPart: string = colors.gray('==[') + ' ' + colors.cyan(writer.taskName) + ' ';
      const leftPartLength: number = 4 + writer.taskName.length + 1;

      // rightPart: " 1 of 1000 ]=="
      const completedOfTotal: string = `${this._completedTasks} of ${this._totalTasks}`;
      const rightPart: string = ' ' + colors.white(completedOfTotal) + ' ' + colors.gray(']==');
      const rightPartLength: number = 1 + completedOfTotal.length + 4;

      // middlePart: "]=================["
      const twoBracketsLength: number = 2;
      const middlePartLengthMinusTwoBrackets: number = Math.max(
        headerWidth - (leftPartLength + rightPartLength + twoBracketsLength),
        0
      );

      const middlePart: string = colors.gray(']' + '='.repeat(middlePartLengthMinusTwoBrackets) + '[');

      this._terminal.writeStdoutLine('\n' + leftPart + middlePart + rightPart + '\n');
    }
  };

  /**
   * Executes all tasks which have been registered, returning a promise which is resolved when all the
   * tasks are completed successfully, or rejects when any task fails.
   */
  public async executeAsync(): Promise<void> {
    this._currentActiveTasks = 0;
    this._completedTasks = 0;
    this._totalTasks = this._tasks.length;

    if (!this._quietMode) {
      const plural: string = this._tasks.length === 1 ? '' : 's';
      this._terminal.writeStdoutLine(`Selected ${this._tasks.length} project${plural}:`);
      this._terminal.writeStdoutLine(
        this._tasks
          .map((x) => `  ${x.name}`)
          .sort()
          .join('\n')
      );
      this._terminal.writeStdoutLine('');
    }

    this._terminal.writeStdoutLine(`Executing a maximum of ${this._parallelism} simultaneous processes...`);

    await this._startAvailableTasksAsync();

    this._printTaskStatus();

    if (this._hasAnyFailures) {
      throw new Error('Project(s) failed');
    } else if (this._hasAnyWarnings && !this._allowWarningsInSuccessfulBuild) {
      this._terminal.writeStderrLine('Project(s) succeeded with warnings');
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

      task.stopwatch = Stopwatch.start();
      task.collatedWriter = this._streamCollator.registerTask(task.name);
      task.stdioSummarizer = new StdioSummarizer();

      taskPromises.push(this._executeTaskAndChainAsync(task));
    }

    return Promise.all(taskPromises).then(() => {
      // collapse void[] to void
    });
  }

  private async _executeTaskAndChainAsync(task: Task): Promise<void> {
    const context: IBuilderContext = {
      stdioSummarizer: task.stdioSummarizer,
      collatedWriter: task.collatedWriter,
      quietMode: this._quietMode
    };

    try {
      const result: TaskStatus = await task.builder.executeAsync(context);

      task.stopwatch.stop();
      task.stdioSummarizer.close();

      this._currentActiveTasks--;
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
    } catch (error) {
      task.stdioSummarizer.close();

      this._currentActiveTasks--;

      this._hasAnyFailures = true;

      // eslint-disable-next-line require-atomic-updates
      task.error = error;

      this._markTaskAsFailed(task);
    }

    task.collatedWriter.close();

    await this._startAvailableTasksAsync();
  }

  /**
   * Marks a task as having failed and marks each of its dependents as blocked
   */
  private _markTaskAsFailed(task: Task): void {
    task.collatedWriter.terminal.writeStderrLine(colors.red(`"${task.name}" failed to build.`));
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
      task.collatedWriter.terminal.writeStderrLine(`"${task.name}" is blocked by "${failedTask.name}".`);
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
      task.collatedWriter.terminal.writeStdoutLine(colors.green(`"${task.name}" had an empty script.`));
    } else {
      task.collatedWriter.terminal.writeStdoutLine(
        colors.green(`"${task.name}" completed successfully in ${task.stopwatch.toString()}.`)
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
    task.collatedWriter.terminal.writeStderrLine(
      colors.yellow(`"${task.name}" completed with warnings in ${task.stopwatch.toString()}.`)
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
    task.collatedWriter.terminal.writeStdoutLine(colors.green(`${task.name} was skipped.`));
    task.status = TaskStatus.Skipped;
    task.dependents.forEach((dependent: Task) => {
      dependent.dependencies.delete(task);
    });
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

    this._terminal.writeStderrLine('');

    // These cases should never happen:
    this._printStatus(TaskStatus.Executing, tasksByStatus, colors.red);
    this._printStatus(TaskStatus.Ready, tasksByStatus, colors.red);

    // These are ordered so that the most interesting statuses appear last:
    this._printStatus(TaskStatus.Skipped, tasksByStatus, colors.gray);
    this._printStatus(TaskStatus.Success, tasksByStatus, colors.green);
    this._printStatus(
      TaskStatus.SuccessWithWarning,
      tasksByStatus,
      (text: string) => colors.yellow(text),
      (text: string) => colors.yellow(colors.underline(text))
    );
    this._printStatus(TaskStatus.Blocked, tasksByStatus, colors.red);
    this._printStatus(TaskStatus.Failure, tasksByStatus, colors.red);

    const tasksWithErrors: Task[] = tasksByStatus[TaskStatus.Failure];
    if (tasksWithErrors) {
      tasksWithErrors.forEach((task: Task) => {
        if (task.error) {
          this._terminal.writeStderrLine(`[${task.name}] ${task.error.message}`);
        }
      });
    }

    this._terminal.writeStdoutLine('');
  }

  private _printStatus(
    status: TaskStatus,
    tasksByStatus: { [status: number]: Task[] },
    color: (text: string) => string,
    headingColor: (text: string) => string = color
  ): void {
    const tasks: Task[] = tasksByStatus[status];

    if (tasks && tasks.length) {
      this._terminal.writeStdoutLine(headingColor(`${status} (${tasks.length})`));
      this._terminal.writeStdoutLine(color('================================'));
      for (let i: number = 0; i < tasks.length; i++) {
        const task: Task = tasks[i];

        switch (status) {
          case TaskStatus.Executing:
          case TaskStatus.Ready:
          case TaskStatus.Skipped:
            this._terminal.writeStdoutLine(color(task.name));
            break;

          case TaskStatus.Success:
          case TaskStatus.SuccessWithWarning:
          case TaskStatus.Blocked:
          case TaskStatus.Failure:
            if (task.stopwatch && !task.builder.hadEmptyScript) {
              const time: string = task.stopwatch.toString();
              this._terminal.writeStdoutLine(headingColor(`${task.name} (${time})`));
            } else {
              this._terminal.writeStdoutLine(headingColor(`${task.name}`));
            }
            break;
        }

        if (task.collatedWriter) {
          const shouldPrintDetails: boolean =
            task.status === TaskStatus.Failure || task.status === TaskStatus.SuccessWithWarning;

          const details: string = task.stdioSummarizer.getReport();
          if (details && shouldPrintDetails) {
            // Don't write a newline, because the report will always end with a newline
            this._terminal.writeChunk({ text: details, kind: TerminalChunkKind.Stdout });
          }
        }
      }

      this._terminal.writeStdoutLine(color('================================' + os.EOL));
    }
  }
}
