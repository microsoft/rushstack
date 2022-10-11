// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import colors from 'colors/safe';
import { TerminalWritable, StdioWritable, TextRewriterTransform } from '@rushstack/terminal';
import { StreamCollator, CollatedWriter } from '@rushstack/stream-collator';
import {
  NewlineKind,
  Async,
  Terminal,
  ITerminal,
  AlreadyReportedError,
  Colors
} from '@rushstack/node-core-library';

import { AsyncOperationQueue, IOperationSortFunction } from './AsyncOperationQueue';
import { Operation } from './Operation';
import { OperationStatus } from './OperationStatus';
import { IOperationExecutionRecordContext, OperationExecutionRecord } from './OperationExecutionRecord';
import { IExecutionResult } from './IOperationExecutionResult';
import { ProjectChangeAnalyzer } from '../ProjectChangeAnalyzer';
import { CollatedTerminalProvider } from '../../utilities/CollatedTerminalProvider';
import { LookupByPath } from '../LookupByPath';
import { getOperationHashes } from './OperationHash';

export interface IOperationExecutionManagerOptions {
  quietMode: boolean;
  debugMode: boolean;
  parallelism: number;
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
  private readonly _executionRecords: Map<Operation, OperationExecutionRecord>;
  private readonly _quietMode: boolean;
  private readonly _parallelism: number;

  private readonly _outputWritable: TerminalWritable;
  private readonly _colorsNewlinesTransform: TextRewriterTransform;
  private readonly _streamCollator: StreamCollator;

  private readonly _terminal: ITerminal;

  // Variables for current status
  private _hasAnyFailures: boolean;
  private _hasAnyNonAllowedWarnings: boolean;
  private _completedOperations: number;
  private _totalOperations: number;

