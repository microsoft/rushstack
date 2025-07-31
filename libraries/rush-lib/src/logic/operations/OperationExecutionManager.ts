// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  type TerminalWritable,
  StdioWritable,
  TextRewriterTransform,
  Colorize,
  ConsoleTerminalProvider,
  TerminalChunkKind
} from '@rushstack/terminal';
import { StreamCollator, type CollatedTerminal, type CollatedWriter } from '@rushstack/stream-collator';
import { NewlineKind, Async, InternalError, AlreadyReportedError } from '@rushstack/node-core-library';

import { AsyncOperationQueue, type IOperationSortFunction } from './AsyncOperationQueue';
import type { Operation } from './Operation';
import { OperationStatus, STATUS_BY_EMOJI, STATUS_EMOJIS } from './OperationStatus';
import { type IOperationExecutionRecordContext, OperationExecutionRecord } from './OperationExecutionRecord';
import type { IExecutionResult } from './IOperationExecutionResult';
import type { IEnvironment } from '../../utilities/Utilities';
import type { IInputsSnapshot } from '../incremental/InputsSnapshot';
import type { IStopwatchResult } from '../../utilities/Stopwatch';

export interface IOperationExecutionManagerOptions {
  quietMode: boolean;
  debugMode: boolean;
  parallelism: number;
  inputsSnapshot?: IInputsSnapshot;
  destination?: TerminalWritable;

  beforeExecuteOperationAsync?: (operation: OperationExecutionRecord) => Promise<OperationStatus | undefined>;
  afterExecuteOperationAsync?: (operation: OperationExecutionRecord) => Promise<void>;
  createEnvironmentForOperation?: (operation: OperationExecutionRecord) => IEnvironment;
  onOperationStatusChangedAsync?: (record: OperationExecutionRecord) => void;
  beforeExecuteOperationsAsync?: (records: Map<Operation, OperationExecutionRecord>) => Promise<void>;
}

/**
 * Format "======" lines for a shell window with classic 80 columns
 */
const ASCII_HEADER_WIDTH: number = 79;

const prioritySort: IOperationSortFunction = (
  a: OperationExecutionRecord,
  b: OperationExecutionRecord
): number => {
  return a.criticalPathLength! - b.criticalPathLength!;
};

/**
 * Sorts operations lexicographically by their name.
 * @param a - The first operation to compare
 * @param b - The second operation to compare
 * @returns A comparison result: -1 if a < b, 0 if a === b, 1 if a > b
 */
function sortOperationsByName(a: Operation, b: Operation): number {
  const aName: string = a.name;
  const bName: string = b.name;
  return aName === bName ? 0 : aName < bName ? -1 : 1;
}

/**
 * A class which manages the execution of a set of tasks with interdependencies.
 * Initially, and at the end of each task execution, all unblocked tasks
 * are added to a ready queue which is then executed. This is done continually until all
 * tasks are complete, or prematurely fails if any of the tasks fail.
 */
export class OperationExecutionManager {
  private readonly _executionRecords: Map<Operation, OperationExecutionRecord>;
  private readonly _quietMode: boolean;
  private readonly _parallelism: number;
  private readonly _totalOperations: number;

  private readonly _outputWritable: TerminalWritable;
  private readonly _colorsNewlinesTransform: TextRewriterTransform;
  private readonly _streamCollator: StreamCollator;

  private readonly _terminal: CollatedTerminal;

  private readonly _beforeExecuteOperation?: (
    operation: OperationExecutionRecord
  ) => Promise<OperationStatus | undefined>;
  private readonly _afterExecuteOperation?: (operation: OperationExecutionRecord) => Promise<void>;
  private readonly _onOperationStatusChanged?: (
    record: OperationExecutionRecord,
    oldStatus: OperationStatus
  ) => void;
  private readonly _beforeExecuteOperations?: (
    records: Map<Operation, OperationExecutionRecord>
  ) => Promise<void>;
  private readonly _createEnvironmentForOperation?: (operation: OperationExecutionRecord) => IEnvironment;

  // Variables for current status
  private readonly _operationCountByStatusEmoji: Record<string, number>;
  private _hasAnyFailures: boolean;
  private _hasAnyNonAllowedWarnings: boolean;
  private _executionQueue: AsyncOperationQueue;

