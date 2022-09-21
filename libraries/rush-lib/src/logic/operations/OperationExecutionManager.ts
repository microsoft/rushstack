// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import colors from 'colors/safe';
import { TerminalWritable, StdioWritable, TextRewriterTransform } from '@rushstack/terminal';
import { StreamCollator, CollatedTerminal, CollatedWriter } from '@rushstack/stream-collator';
import { NewlineKind, Async } from '@rushstack/node-core-library';

import { AsyncOperationQueue, IOperationSortFunction } from './AsyncOperationQueue';
import { Operation } from './Operation';
import { OperationStatus } from './OperationStatus';
import { IOperationExecutionRecordContext, OperationExecutionRecord } from './OperationExecutionRecord';

export interface IOperationExecutionManagerOptions {
  quietMode: boolean;
  debugMode: boolean;
  parallelism: string | undefined;
  changedProjectsOnly: boolean;
  destination?: TerminalWritable;

  onOperationStatusChanged?: (record: OperationExecutionRecord) => void;
  beforeExecuteOperations?: (records: Map<Operation, OperationExecutionRecord>) => void;
  afterCreateRecords?: (records: Map<Operation, OperationExecutionRecord>) => void;
}

export interface IFullExecutionResult {
  status: OperationStatus;
  operationResults: Map<Operation, OperationExecutionRecord>;
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
  private readonly _executionRecords: Map<Operation, OperationExecutionRecord>;
  private readonly _quietMode: boolean;
  private readonly _parallelism: number;
  private readonly _totalOperations: number;

  private readonly _outputWritable: TerminalWritable;
  private readonly _colorsNewlinesTransform: TextRewriterTransform;
  private readonly _streamCollator: StreamCollator;

  private readonly _terminal: CollatedTerminal;

  private readonly _onOperationStatusChanged?: (record: OperationExecutionRecord) => void;
  private readonly _beforeExecuteOperations?: (records: Map<Operation, OperationExecutionRecord>) => void;

  // Variables for current status
  private _hasAnyFailures: boolean;
  private _hasAnyNonAllowedWarnings: boolean;
  private _completedOperations: number;

  public constructor(operations: Set<Operation>, options: IOperationExecutionManagerOptions) {
    const {
      quietMode,
      debugMode,
      parallelism,
      changedProjectsOnly,
      onOperationStatusChanged,
      beforeExecuteOperations,
      afterCreateRecords
    } = options;
    this._completedOperations = 0;
    this._quietMode = quietMode;
    this._hasAnyFailures = false;
    this._hasAnyNonAllowedWarnings = false;
    this._changedProjectsOnly = changedProjectsOnly;
    this._onOperationStatusChanged = onOperationStatusChanged;
    this._beforeExecuteOperations = beforeExecuteOperations;

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
      onOperationStatusChanged,
      debugMode,
      quietMode
    };

    let totalOperations: number = 0;
    const executionRecords: Map<Operation, OperationExecutionRecord> = (this._executionRecords = new Map());
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

    afterCreateRecords?.(executionRecords);

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

          const workers: number = Math.floor((parsedPercentage / 100) * numberOfCores);
          this._parallelism = Math.max(workers, 1);
        } else if (!isNaN(parallelismAsNumber)) {
          this._parallelism = Math.max(parallelismAsNumber, 1);
        } else {
          throw new Error(
            `Invalid parallelism value of '${parallelism}', expected a number, a percentage, or 'max'`
          );
        }
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
  public async executeAsync(): Promise<IFullExecutionResult> {
    this._completedOperations = 0;
    const totalOperations: number = this._totalOperations;

    if (!this._quietMode) {
      const plural: string = totalOperations === 1 ? '' : 's';
      this._terminal.writeStdoutLine(`Selected ${totalOperations} operation${plural}:`);
      const nonSilentOperations: string[] = [];
      for (const record of this._executionRecords.values()) {
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
    const executionQueue: AsyncOperationQueue = new AsyncOperationQueue(
      this._executionRecords.values(),
      prioritySort
    );

    this._beforeExecuteOperations?.(this._executionRecords);

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

    const status: OperationStatus = this._hasAnyFailures
      ? OperationStatus.Failure
      : this._hasAnyNonAllowedWarnings
      ? OperationStatus.SuccessWithWarning
      : OperationStatus.Success;

    return {
      operationResults: this._executionRecords,
      status
    };
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
      case OperationStatus.Failure: {
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
            if (!blockedRecord.silent) {
              terminal.writeStdoutLine(`"${blockedRecord.name}" is blocked by "${name}".`);
            }
            blockedRecord.status = OperationStatus.Blocked;
            this._onOperationStatusChanged?.(blockedRecord);

            for (const dependent of blockedRecord.consumers) {
              blockedQueue.add(dependent);
            }
          }
        }
        this._hasAnyFailures = true;
        break;
      }

      /**
       * This operation was restored from the build cache.
       */
      case OperationStatus.FromCache: {
        if (!silent) {
          record.collatedWriter.terminal.writeStdoutLine(
            colors.green(`"${name}" was restored from the build cache.`)
          );
        }
        break;
      }

      /**
       * This operation was skipped via legacy change detection.
       */
      case OperationStatus.Skipped: {
        if (!silent) {
          record.collatedWriter.terminal.writeStdoutLine(colors.green(`"${name}" was skipped.`));
        }
        // Skipping means cannot guarantee integrity, so prevent cache writes in dependents.
        blockCacheWrite = true;
        break;
      }

      /**
       * This operation intentionally didn't do anything.
       */
      case OperationStatus.NoOp: {
        if (!silent) {
          record.collatedWriter.terminal.writeStdoutLine(colors.gray(`"${name}" did not define any work.`));
        }
        break;
      }

      case OperationStatus.Success: {
        if (!silent) {
          record.collatedWriter.terminal.writeStdoutLine(
            colors.green(`"${name}" completed successfully in ${record.stopwatch.toString()}.`)
          );
        }
        // Legacy incremental build, if asked, prevent skip in dependents if the operation executed.
        blockSkip ||= !this._changedProjectsOnly;
        break;
      }

      case OperationStatus.SuccessWithWarning: {
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
    }

    // Apply status changes to direct dependents
    for (const item of record.consumers) {
      if (blockCacheWrite) {
        item.isCacheWriteAllowed = false;
      }

      if (blockSkip) {
        // Only relevant in legacy non-build cache flow
        item.runner.isSkipAllowed = false;
      }

      // Remove this operation from the dependencies, to unblock the scheduler
      item.dependencies.delete(record);
    }
  }
}