  public constructor(operations: Set<Operation>, options: IOperationExecutionManagerOptions) {
    const { quietMode, debugMode, parallelism, changedProjectsOnly } = options;
    this._completedOperations = 0;
    this._totalOperations = 0;
    this._quietMode = quietMode;
    this._hasAnyFailures = false;
    this._hasAnyNonAllowedWarnings = false;
    this._changedProjectsOnly = changedProjectsOnly;
    this._parallelism = parallelism;

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
    this._terminal = new Terminal(new CollatedTerminalProvider(this._streamCollator.terminal));

    // Convert the developer graph to the mutable execution graph
    const executionRecordContext: IOperationExecutionRecordContext = {
      streamCollator: this._streamCollator,
      debugMode,
      quietMode
    };

    const executionRecords: Map<Operation, OperationExecutionRecord> = (this._executionRecords = new Map());
    for (const operation of operations) {
      const executionRecord: OperationExecutionRecord = new OperationExecutionRecord(
        operation,
        executionRecordContext
      );

      executionRecords.set(operation, executionRecord);
    }

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

      this._terminal.writeLine('\n' + leftPart + middlePart + rightPart);

      if (!this._quietMode) {
        this._terminal.writeLine('');
      }
    }
  };

  /**
   * Executes all operations which have been registered, returning a promise which is resolved when all the
   * operations are completed successfully, or rejects when any operation fails.
   */
  public async executeAsync(projectChangeAnalyzer?: ProjectChangeAnalyzer): Promise<IExecutionResult> {
    this._completedOperations = 0;

    if (projectChangeAnalyzer) {
      await this._updateStateAsync(projectChangeAnalyzer);
    }

    const nonSilentOperations: string[] = [];
    for (const record of this._executionRecords.values()) {
      if (!record.silent) {
        nonSilentOperations.push(record.name);
      }
    }
    const totalOperations: number = (this._totalOperations = nonSilentOperations.length);
    if (!this._quietMode) {
      const plural: string = totalOperations === 1 ? '' : 's';
      this._terminal.writeLine(`Selected ${totalOperations} operation${plural}:`);
      nonSilentOperations.sort();
      for (const name of nonSilentOperations) {
        this._terminal.writeLine(`  ${name}`);
      }
      this._terminal.writeLine('');
    }

    this._terminal.writeLine(`Executing a maximum of ${this._parallelism} simultaneous processes...`);

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

  private async _updateStateAsync(state: ProjectChangeAnalyzer): Promise<void> {
    const { _terminal: terminal } = this;
    terminal.writeLine(`Updating operation states...`);
    let hasIssues: boolean = false;

    function getOperationHash(record: OperationExecutionRecord): string {
      let { hashes } = record;
      if (hashes === undefined) {
        const { operation } = record;
        const { associatedProject, projectFileFilter, outputFolderNames, processor } = operation;

        const trackedFiles: ReadonlyMap<string, string> | undefined = state._tryGetProjectDependencies(
          associatedProject,
          terminal,
          projectFileFilter
        );

        if (trackedFiles && outputFolderNames?.length && processor) {
          const projectOutputLookup: LookupByPath<string> = new LookupByPath(
            outputFolderNames.map((relativePath) => [relativePath, relativePath])
          );

          // Validate no input/output files
          for (const trackedFilePath of trackedFiles.keys()) {
            const match: string | undefined = projectOutputLookup.findChildPath(trackedFilePath);
            if (match) {
              hasIssues = true;
              terminal.writeErrorLine(
                `Project "${associatedProject.packageName}" contains Git tracked file "${trackedFilePath}" in configured ` +
                  `output folder "${match}". This is invalid. Either remove the file from Git or change the configuration to make it not an output.`
              );
            }
          }
        }

        const localHash: string = trackedFiles ? state._hashProjectDependencies(trackedFiles) : '';
        record.hashes = hashes = getOperationHashes(
          operation,
          localHash,
          Array.from(record.dependencies, getOperationHash)
        );
      }
      return hashes.fullHash;
    }

    for (const record of this._executionRecords.values()) {
      getOperationHash(record);
    }

    if (hasIssues) {
      throw new AlreadyReportedError();
    }

    this._terminal.writeLine(`Finished updating operation states.`);
  }

  /**
   * Handles the result of the operation and propagates any relevant effects.
   */
  private _onOperationComplete(record: OperationExecutionRecord): void {
    const { runner, name, status } = record;

    let blockCacheWrite: boolean = !record.isCacheWriteAllowed;
    let blockSkip: boolean = !record.isSkipAllowed;

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
        const { terminal } = record;
        if (message) {
          terminal.writeErrorLine(message);
        }
        terminal.writeErrorLine(`"${name}" failed to build.`);
        const blockedQueue: Set<OperationExecutionRecord> = new Set(record.consumers);
        for (const blockedRecord of blockedQueue) {
          if (blockedRecord.status === OperationStatus.Ready) {
            this._completedOperations++;

            // Now that we have the concept of architectural no-ops, we could implement this by replacing
            // {blockedRecord.runner} with a no-op that sets status to Blocked and logs the blocking
            // operations. However, the existing behavior is a bit simpler, so keeping that for now.
            if (!blockedRecord.silent) {
              terminal.writeErrorLine(`"${blockedRecord.name}" is blocked by "${name}".`);
            }
            blockedRecord.status = OperationStatus.Blocked;

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
          record.terminal.writeLine(Colors.green(`"${name}" was restored from the build cache.`));
        }
        break;
      }

      /**
       * This operation was skipped via legacy change detection.
       */
      case OperationStatus.Skipped: {
        if (!silent) {
          record.terminal.writeLine(Colors.green(`"${name}" was skipped.`));
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
          record.terminal.writeLine(Colors.gray(`"${name}" did not define any work.`));
        }
        break;
      }

      case OperationStatus.Success: {
        if (!silent) {
          record.terminal.writeLine(
            Colors.green(`"${name}" completed successfully in ${record.stopwatch.toString()}.`)
          );
        }
        // Legacy incremental build, if asked, prevent skip in dependents if the operation executed.
        blockSkip ||= !this._changedProjectsOnly;
        break;
      }

      case OperationStatus.SuccessWithWarning: {
        if (!silent) {
          record.terminal.writeWarningLine(
            `"${name}" completed with warnings in ${record.stopwatch.toString()}.`
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
        item.isSkipAllowed = false;
      }

      // Remove this operation from the dependencies, to unblock the scheduler
      item.dependencies.delete(record);
    }
  }
}
