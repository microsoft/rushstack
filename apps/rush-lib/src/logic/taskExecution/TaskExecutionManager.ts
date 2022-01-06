// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as path from 'path';
import colors from 'colors/safe';
import {
  StdioSummarizer,
  TerminalWritable,
  StdioWritable,
  TerminalChunkKind,
  TextRewriterTransform
} from '@rushstack/terminal';
import { StreamCollator, CollatedTerminal, CollatedWriter } from '@rushstack/stream-collator';
import { AlreadyReportedError, NewlineKind, InternalError, Sort, FileSystem } from '@rushstack/node-core-library';

import { Stopwatch } from '../../utilities/Stopwatch';
import { Task } from './Task';
import { TaskStatus } from './TaskStatus';
import { ITaskRunnerContext } from './BaseTaskRunner';
import { CommandLineConfiguration } from '../../api/CommandLineConfiguration';
import { TaskError } from './TaskError';

export interface ITaskExecutionManagerOptions {
  quietMode: boolean;
  debugMode: boolean;
  parallelism: string | undefined;
  changedProjectsOnly: boolean;
  repoCommandLineConfiguration: CommandLineConfiguration;
  destination?: TerminalWritable;
}

/**
 * Format "======" lines for a shell window with classic 80 columns
 */
const ASCII_HEADER_WIDTH: number = 79;

/**
 * Blah
 */
const TIMELINE_WIDTH: number = 120;

/**
 * Blah
 */
const TIMELINE_GRAPH_CHARS: Record<TaskStatus, string> = {
  [TaskStatus.Ready]: '?',
  [TaskStatus.Executing]: '?',
  [TaskStatus.Success]: '#',
  [TaskStatus.SuccessWithWarning]: '!',
  [TaskStatus.Failure]: '!',
  [TaskStatus.Blocked]: '.',
  [TaskStatus.Skipped]: '%',
  [TaskStatus.FromCache]: '%'
};

/**
 * A class which manages the execution of a set of tasks with interdependencies.
 * Initially, and at the end of each task execution, all unblocked tasks
 * are added to a ready queue which is then executed. This is done continually until all
 * tasks are complete, or prematurely fails if any of the tasks fail.
 */
export class TaskExecutionManager {
  private readonly _tasks: Task[];
  private readonly _changedProjectsOnly: boolean;
  private readonly _taskQueue: Task[];
  private readonly _quietMode: boolean;
  private readonly _debugMode: boolean;
  private readonly _parallelism: number;
  private readonly _repoCommandLineConfiguration: CommandLineConfiguration;
  private _hasAnyFailures: boolean;
  private _hasAnyNonAllowedWarnings: boolean;
  private _currentActiveTasks!: number;
  private _totalTasks!: number;
  private _completedTasks!: number;

  private readonly _outputWritable: TerminalWritable;
  private readonly _colorsNewlinesTransform: TextRewriterTransform;
  private readonly _streamCollator: StreamCollator;

  private _terminal: CollatedTerminal;