  public constructor(operations: Set<Operation>, options: IOperationExecutionManagerOptions) {
    const {
      quietMode,
      debugMode,
      parallelism,
      inputsSnapshot,
      beforeExecuteOperationAsync: beforeExecuteOperation,
      afterExecuteOperationAsync: afterExecuteOperation,
      onOperationStatusChangedAsync: onOperationStatusChanged,
      beforeExecuteOperationsAsync: beforeExecuteOperations,
      createEnvironmentForOperation
    } = options;
    this._quietMode = quietMode;
    this._hasAnyFailures = false;
    this._hasAnyNonAllowedWarnings = false;
    this._parallelism = parallelism;

    this._beforeExecuteOperation = beforeExecuteOperation;
    this._afterExecuteOperation = afterExecuteOperation;
    this._beforeExecuteOperations = beforeExecuteOperations;
    this._createEnvironmentForOperation = createEnvironmentForOperation;

    const operationCountByStatusEmoji: Record<string, number> = {};
    for (const statusEmoji of Object.values(STATUS_EMOJIS)) {
      operationCountByStatusEmoji[statusEmoji] = 0;
    }
    this._operationCountByStatusEmoji = operationCountByStatusEmoji;

    this._onOperationStatusChanged = (record: OperationExecutionRecord, oldStatus: OperationStatus) => {
      if (record.status === OperationStatus.Ready) {
        this._executionQueue.assignOperations();
      }

      if (!record.silent) {
        operationCountByStatusEmoji[STATUS_EMOJIS[oldStatus]]--;
        operationCountByStatusEmoji[STATUS_EMOJIS[record.status]]++;
      }

      onOperationStatusChanged?.(record);
    };

    // TERMINAL PIPELINE:
    //
    // streamCollator --> colorsNewlinesTransform --> StdioWritable
    //
    this._outputWritable = options.destination || StdioWritable.instance;
    this._colorsNewlinesTransform = new TextRewriterTransform({
      destination: this._outputWritable,
      normalizeNewlines: NewlineKind.OsDefault,
      removeColors: !ConsoleTerminalProvider.supportsColor
    });
    this._streamCollator = new StreamCollator({
      destination: this._colorsNewlinesTransform,
      onWriterActive: this._streamCollator_onWriterActive
    });
    this._terminal = this._streamCollator.terminal;

    // Convert the developer graph to the mutable execution graph
    const executionRecordContext: IOperationExecutionRecordContext = {
      streamCollator: this._streamCollator,
      onOperationStatusChanged: this._onOperationStatusChanged,
      createEnvironment: this._createEnvironmentForOperation,
      inputsSnapshot,
      debugMode,
      quietMode
    };

    // Sort the operations by name to ensure consistency and readability.
    const sortedOperations: Operation[] = Array.from(operations).sort(sortOperationsByName);

    let totalOperations: number = 0;
    const executionRecords: Map<Operation, OperationExecutionRecord> = (this._executionRecords = new Map());
    for (const operation of sortedOperations) {
      const executionRecord: OperationExecutionRecord = new OperationExecutionRecord(
        operation,
        executionRecordContext
      );

      executionRecords.set(operation, executionRecord);
      if (!executionRecord.silent) {
        // Only count non-silent operations
        totalOperations++;
      }
    }
    this._totalOperations = totalOperations;

    for (const [operation, record] of executionRecords) {
      for (const dependency of operation.dependencies) {
        const dependencyRecord: OperationExecutionRecord | undefined = executionRecords.get(dependency);
        if (!dependencyRecord) {
          throw new Error(
            `Operation "${record.name}" declares a dependency on operation "${dependency.name}" that is not in the set of operations to execute.`
          );
        }
        record.dependencies.add(dependencyRecord);
        dependencyRecord.consumers.add(record);
      }
    }

    // Ensure we compute the compute the state hashes for all operations before the runtime graph potentially mutates.
    if (inputsSnapshot) {
      for (const record of executionRecords.values()) {
        record.getStateHash();
      }
    }

    const executionQueue: AsyncOperationQueue = new AsyncOperationQueue(
      this._executionRecords.values(),
      prioritySort
    );
    this._executionQueue = executionQueue;
    for (const operation of executionRecords.values()) {
      if (operation.silent) {
        continue;
      }
      // Initialize the status counts
      operationCountByStatusEmoji[STATUS_EMOJIS[operation.status]]++;
    }
  }

