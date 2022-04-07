// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import colors from 'colors/safe';
import {
  TerminalWritable,
  StdioWritable,
  TerminalChunkKind,
  TextRewriterTransform
} from '@rushstack/terminal';
import { StreamCollator, CollatedTerminal, CollatedWriter } from '@rushstack/stream-collator';
import { AlreadyReportedError, NewlineKind, InternalError, Sort, Async } from '@rushstack/node-core-library';

import { AsyncOperationQueue, IOperationSortFunction } from './AsyncOperationQueue';
import { Operation } from './Operation';
import { OperationStatus } from './OperationStatus';
import { IOperationExecutionRecordContext, OperationExecutionRecord } from './OperationExecutionRecord';

export interface IOperationExecutionManagerOptions {
  quietMode: boolean;
  debugMode: boolean;
  parallelism: string | undefined;
  showTimeline: boolean;
  changedProjectsOnly: boolean;
  destination?: TerminalWritable;
}

/**
 * Format "======" lines for a shell window with classic 80 columns
 */
const ASCII_HEADER_WIDTH: number = 79;

/**
 * Timeline - a wider column width for printing the timeline summary
 */
const TIMELINE_WIDTH: number = 109;

/**
 * Timeline - symbols representing each operation status
 */
const TIMELINE_CHART_SYMBOLS: Record<OperationStatus, string> = {
  [OperationStatus.Ready]: '?',
  [OperationStatus.Executing]: '?',
  [OperationStatus.Success]: '#',
  [OperationStatus.SuccessWithWarning]: '!',
  [OperationStatus.Failure]: '!',
  [OperationStatus.Blocked]: '.',
  [OperationStatus.Skipped]: '%',
  [OperationStatus.FromCache]: '%'
};

/**
 * Timeline - colorizer for each operation status
 */
const TIMELINE_CHART_COLORIZER: Record<OperationStatus, (string: string) => string> = {
  [OperationStatus.Ready]: colors.yellow,
  [OperationStatus.Executing]: colors.yellow,
  [OperationStatus.Success]: colors.green,
  [OperationStatus.SuccessWithWarning]: colors.yellow,
  [OperationStatus.Failure]: colors.red,
  [OperationStatus.Blocked]: colors.red,
  [OperationStatus.Skipped]: colors.green,
  [OperationStatus.FromCache]: colors.green
};

/**
 * A class which manages the execution of a set of tasks with interdependencies.
 * Initially, and at the end of each task execution, all unblocked tasks
 * are added to a ready queue which is then executed. This is done continually until all
 * tasks are complete, or prematurely fails if any of the tasks fail.
 */
export class OperationExecutionManager {
  private readonly _changedProjectsOnly: boolean;
  private readonly _executionRecords: Set<OperationExecutionRecord>;
  private readonly _quietMode: boolean;
  private readonly _parallelism: number;
  private readonly _showTimeline: boolean;
  private readonly _totalOperations: number;

  private readonly _outputWritable: TerminalWritable;
  private readonly _colorsNewlinesTransform: TextRewriterTransform;
  private readonly _streamCollator: StreamCollator;

  private readonly _terminal: CollatedTerminal;

  // Variables for current status
  private _hasAnyFailures: boolean;
  private _hasAnyNonAllowedWarnings: boolean;
  private _completedOperations: number;

