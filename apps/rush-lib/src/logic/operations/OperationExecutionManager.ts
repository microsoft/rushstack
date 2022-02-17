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
import { AlreadyReportedError, NewlineKind, InternalError, Sort } from '@rushstack/node-core-library';

import { AsyncOperationQueue, IOperationSortFunction } from './AsyncOperationQueue';
import { Operation } from './Operation';
import { OperationStatus } from './OperationStatus';
import { IOperationExecutionRecordContext, OperationExecutionRecord } from './OperationExecutionRecord';
import { OperationError } from './OperationError';

export interface IOperationExecutionManagerOptions {
  quietMode: boolean;
  debugMode: boolean;
  parallelism: string | undefined;
  changedProjectsOnly: boolean;
  destination?: TerminalWritable;
}

/**
 * Format "======" lines for a shell window with classic 80 columns
 */
const ASCII_HEADER_WIDTH: number = 79;

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
    const { quietMode, debugMode, parallelism, changedProjectsOnly } = options;
    this._completedOperations = 0;
    this._quietMode = quietMode;
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
      executionRecords.set(operation, new OperationExecutionRecord(operation, executionRecordContext));
      if (!operation.runner.silent) {
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
      this._terminal.writeStdoutLine(
        Array.from(this._executionRecords, (x) => `  ${x.name}`)
          .sort()
          .join('\n')
      );
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

    // Iterate in parallel with maxParallelism concurrent lanes
    await Promise.all(
      Array.from({ length: maxParallelism }, async (unused: undefined, index: number): Promise<void> => {
        // laneId can be used in logging to examine concurrency
        const laneId: number = index + 1;
        // The executionQueue is a singular async iterable that stalls until an operation is available, and marks itself
        // done when the queue is empty.
        for await (const operations of executionQueue) {
          // Take an operation, execute it, wait for it to finish, wait for a new operations
          await this._executeOperationAsync(operations, laneId);
        }
      })
    );

    this._printOperationStatus();

    if (this._hasAnyFailures) {
      this._terminal.writeStderrLine(colors.red('Operations failed.') + '\n');
      throw new AlreadyReportedError();
    } else if (this._hasAnyNonAllowedWarnings) {
      this._terminal.writeStderrLine(colors.yellow('Operations succeeded with warnings.') + '\n');
      throw new AlreadyReportedError();
    }
  }

  private async _executeOperationAsync(operation: OperationExecutionRecord, tid: number): Promise<void> {
    let result: OperationStatus = (operation.status = OperationStatus.Executing);
    operation.stopwatch.start();

    try {
      result = await operation.runner.executeAsync(operation);

      // Only perform global state updates. Internal state updates are handled by Operation itself.
      this._handleOperationResult(operation, result);
    } catch (error) {
      const status: OperationStatus = OperationStatus.Failure;
      operation.error = error as OperationError;
      this._handleOperationResult(operation, status);
    } finally {
      operation.collatedWriter.close();
      operation.stdioSummarizer.close();
      operation.stopwatch.stop();
    }
  }

  /**
   * Applies the new status to an OperationExecutionRecord and propagates any relevant effects.
   */
  private _handleOperationResult(record: OperationExecutionRecord, result: OperationStatus): void {
    record.status = result;

    const {
      collatedWriter: { terminal },
      runner,
      name
    } = record;

    let blockCacheWrite: boolean = !runner.isCacheWriteAllowed;
    let blockSkip: boolean = !runner.isSkipAllowed;

    const silent: boolean = runner.silent;

    switch (result) {
      /**
       * This operation failed. Mark it as such and all reachable dependents as blocked.
       */
      case OperationStatus.Failure:
        // Failed operations get reported, even if silent.
        // Generally speaking, silent operations shouldn't be able to fail, so this is a safety measure.
        const message: string | undefined = record.error?.message;
        if (message) {
          terminal.writeStderrLine(message);
        }
        terminal.writeStderrLine(colors.red(`"${name}" failed to build.`));
        const blockedQueue: Set<OperationExecutionRecord> = new Set(record.consumers);
        for (const blockedRecord of blockedQueue) {
          if (blockedRecord.status === OperationStatus.Ready) {
            this._completedOperations++;

            //
            terminal.writeStdoutLine(`"${blockedRecord.name}" is blocked by "${name}".`);
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
          terminal.writeStdoutLine(colors.green(`"${name}" was restored from the build cache.`));
        }
        break;
      /**
       * This operation was skipped via legacy change detection.
       */
      case OperationStatus.Skipped:
        if (!silent) {
          terminal.writeStdoutLine(colors.green(`"${name}" was skipped.`));
        }
        // Skipping means cannot guarantee integrity, so prevent cache writes in dependents.
        blockCacheWrite = true;
        break;
      case OperationStatus.Success:
        if (!silent) {
          terminal.writeStdoutLine(
            colors.green(`"${name}" completed successfully in ${record.stopwatch.toString()}.`)
          );
        }
        // Legacy incremental build, if asked, prevent skip in dependents if the operation executed.
        blockSkip ||= !this._changedProjectsOnly;
        break;
      case OperationStatus.SuccessWithWarning:
        if (!silent) {
          terminal.writeStderrLine(
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
          throw new InternalError(`Unexpected task status: ${status}`);
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
}