  private _getStatusBar(): string {
    const statusBarParts: string[] = [];
    for (const emoji of STATUS_BY_EMOJI.keys()) {
      const count: number = this._operationCountByStatusEmoji[emoji];
      if (count > 0) {
        statusBarParts.push(`${emoji} ${count}`);
      }
    }
    return statusBarParts.join(' ');
  }

  private _streamCollator_onWriterActive = (writer: CollatedWriter | undefined): void => {
    if (writer) {
      // Format a header like this
      //
      // ==[ @rushstack/the-long-thing ]=================[❌3 ✅20 📦245]==

      // leftPart: "==[ @rushstack/the-long-thing "
      const leftPart: string = Colorize.gray('==[') + ' ' + Colorize.cyan(writer.taskName) + ' ';
      const leftPartLength: number = 4 + writer.taskName.length + 1;

      const statusBar: string = this._getStatusBar();

      // rightPart: "❌3 ✅20 📦245]=="
      const rightPart: string = Colorize.white(statusBar) + Colorize.gray(']==');
      const rightPartLength: number = statusBar.length + 3;

      // middlePart: "]=================["
      const twoBracketsLength: number = 2;
      const middlePartLengthMinusTwoBrackets: number = Math.max(
        ASCII_HEADER_WIDTH - (leftPartLength + rightPartLength + twoBracketsLength),
        0
      );

      const middlePart: string = Colorize.gray(']' + '='.repeat(middlePartLengthMinusTwoBrackets) + '[');

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
  public async executeAsync(): Promise<IExecutionResult> {
    const totalOperations: number = this._totalOperations;

    if (!this._quietMode) {
      const plural: string = totalOperations === 1 ? '' : 's';
      this._terminal.writeStdoutLine(`Selected ${totalOperations} operation${plural}:`);
      const nonSilentOperations: string[] = [];
      for (const record of this._executionRecords.values()) {
        if (!record.silent) {
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

    this._terminal.writeStdoutLine(`Legend:`);
    for (const [emoji, statuses] of STATUS_BY_EMOJI) {
      this._terminal.writeStdoutLine(`${emoji} ${statuses.join(' / ')}`);
    }

    const maxParallelism: number = Math.min(totalOperations, this._parallelism);

    await this._beforeExecuteOperations?.(this._executionRecords);

    // This function is a callback because it may write to the collatedWriter before
    // operation.executeAsync returns (and cleans up the writer)
    const onOperationCompleteAsync: (record: OperationExecutionRecord) => Promise<void> = async (
      record: OperationExecutionRecord
    ) => {
      // If the operation is not terminal, we should _only_ notify the queue to assign operations.
      if (!record.isTerminal) {
        this._executionQueue.assignOperations();
      } else {
        try {
          await this._afterExecuteOperation?.(record);
        } catch (e) {
          this._reportOperationErrorIfAny(record);
          record.error = e;
          record.status = OperationStatus.Failure;
        }
        this._onOperationComplete(record);
      }
    };

    const onOperationStartAsync: (
      record: OperationExecutionRecord
    ) => Promise<OperationStatus | undefined> = async (record: OperationExecutionRecord) => {
      return await this._beforeExecuteOperation?.(record);
    };

    await Async.forEachAsync(
      this._executionQueue,
      async (record: OperationExecutionRecord) => {
        await record.executeAsync({
          onStart: onOperationStartAsync,
          onResult: onOperationCompleteAsync
        });
      },
      {
        concurrency: maxParallelism,
        weighted: true
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

  private _reportOperationErrorIfAny(record: OperationExecutionRecord): void {
    // Failed operations get reported, even if silent.
    // Generally speaking, silent operations shouldn't be able to fail, so this is a safety measure.
    let message: string | undefined = undefined;
    if (record.error) {
      if (!(record.error instanceof AlreadyReportedError)) {
        message = record.error.message;
      }
    }

    if (message) {
      // This creates the writer, so don't do this until needed
      record.collatedWriter.terminal.writeStderrLine(message);
      // Ensure that the summary isn't blank if we have an error message
      // If the summary already contains max lines of stderr, this will get dropped, so we hope those lines
      // are more useful than the final exit code.
      record.stdioSummarizer.writeChunk({
        text: `${message}\n`,
        kind: TerminalChunkKind.Stdout
      });
    }
  }

  /**
   * Handles the result of the operation and propagates any relevant effects.
   */
  private _onOperationComplete(record: OperationExecutionRecord): void {
    const { runner, name, status, silent, _operationMetadataManager: operationMetadataManager } = record;
    const stopwatch: IStopwatchResult =
      operationMetadataManager?.tryRestoreStopwatch(record.stopwatch) || record.stopwatch;

    switch (status) {
      /**
       * This operation failed. Mark it as such and all reachable dependents as blocked.
       */
      case OperationStatus.Failure: {
        // Failed operations get reported, even if silent.
        // Generally speaking, silent operations shouldn't be able to fail, so this is a safety measure.
        this._reportOperationErrorIfAny(record);

        // This creates the writer, so don't do this globally
        const { terminal } = record.collatedWriter;
        terminal.writeStderrLine(
          `${STATUS_EMOJIS[OperationStatus.Failure]} ${Colorize.red(`"${name}" failed to build.`)}`
        );
        const blockedQueue: Set<OperationExecutionRecord> = new Set(record.consumers);

        for (const blockedRecord of blockedQueue) {
          if (blockedRecord.status === OperationStatus.Waiting) {
            // Now that we have the concept of architectural no-ops, we could implement this by replacing
            // {blockedRecord.runner} with a no-op that sets status to Blocked and logs the blocking
            // operations. However, the existing behavior is a bit simpler, so keeping that for now.
            if (!blockedRecord.silent) {
              terminal.writeStdoutLine(
                `${STATUS_EMOJIS[OperationStatus.Blocked]} "${blockedRecord.name}" is blocked by "${name}".`
              );
            }
            blockedRecord.status = OperationStatus.Blocked;

            this._executionQueue.complete(blockedRecord);

            for (const dependent of blockedRecord.consumers) {
              blockedQueue.add(dependent);
            }
          } else if (blockedRecord.status !== OperationStatus.Blocked) {
            // It shouldn't be possible for operations to be in any state other than Waiting or Blocked
            throw new InternalError(
              `Blocked operation ${blockedRecord.name} is in an unexpected state: ${blockedRecord.status}`
            );
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
            `${STATUS_EMOJIS[OperationStatus.FromCache]} ${Colorize.green(`"${name}" was restored from the build cache.`)}`
          );
        }
        break;
      }

      /**
       * This operation was skipped via legacy change detection.
       */
      case OperationStatus.Skipped: {
        if (!silent) {
          record.collatedWriter.terminal.writeStdoutLine(
            `${STATUS_EMOJIS[OperationStatus.Skipped]} ${Colorize.green(`"${name}" was skipped.`)}`
          );
        }
        break;
      }

      /**
       * This operation intentionally didn't do anything.
       */
      case OperationStatus.NoOp: {
        if (!silent) {
          record.collatedWriter.terminal.writeStdoutLine(
            `${STATUS_EMOJIS[OperationStatus.NoOp]} ${Colorize.gray(`"${name}" did not define any work.`)}`
          );
        }
        break;
      }

      case OperationStatus.Success: {
        if (!silent) {
          record.collatedWriter.terminal.writeStdoutLine(
            `${STATUS_EMOJIS[OperationStatus.Success]} ${Colorize.green(`"${name}" completed successfully in ${stopwatch.toString()}.`)}`
          );
        }
        break;
      }

      case OperationStatus.SuccessWithWarning: {
        if (!silent) {
          record.collatedWriter.terminal.writeStderrLine(
            `${STATUS_EMOJIS[OperationStatus.SuccessWithWarning]} ${Colorize.yellow(`"${name}" completed with warnings in ${stopwatch.toString()}.`)}`
          );
        }
        this._hasAnyNonAllowedWarnings = this._hasAnyNonAllowedWarnings || !runner.warningsAreAllowed;
        break;
      }

      default: {
        throw new InternalError(`Unexpected operation status: ${status}`);
      }
    }

    this._executionQueue.complete(record);
  }
}