  public constructor(operations: Set<Operation>, options: IOperationExecutionManagerOptions) {
    const { quietMode, debugMode, parallelism, showTimeline, changedProjectsOnly } = options;
    this._completedOperations = 0;
    this._quietMode = quietMode;
    this._showTimeline = showTimeline;
    this._hasAnyFailures = false;
    this._hasAnyNonAllowedWarnings = false;
    this._changedProjectsOnly = changedProjectsOnly;

    // TERMINAL PIPELINE:
    //
    // streamCollator --> colorsNewlinesTransform --> StdioWritable
    //
    this._outputWritable = options.destination || StdioWritable.instance;
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

    // Convert the developer graph to the mutable execution graph
    const executionRecordContext: IOperationExecutionRecordContext = {
      streamCollator: this._streamCollator,
      debugMode,
      quietMode
    };

    let totalOperations: number = 0;
    const executionRecords: Map<Operation, OperationExecutionRecord> = new Map();
    for (const operation of operations) {
      const executionRecord: OperationExecutionRecord = new OperationExecutionRecord(
        operation,
        executionRecordContext
      );

      executionRecords.set(operation, executionRecord);
      if (!executionRecord.runner.silent) {
        // Only count non-silent operations
        totalOperations++;
      }
    }
    this._totalOperations = totalOperations;

    for (const [operation, consumer] of executionRecords) {
      for (const dependency of operation.dependencies) {
        const dependencyRecord: OperationExecutionRecord | undefined = executionRecords.get(dependency);
        if (!dependencyRecord) {
          throw new Error(
            `Operation "${consumer.name}" declares a dependency on operation "${dependency.name}" that is not in the set of operations to execute.`
          );
        }
        consumer.dependencies.add(dependencyRecord);
        dependencyRecord.consumers.add(consumer);
      }
    }
    this._executionRecords = new Set(executionRecords.values());

    const numberOfCores: number = os.cpus().length;

    if (parallelism) {
      if (parallelism === 'max') {
        this._parallelism = numberOfCores;
      } else {
        const parallelismAsNumber: number = Number(parallelism);

        if (typeof parallelism === 'string' && parallelism.trim().endsWith('%')) {
          const parsedPercentage: number = Number(parallelism.trim().replace(/\%$/, ''));

          if (parsedPercentage <= 0 || parsedPercentage > 100) {
            throw new Error(
              `Invalid percentage value of '${parallelism}', value cannot be less than '0%' or more than '100%'`
            );
          }

          const workers: number = Math.floor((parallelismAsNumber / 100) * numberOfCores);
          this._parallelism = Math.max(workers, 1);
        } else if (!isNaN(parallelismAsNumber)) {
          this._parallelism = Math.max(parallelismAsNumber, 1);
        }

        throw new Error(
          `Invalid parallelism value of '${parallelism}', expected a number, a percentage, or 'max'`
        );
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
      this._completedOperations++;

      // Format a header like this
      //
      // ==[ @rushstack/the-long-thing ]=================[ 1 of 1000 ]==

      // leftPart: "==[ @rushstack/the-long-thing "
      const leftPart: string = colors.gray('==[') + ' ' + colors.cyan(writer.taskName) + ' ';
      const leftPartLength: number = 4 + writer.taskName.length + 1;

      // rightPart: " 1 of 1000 ]=="
      const completedOfTotal: string = `${this._completedOperations} of ${this._totalOperations}`;
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
   * Executes all operations which have been registered, returning a promise which is resolved when all the
   * operations are completed successfully, or rejects when any operation fails.
   */
  public async executeAsync(): Promise<void> {
    this._completedOperations = 0;
    const totalOperations: number = this._totalOperations;

    if (!this._quietMode) {
      const plural: string = totalOperations === 1 ? '' : 's';
      this._terminal.writeStdoutLine(`Selected ${totalOperations} operation${plural}:`);
      const nonSilentOperations: string[] = [];
      for (const record of this._executionRecords) {
        if (!record.runner.silent) {
          nonSilentOperations.push(record.name);
        }
      }
      nonSilentOperations.sort();
      for (const name of nonSilentOperations) {
        this._terminal.writeStdoutLine(`  ${name}`);
      }
      this._terminal.writeStdoutLine('');
    }

    this._terminal.writeStdoutLine(`Executing a maximum of ${this._parallelism} simultaneous processes...`);

    const maxParallelism: number = Math.min(totalOperations, this._parallelism);
    const prioritySort: IOperationSortFunction = (
      a: OperationExecutionRecord,
      b: OperationExecutionRecord
    ): number => {
      return a.criticalPathLength! - b.criticalPathLength!;
    };
    const executionQueue: AsyncOperationQueue = new AsyncOperationQueue(this._executionRecords, prioritySort);

    // This function is a callback because it may write to the collatedWriter before
    // operation.executeAsync returns (and cleans up the writer)
    const onOperationComplete: (record: OperationExecutionRecord) => void = (
      record: OperationExecutionRecord
    ) => {
      this._onOperationComplete(record);
    };

    await Async.forEachAsync(
      executionQueue,
      async (operation: OperationExecutionRecord) => {
        await operation.executeAsync(onOperationComplete);
      },
      {
        concurrency: maxParallelism
      }
    );

    this._printOperationStatus();

    if (this._showTimeline) {
      this._printTimeline();
    }

    if (this._hasAnyFailures) {
      this._terminal.writeStderrLine(colors.red('Operations failed.') + '\n');
      throw new AlreadyReportedError();
    } else if (this._hasAnyNonAllowedWarnings) {
      this._terminal.writeStderrLine(colors.yellow('Operations succeeded with warnings.') + '\n');
      throw new AlreadyReportedError();
    }
  }

  /**
   * Handles the result of the operation and propagates any relevant effects.
   */
  private _onOperationComplete(record: OperationExecutionRecord): void {
    const { runner, name, status } = record;

    let blockCacheWrite: boolean = !runner.isCacheWriteAllowed;
    let blockSkip: boolean = !runner.isSkipAllowed;

    const silent: boolean = runner.silent;

    switch (status) {
      /**
       * This operation failed. Mark it as such and all reachable dependents as blocked.
       */
      case OperationStatus.Failure:
        // Failed operations get reported, even if silent.
        // Generally speaking, silent operations shouldn't be able to fail, so this is a safety measure.
        const message: string | undefined = record.error?.message;
        // This creates the writer, so don't do this globally
        const { terminal } = record.collatedWriter;
        if (message) {
          terminal.writeStderrLine(message);
        }
        terminal.writeStderrLine(colors.red(`"${name}" failed to build.`));
        const blockedQueue: Set<OperationExecutionRecord> = new Set(record.consumers);
        for (const blockedRecord of blockedQueue) {
          if (blockedRecord.status === OperationStatus.Ready) {
            this._completedOperations++;

            // Now that we have the concept of architectural no-ops, we could implement this by replacing
            // {blockedRecord.runner} with a no-op that sets status to Blocked and logs the blocking
            // operations. However, the existing behavior is a bit simpler, so keeping that for now.
            if (!blockedRecord.runner.silent) {
              terminal.writeStdoutLine(`"${blockedRecord.name}" is blocked by "${name}".`);
            }
            blockedRecord.status = OperationStatus.Blocked;

            for (const dependent of blockedRecord.consumers) {
              blockedQueue.add(dependent);
            }
          }
        }
        this._hasAnyFailures = true;
        break;
      /**
       * This operation was restored from the build cache.
       */
      case OperationStatus.FromCache:
        if (!silent) {
          record.collatedWriter.terminal.writeStdoutLine(
            colors.green(`"${name}" was restored from the build cache.`)
          );
        }
        break;
      /**
       * This operation was skipped via legacy change detection.
       */
      case OperationStatus.Skipped:
        if (!silent) {
          record.collatedWriter.terminal.writeStdoutLine(colors.green(`"${name}" was skipped.`));
        }
        // Skipping means cannot guarantee integrity, so prevent cache writes in dependents.
        blockCacheWrite = true;
        break;
      case OperationStatus.Success:
        if (!silent) {
          record.collatedWriter.terminal.writeStdoutLine(
            colors.green(`"${name}" completed successfully in ${record.stopwatch.toString()}.`)
          );
        }
        // Legacy incremental build, if asked, prevent skip in dependents if the operation executed.
        blockSkip ||= !this._changedProjectsOnly;
        break;
      case OperationStatus.SuccessWithWarning:
        if (!silent) {
          record.collatedWriter.terminal.writeStderrLine(
            colors.yellow(`"${name}" completed with warnings in ${record.stopwatch.toString()}.`)
          );
        }
        // Legacy incremental build, if asked, prevent skip in dependents if the operation executed.
        blockSkip ||= !this._changedProjectsOnly;
        this._hasAnyNonAllowedWarnings = this._hasAnyNonAllowedWarnings || !runner.warningsAreAllowed;
        break;
    }

    // Apply status changes to direct dependents
    for (const item of record.consumers) {
      if (blockCacheWrite) {
        item.runner.isCacheWriteAllowed = false;
      }

      if (blockSkip) {
        item.runner.isSkipAllowed = false;
      }

      // Remove this operation from the dependencies, to unblock the scheduler
      item.dependencies.delete(record);
    }
  }

  /**
   * Prints out a report of the status of each project
   */
  private _printOperationStatus(): void {
    const operationsByStatus: Map<OperationStatus, OperationExecutionRecord[]> = new Map();
    for (const operation of this._executionRecords) {
      const { status } = operation;
      switch (status) {
        // These are the sections that we will report below
        case OperationStatus.Skipped:
        case OperationStatus.FromCache:
        case OperationStatus.Success:
        case OperationStatus.SuccessWithWarning:
        case OperationStatus.Blocked:
        case OperationStatus.Failure:
          break;
        default:
          // This should never happen
          throw new InternalError(`Unexpected operation status: ${status}`);
      }

      if (operation.runner.silent) {
        // Don't report silenced operations
        continue;
      }

      const collection: OperationExecutionRecord[] | undefined = operationsByStatus.get(status);
      if (collection) {
        collection.push(operation);
      } else {
        operationsByStatus.set(status, [operation]);
      }
    }

    // Skip a few lines before we start the summary
    this._terminal.writeStdoutLine('');
    this._terminal.writeStdoutLine('');
    this._terminal.writeStdoutLine('');

    // These are ordered so that the most interesting statuses appear last:
    this._writeCondensedSummary(
      OperationStatus.Skipped,
      operationsByStatus,
      colors.green,
      'These operations were already up to date:'
    );

    this._writeCondensedSummary(
      OperationStatus.FromCache,
      operationsByStatus,
      colors.green,
      'These operations were restored from the build cache:'
    );

    this._writeCondensedSummary(
      OperationStatus.Success,
      operationsByStatus,
      colors.green,
      'These operations completed successfully:'
    );

    this._writeDetailedSummary(
      OperationStatus.SuccessWithWarning,
      operationsByStatus,
      colors.yellow,
      'WARNING'
    );

    this._writeCondensedSummary(
      OperationStatus.Blocked,
      operationsByStatus,
      colors.white,
      'These operations were blocked by dependencies that failed:'
    );

    this._writeDetailedSummary(OperationStatus.Failure, operationsByStatus, colors.red);

    this._terminal.writeStdoutLine('');
  }

  private _writeCondensedSummary(
    status: OperationStatus,
    recordsByStatus: Map<OperationStatus, OperationExecutionRecord[]>,
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

    const operations: OperationExecutionRecord[] | undefined = recordsByStatus.get(status);
    if (!operations || operations.length === 0) {
      return;
    }
    Sort.sortBy(operations, (x) => x.name);

    this._writeSummaryHeader(status, operations, headingColor);
    this._terminal.writeStdoutLine(preamble);

    const longestTaskName: number = Math.max(...operations.map((x) => x.name.length));

    for (const operation of operations) {
      if (
        operation.stopwatch.duration !== 0 &&
        operation.runner.reportTiming &&
        operation.status !== OperationStatus.Skipped
      ) {
        const time: string = operation.stopwatch.toString();
        const padding: string = ' '.repeat(longestTaskName - operation.name.length);
        this._terminal.writeStdoutLine(`  ${operation.name}${padding}    ${time}`);
      } else {
        this._terminal.writeStdoutLine(`  ${operation.name}`);
      }
    }
    this._terminal.writeStdoutLine('');
  }

  private _writeDetailedSummary(
    status: OperationStatus,
    recordsByStatus: Map<OperationStatus, OperationExecutionRecord[]>,
    headingColor: (text: string) => string,
    shortStatusName?: string
  ): void {
    // Example:
    //
    // ==[ SUCCESS WITH WARNINGS: 2 projects ]================================
    //
    // --[ WARNINGS: f ]------------------------------------[ 5.07 seconds ]--
    //
    // [eslint] Warning: src/logic/operations/OperationsExecutionManager.ts:393:3 ...

    const operations: OperationExecutionRecord[] | undefined = recordsByStatus.get(status);
    if (!operations || operations.length === 0) {
      return;
    }

    this._writeSummaryHeader(status, operations, headingColor);

    if (shortStatusName === undefined) {
      shortStatusName = status;
    }

    for (const operation of operations) {
      // Format a header like this
      //
      // --[ WARNINGS: f ]------------------------------------[ 5.07 seconds ]--

      // leftPart: "--[ WARNINGS: f "
      const subheadingText: string = `${shortStatusName}: ${operation.name}`;

      const leftPart: string = colors.gray('--[') + ' ' + headingColor(subheadingText) + ' ';
      const leftPartLength: number = 4 + subheadingText.length + 1;

      // rightPart: " 5.07 seconds ]--"
      const time: string = operation.stopwatch.toString();
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

      const details: string = operation.stdioSummarizer.getReport();
      if (details) {
        // Don't write a newline, because the report will always end with a newline
        this._terminal.writeChunk({ text: details, kind: TerminalChunkKind.Stdout });
      }

      this._terminal.writeStdoutLine('');
    }
  }

  private _writeSummaryHeader(
    status: OperationStatus,
    records: OperationExecutionRecord[],
    headingColor: (text: string) => string
  ): void {
    // Format a header like this
    //
    // ==[ FAILED: 2 operations ]================================================

    // "2 operations"
    const projectsText: string = `${records.length}${records.length === 1 ? ' operation' : ' operations'}`;
    const headingText: string = `${status}: ${projectsText}`;

    // leftPart: "==[ FAILED: 2 operations "
    const leftPart: string = `${colors.gray('==[')} ${headingColor(headingText)} `;
    const leftPartLength: number = 3 + 1 + headingText.length + 1;

    const rightPartLengthMinusBracket: number = Math.max(ASCII_HEADER_WIDTH - (leftPartLength + 1), 0);

    // rightPart: "]======================"
    const rightPart: string = colors.gray(`]${'='.repeat(rightPartLengthMinusBracket)}`);

    this._terminal.writeStdoutLine(leftPart + rightPart);
    this._terminal.writeStdoutLine('');
  }

  /**
   * Print a more detailed timeline and analysis of CPU usage for the build.
   */
  private _printTimeline(): void {
    //
    // Gather the operation records we'll be displaying. Do some inline max()
    // finding to reduce the number of times we need to loop through operations.
    //

    const operations: OperationExecutionRecord[] = [];
    let longestNameLength: number = 0;
    let longestDurationLength: number = 0;
    let allEnd: number = 0;

    for (const operation of this._executionRecords) {
      if (operation.stopwatch.startTime && operation.stopwatch.endTime) {
        operations.push(operation);

        const nameLength: number = operation.name.length;
        if (nameLength > longestNameLength) {
          longestNameLength = nameLength;
        }

        const durationLength: number = operation.stopwatch.duration.toFixed(1).length + 1;
        if (durationLength > longestDurationLength) {
          longestDurationLength = durationLength;
        }

        if (operation.stopwatch.endTime! > allEnd) {
          allEnd = operation.stopwatch.endTime!;
        }
      }
    }

    operations.sort((a, b) => a.stopwatch.startTime! - b.stopwatch.startTime!);

    //
    // Determine timing for all tasks (wall clock and execution times)
    //

    const allStart: number = operations[0].stopwatch.startTime!;
    const allDuration: number = allEnd - allStart;
    const workDuration: number = operations
      .map((operation) => operation.stopwatch.duration)
      .reduce((sum, value) => sum + value);

    //
    // Do some calculations to determine what size timeline chart we need.
    //

    const chartWidth: number = TIMELINE_WIDTH - longestNameLength - longestDurationLength - 3;
    //
    // Loop through all operations, assembling some statistics about operations and
    // phases, if applicable.
    //

    const durationByPhase: Map<string, number> = new Map();

    const busyCpus: number[] = Array(this._parallelism).fill(-1);

    this._terminal.writeStdoutLine('='.repeat(TIMELINE_WIDTH));

    for (const operation of operations) {
      // Track time by phase
      const phaseMatch: RegExpMatchArray | null = operation.name.match(/\((.+)\)$/);
      if (phaseMatch) {
        durationByPhase.set(
          phaseMatch[1],
          (durationByPhase.get(phaseMatch[1]) || 0) + operation.stopwatch.duration
        );
      }

      // Track busy CPUs
      const openCpu: number = busyCpus.findIndex((end) => end === -1 || end < operation.stopwatch.startTime!);
      busyCpus[openCpu] = operation.stopwatch.endTime!;

      // Build timeline chart

      const startIdx: number = Math.floor(
        ((operation.stopwatch.startTime! - allStart) * chartWidth) / allDuration
      );
      const endIdx: number = Math.floor(
        ((operation.stopwatch.endTime! - allStart) * chartWidth) / allDuration
      );
      const length: number = endIdx - startIdx + 1;

      const chart: string =
        colors.gray('-'.repeat(startIdx)) +
        TIMELINE_CHART_COLORIZER[operation.status](TIMELINE_CHART_SYMBOLS[operation.status].repeat(length)) +
        colors.gray('-'.repeat(chartWidth - endIdx));
      this._terminal.writeStdoutLine(
        colors.cyan(operation.name.padEnd(longestNameLength)) +
          ' ' +
          chart +
          ' ' +
          colors.white((operation.stopwatch.duration.toFixed(1) + 's').padStart(longestDurationLength))
      );
    }

    this._terminal.writeStdoutLine('='.repeat(TIMELINE_WIDTH));

    //
    // Format legend and summary areas
    //

    const usedCpus: number = busyCpus.filter((cpu) => cpu !== -1).length;

    const legend: string[] = ['LEGEND:', '  [#] Success  [!] Failed/warnings  [%] Skipped/cached'];

    const summary: string[] = [
      'Total Work: ' + workDuration.toFixed(1) + 's',
      'Wall Clock: ' + (allDuration / 1000).toFixed(1) + 's',
      `Parallelism Used: ${usedCpus}/${this._parallelism}`
    ];

    this._terminal.writeStdoutLine(legend[0] + summary[0].padStart(TIMELINE_WIDTH - legend[0].length));
    this._terminal.writeStdoutLine(legend[1] + summary[1].padStart(TIMELINE_WIDTH - legend[1].length));
    this._terminal.writeStdoutLine(summary[2].padStart(TIMELINE_WIDTH));

    //
    // Include time-by-phase, if phases are enabled
    //

    if (durationByPhase.size > 0) {
      this._terminal.writeStdoutLine('BY PHASE:');

      const maxPhaseName: number = Math.max(16, ...[...durationByPhase.keys()].map((name) => name.length));

      for (const [phase, duration] of durationByPhase.entries()) {
        this._terminal.writeStdoutLine(
          '  ' + colors.cyan(phase.padEnd(maxPhaseName)) + duration.toFixed(1).padStart(8) + 's'
        );
      }
    }

    this._terminal.writeStdoutLine('');
  }
}