  public constructor(orderedTasks: Task[], options: ITaskExecutionManagerOptions) {
    const { quietMode, debugMode, parallelism, changedProjectsOnly, repoCommandLineConfiguration } = options;
    this._tasks = orderedTasks;
    this._taskQueue = [...orderedTasks]; // Clone the task array
    this._quietMode = quietMode;
    this._debugMode = debugMode;
    this._hasAnyFailures = false;
    this._hasAnyNonAllowedWarnings = false;
    this._changedProjectsOnly = changedProjectsOnly;
    this._repoCommandLineConfiguration = repoCommandLineConfiguration;

    // TERMINAL PIPELINE:
    //
    // streamCollator --> colorsNewlinesTransform --> StdioWritable
    //
    this._outputWritable = options.destination ? options.destination : StdioWritable.instance;
    this._colorsNewlinesTransform = new TextRewriterTransform({
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

      // Format a header like this
      //
      // ==[ @rushstack/the-long-thing ]=================[ 1 of 1000 ]==

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
        ASCII_HEADER_WIDTH - (leftPartLength + rightPartLength + twoBracketsLength),
        0
      );

      const middlePart: string = colors.gray(']' + '='.repeat(middlePartLengthMinusTwoBrackets) + '[');

      this._terminal.writeStdoutLine('\n' + leftPart + middlePart + rightPart);

      if (!this._quietMode) {
        this._terminal.writeStdoutLine('');
      }
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

    await this._generateTaskTimeline();

    if (this._hasAnyFailures) {
      this._terminal.writeStderrLine(colors.red('Projects failed to build.') + '\n');
      throw new AlreadyReportedError();
    } else if (this._hasAnyNonAllowedWarnings) {
      this._terminal.writeStderrLine(colors.yellow('Projects succeeded with warnings.') + '\n');
      throw new AlreadyReportedError();
    }
  }

  /**
   * Pulls the next task with no dependencies off the task queue
   * Removes any non-ready tasks from the task queue (this should only be blocked tasks)
   */
  private _getNextTask(): Task | undefined {
    for (let i: number = 0; i < this._taskQueue.length; i++) {
      const task: Task = this._taskQueue[i];

      if (task.status !== TaskStatus.Ready) {
        // It shouldn't be on the queue, remove it
        this._taskQueue.splice(i, 1);
        // Decrement since we modified the array
        i--;
      } else if (task.dependencies.size === 0 && task.status === TaskStatus.Ready) {
        // this is a task which is ready to go. remove it and return it
        return this._taskQueue.splice(i, 1)[0];
      }
      // Otherwise task is still waiting
    }
    return undefined; // There are no tasks ready to go at this time
  }

  /**
   * Helper function which finds any tasks which are available to run and begins executing them.
   * It calls the complete callback when all tasks are completed, or rejects if any task fails.
   */
  private async _startAvailableTasksAsync(): Promise<void> {
    const taskPromises: Promise<void>[] = [];
    let currentTask: Task | undefined;
    while (this._currentActiveTasks < this._parallelism && (currentTask = this._getNextTask())) {
      this._currentActiveTasks++;
      const task: Task = currentTask;
      task.status = TaskStatus.Executing;

      task.stopwatch = Stopwatch.start();
      task.collatedWriter = this._streamCollator.registerTask(task.name);
      task.stdioSummarizer = new StdioSummarizer();

      taskPromises.push(this._executeTaskAndChainAsync(task));
    }

    await Promise.all(taskPromises);
  }

  private async _executeTaskAndChainAsync(task: Task): Promise<void> {
    const context: ITaskRunnerContext = {
      repoCommandLineConfiguration: this._repoCommandLineConfiguration,
      stdioSummarizer: task.stdioSummarizer,
      collatedWriter: task.collatedWriter,
      quietMode: this._quietMode,
      debugMode: this._debugMode
    };

    try {
      const result: TaskStatus = await task.runner.executeAsync(context);

      task.stopwatch.stop();
      task.stdioSummarizer.close();

      this._currentActiveTasks--;
      switch (result) {
        case TaskStatus.Success:
          this._markTaskAsSuccess(task);
          break;
        case TaskStatus.SuccessWithWarning:
          this._hasAnyNonAllowedWarnings = this._hasAnyNonAllowedWarnings || !task.runner.warningsAreAllowed;
          this._markTaskAsSuccessWithWarning(task);
          break;
        case TaskStatus.FromCache:
          this._markTaskAsFromCache(task);
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
      task.error = error as TaskError;

      this._markTaskAsFailed(task);
    }

    task.collatedWriter.close();

    await this._startAvailableTasksAsync();
  }

  /**
   * Marks a task as having failed and marks each of its dependents as blocked
   */
  private _markTaskAsFailed(task: Task): void {
    if (task.error) {
      task.collatedWriter.terminal.writeStderrLine(task.error.message);
    }
    task.collatedWriter.terminal.writeStderrLine(colors.red(`"${task.name}" failed to build.`));
    task.status = TaskStatus.Failure;
    task.dependents.forEach((dependent: Task) => {
      this._markTaskAsBlocked(dependent, task);
    });
  }

  /**
   * Marks a task and all its dependents as blocked
   */
  private _markTaskAsBlocked(blockedTask: Task, failedTask: Task): void {
    if (blockedTask.status === TaskStatus.Ready) {
      this._completedTasks++;

      // Note: We cannot write to task.collatedWriter because "blockedTask" will be skipped
      failedTask.collatedWriter.terminal.writeStdoutLine(
        `"${blockedTask.name}" is blocked by "${failedTask.name}".`
      );
      blockedTask.status = TaskStatus.Blocked;
      blockedTask.dependents.forEach((dependent: Task) => {
        this._markTaskAsBlocked(dependent, failedTask);
      });
    }
  }

  /**
   * Marks a task as being completed, and removes it from the dependencies list of all its dependents
   */
  private _markTaskAsSuccess(task: Task): void {
    if (task.runner.hadEmptyScript) {
      task.collatedWriter.terminal.writeStdoutLine(colors.green(`"${task.name}" had an empty script.`));
    } else {
      task.collatedWriter.terminal.writeStdoutLine(
        colors.green(`"${task.name}" completed successfully in ${task.stopwatch.toString()}.`)
      );
    }
    task.status = TaskStatus.Success;

    task.dependents.forEach((dependent: Task) => {
      if (!this._changedProjectsOnly) {
        dependent.runner.isSkipAllowed = false;
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
        dependent.runner.isSkipAllowed = false;
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
   * Marks a task as provided by cache.
   */
  private _markTaskAsFromCache(task: Task): void {
    task.collatedWriter.terminal.writeStdoutLine(
      colors.green(`${task.name} was restored from the build cache.`)
    );
    task.status = TaskStatus.FromCache;
    task.dependents.forEach((dependent: Task) => {
      dependent.dependencies.delete(task);
    });
  }

  /**
   * Prints out a report of the status of each project
   */
  private _printTaskStatus(): void {
    const tasksByStatus: { [status: string]: Task[] } = {};
    for (const task of this._tasks) {
      switch (task.status) {
        // These are the sections that we will report below
        case TaskStatus.Skipped:
        case TaskStatus.FromCache:
        case TaskStatus.Success:
        case TaskStatus.SuccessWithWarning:
        case TaskStatus.Blocked:
        case TaskStatus.Failure:
          break;
        default:
          // This should never happen
          throw new InternalError('Unexpected task status: ' + task.status);
      }

      if (tasksByStatus[task.status]) {
        tasksByStatus[task.status].push(task);
      } else {
        tasksByStatus[task.status] = [task];
      }
    }

    // Skip a few lines before we start the summary
    this._terminal.writeStdoutLine('');
    this._terminal.writeStdoutLine('');
    this._terminal.writeStdoutLine('');

    // These are ordered so that the most interesting statuses appear last:
    this._writeCondensedSummary(
      TaskStatus.Skipped,
      tasksByStatus,
      colors.green,
      'These projects were already up to date:'
    );

    this._writeCondensedSummary(
      TaskStatus.FromCache,
      tasksByStatus,
      colors.green,
      'These projects were restored from the build cache:'
    );

    this._writeCondensedSummary(
      TaskStatus.Success,
      tasksByStatus,
      colors.green,
      'These projects completed successfully:'
    );

    this._writeDetailedSummary(TaskStatus.SuccessWithWarning, tasksByStatus, colors.yellow, 'WARNING');

    this._writeCondensedSummary(
      TaskStatus.Blocked,
      tasksByStatus,
      colors.white,
      'These projects were blocked by dependencies that failed:'
    );

    this._writeDetailedSummary(TaskStatus.Failure, tasksByStatus, colors.red);

    this._terminal.writeStdoutLine('');
  }

  private _writeCondensedSummary(
    status: TaskStatus,
    tasksByStatus: { [status: string]: Task[] },
    headingColor: (text: string) => string,
    preamble: string
  ): void {
    // Example:
    //
    // ==[ BLOCKED: 4 projects ]==============================================================
    //
    // These projects were blocked by dependencies that failed:
    //   @scope/name
    //   e
    //   k

    const tasks: Task[] | undefined = tasksByStatus[status];
    if (!tasks || tasks.length === 0) {
      return;
    }
    Sort.sortBy(tasks, (x) => x.name);

    this._writeSummaryHeader(status, tasks, headingColor);
    this._terminal.writeStdoutLine(preamble);

    const longestTaskName: number = Math.max(...tasks.map((x) => x.name.length));

    for (const task of tasks) {
      if (task.stopwatch && !task.runner.hadEmptyScript && task.status !== TaskStatus.Skipped) {
        const time: string = task.stopwatch.toString();
        const padding: string = ' '.repeat(longestTaskName - task.name.length);
        this._terminal.writeStdoutLine(`  ${task.name}${padding}    ${time}`);
      } else {
        this._terminal.writeStdoutLine(`  ${task.name}`);
      }
    }
    this._terminal.writeStdoutLine('');
  }

  private _writeDetailedSummary(
    status: TaskStatus,
    tasksByStatus: { [status: string]: Task[] },
    headingColor: (text: string) => string,
    shortStatusName?: string
  ): void {
    // Example:
    //
    // ==[ SUCCESS WITH WARNINGS: 2 projects ]================================
    //
    // --[ WARNINGS: f ]------------------------------------[ 5.07 seconds ]--
    //
    // [eslint] Warning: src/logic/taskExecution/TaskExecutionManager.ts:393:3 ...

    const tasks: Task[] | undefined = tasksByStatus[status];
    if (!tasks || tasks.length === 0) {
      return;
    }

    this._writeSummaryHeader(status, tasks, headingColor);

    if (shortStatusName === undefined) {
      shortStatusName = status;
    }

    for (const task of tasks) {
      // Format a header like this
      //
      // --[ WARNINGS: f ]------------------------------------[ 5.07 seconds ]--

      // leftPart: "--[ WARNINGS: f "
      const subheadingText: string = `${shortStatusName}: ${task.name}`;

      const leftPart: string = colors.gray('--[') + ' ' + headingColor(subheadingText) + ' ';
      const leftPartLength: number = 4 + subheadingText.length + 1;

      // rightPart: " 5.07 seconds ]--"
      const time: string = task.stopwatch.toString();
      const rightPart: string = ' ' + colors.white(time) + ' ' + colors.gray(']--');
      const rightPartLength: number = 1 + time.length + 1 + 3;

      // middlePart: "]----------------------["
      const twoBracketsLength: number = 2;
      const middlePartLengthMinusTwoBrackets: number = Math.max(
        ASCII_HEADER_WIDTH - (leftPartLength + rightPartLength + twoBracketsLength),
        0
      );

      const middlePart: string = colors.gray(']' + '-'.repeat(middlePartLengthMinusTwoBrackets) + '[');

      this._terminal.writeStdoutLine(leftPart + middlePart + rightPart + '\n');

      const details: string = task.stdioSummarizer.getReport();
      if (details) {
        // Don't write a newline, because the report will always end with a newline
        this._terminal.writeChunk({ text: details, kind: TerminalChunkKind.Stdout });
      }

      this._terminal.writeStdoutLine('');
    }
  }

  private _writeSummaryHeader(
    status: TaskStatus,
    tasks: Task[],
    headingColor: (text: string) => string
  ): void {
    // Format a header like this
    //
    // ==[ FAILED: 2 projects ]================================================

    // "2 projects"
    const projectsText: string = tasks.length.toString() + (tasks.length === 1 ? ' project' : ' projects');
    const headingText: string = `${status}: ${projectsText}`;

    // leftPart: "==[ FAILED: 2 projects "
    const leftPart: string = colors.gray('==[') + ' ' + headingColor(headingText) + ' ';
    const leftPartLength: number = 3 + 1 + headingText.length + 1;

    const rightPartLengthMinusBracket: number = Math.max(ASCII_HEADER_WIDTH - (leftPartLength + 1), 0);

    // rightPart: "]======================"
    const rightPart: string = colors.gray(']' + '='.repeat(rightPartLengthMinusBracket));

    this._terminal.writeStdoutLine(leftPart + rightPart);
    this._terminal.writeStdoutLine('');
  }

  private async _generateTaskTimeline(): Promise<void> {
    const lines: string[] = [];

    const tasks: Task[] = this._tasks.filter(task => task.stopwatch.startTime && task.stopwatch.endTime);
    tasks.sort((a, b) => a.stopwatch.startTime! - b.stopwatch.startTime!);

    const overallStart: number = tasks[0].stopwatch.startTime!;
    const overallEnd: number = Math.max(...tasks.map(task => task.stopwatch.endTime!));
    const overallLength: number = overallEnd - overallStart;

    const totalWork: number = tasks.map(task => task.stopwatch.duration).reduce((sum, value) => sum + value);

    const maxName: number = Math.max(...tasks.map(x => x.name.length));
    const maxDuration: number = String(Math.ceil(Math.max(...tasks.map(x => x.stopwatch.duration)))).length;
    const graphWidth: number = TIMELINE_WIDTH - maxName - maxDuration - 4;

    lines.push('='.repeat(TIMELINE_WIDTH));

    const cpuBusy: number[] = Array(this._parallelism).fill(-1);

    for (const task of tasks) {
      const startIdx: number = Math.floor((task.stopwatch.startTime! - overallStart) * graphWidth / overallLength);
      const endIdx: number = Math.floor((task.stopwatch.endTime! - overallStart) * graphWidth / overallLength);
      const length: number = endIdx - startIdx + 1;

      const graph: string = '-'.repeat(startIdx) + TIMELINE_GRAPH_CHARS[task.status].repeat(length) + '-'.repeat(graphWidth - endIdx);
      lines.push(
        task.name.padEnd(maxName) + ' ' + graph + ' ' + Math.floor(task.stopwatch.duration) + 's'
      );

      const openCpu: number = cpuBusy.findIndex(end => end === -1 || end < task.stopwatch.startTime!);
      cpuBusy[openCpu] = task.stopwatch.endTime!;
    }

    lines.push('='.repeat(TIMELINE_WIDTH));

    const usedCpus: number = cpuBusy.filter(cpu => cpu !== -1).length;

    const legend: string[] = [
      'LEGEND:',
      '  [#] Success  [!] Failed/warnings  [%] Skipped/cached'
    ];

    const summary: string[] = [
      'Total Work: ' + String(Math.floor(totalWork)).padStart(8) + 's',
      'Wall Clock: ' + String(Math.floor(overallLength / 1000.0)).padStart(8) + 's',
      'Parallelism Used: ' + `${usedCpus}/${this._parallelism}`.padStart(9)
    ];

    lines.push(legend[0] + summary[0].padStart(TIMELINE_WIDTH - legend[0].length));
    lines.push(legend[1] + summary[1].padStart(TIMELINE_WIDTH - legend[1].length));
    lines.push(summary[2].padStart(TIMELINE_WIDTH));

    await FileSystem.writeFileAsync('.timeline.log', lines.join('\n'));

    /*
    let cpuList: number[] = Array(this._parallelism).fill(-1);

    let tasks = this._tasks.filter(x => x.stopwatch.startTime && x.stopwatch.endTime);
    tasks.sort((a,b) => a.stopwatch.startTime! - b.stopwatch.startTime!);

    let overallStart = tasks[0].stopwatch.startTime!;
    let overallEnd = Math.max(...tasks.map(x => x.stopwatch.endTime!));
    let overallLength = overallEnd - overallStart;
      this._terminal.writeStdoutLine(line);
    }
    this._terminal.writeStdoutLine('='.repeat(maxWidth));

    let totalWork = (tasks.map(x => x.stopwatch.duration).reduce((s,v) => s+v));

    let onCpu: Record<number, number> = {};

    for (let i = 0; i < tasks.length; i++) {
      let open = cpuList.findIndex(x => x === -1 || x < tasks[i].stopwatch.startTime!);
      cpuList[open] = tasks[i].stopwatch.endTime!;
      onCpu[i] = open;
    }

    console.log(onCpu);

    this._terminal.writeStdoutLine(String(Object.entries(onCpu)));

    let maxWidth = 120;
    let maxName = Math.max(...tasks.map(x => x.name.length));
    let maxDuration = String(Math.ceil(Math.max(...tasks.map(x => x.stopwatch.duration)))).length;
    let graphWidth = maxWidth - maxName - maxDuration - 4;
    this._terminal.writeStdoutLine(''+maxWidth);
    this._terminal.writeStdoutLine(''+maxName);
    this._terminal.writeStdoutLine(''+maxDuration);
    this._terminal.writeStdoutLine(''+graphWidth);

    for (let thread = 0; thread < this._parallelism; thread++) {
      let hist = '-'.repeat(graphWidth);
    }

    this._terminal.writeStdoutLine('='.repeat(maxWidth));

    for (let task of tasks) {
      let hist = '-'.repeat(graphWidth);
      let start = Math.floor((task.stopwatch.startTime! - overallStart) * graphWidth / overallLength);
      let end = Math.floor((task.stopwatch.endTime! - overallStart) * graphWidth / overallLength);
      let length = (end - start + 1);

      let krab: Record<TaskStatus, string> = {
        [TaskStatus.Ready]: '?',
        [TaskStatus.Executing]: '?',
        [TaskStatus.Success]: '#',
        [TaskStatus.SuccessWithWarning]: '!',
        [TaskStatus.Failure]: '!',
        [TaskStatus.Blocked]: '.',
        [TaskStatus.Skipped]: '%',
        [TaskStatus.FromCache]: '%'
      };


      hist = hist.slice(0, start) + krab[task.status].repeat(length) + hist.slice(end);
      let line = task.name.padEnd(maxName) + ' ' + hist + ' ' + Math.ceil(task.stopwatch.duration) + 's';
      this._terminal.writeStdoutLine(line);
    }
    this._terminal.writeStdoutLine('='.repeat(maxWidth));

    let totalWork = (tasks.map(x => x.stopwatch.duration).reduce((s,v) => s+v));

    const legend: string[] = [
      'LEGEND:',
      '  [#] Success  [!] Failed/warnings  [%] Skipped/cached'
    ];
    const summary: string[] = [
      'Total Work: ' + String(Math.floor(totalWork)).padStart(8) + 's',
      'Wall Clock: ' + String(Math.floor(overallLength / 1000.0)).padStart(8) + 's'
    ];

    this._terminal.writeStdoutLine(legend[0] + summary[0].padStart(maxWidth - legend[0].length));
    this._terminal.writeStdoutLine(legend[1] + summary[1].padStart(maxWidth - legend[1].length));
    */
  }
}
