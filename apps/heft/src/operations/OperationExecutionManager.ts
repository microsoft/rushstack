// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import { AlreadyReportedError, Async, ITerminal } from '@rushstack/node-core-library';

import { AsyncOperationQueue, IOperationSortFunction } from './AsyncOperationQueue';
import { OperationStatus } from './OperationStatus';
import { IOperationExecutionRecordContext, OperationExecutionRecord } from './OperationExecutionRecord';
import type { Operation } from './Operation';
import { OperationGroupRecord } from './OperationGroupRecord';
import type { LoggingManager } from '../pluginFramework/logging/LoggingManager';

export interface IOperationExecutionManagerOptions {
  parallelism: string | undefined;
  terminal: ITerminal;
  loggingManager: LoggingManager;
}

/**
 * A class which manages the execution of a set of tasks with interdependencies.
 * Initially, and at the end of each task execution, all unblocked tasks
 * are added to a ready queue which is then executed. This is done continually until all
 * tasks are complete, or prematurely fails if any of the tasks fail.
 */
export class OperationExecutionManager {
  private readonly _executionRecords: Set<OperationExecutionRecord>;
  private readonly _groupRecords: Map<string, OperationGroupRecord> = new Map();
  private readonly _startedGroups: Set<OperationGroupRecord> = new Set();
  private readonly _finishedGroups: Set<OperationGroupRecord> = new Set();
  private readonly _parallelism: number;
  private readonly _totalOperations: number;
  private readonly _terminal: ITerminal;

  // Variables for current status
  private _hasReportedFailures: boolean;

  public constructor(operations: Set<Operation>, options: IOperationExecutionManagerOptions) {
    const { parallelism, terminal, loggingManager } = options;
    this._hasReportedFailures = false;
    this._terminal = terminal;

    // Convert the developer graph to the mutable execution graph;
    const executionRecordContext: IOperationExecutionRecordContext = {
      terminal,
      loggingManager
    };

    let totalOperations: number = 0;
    const executionRecords: Map<Operation, OperationExecutionRecord> = new Map();
    for (const operation of operations) {
      let group: OperationGroupRecord | undefined = undefined;
      if (operation.groupName && !(group = this._groupRecords.get(operation.groupName))) {
        group = new OperationGroupRecord(operation.groupName);
        this._groupRecords.set(operation.groupName, group);
      }

      const executionRecord: OperationExecutionRecord = new OperationExecutionRecord({
        operation,
        group,
        context: executionRecordContext
      });

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
            `Operation ${JSON.stringify(consumer.name)} declares a dependency on operation ` +
              `${JSON.stringify(dependency.name)} that is not in the set of operations to execute.`
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

  /**
   * Executes all operations which have been registered, returning a promise which is resolved when all the
   * operations are completed successfully, or rejects when any operation fails.
   */
  public async executeAsync(): Promise<void> {
    const totalOperations: number = this._totalOperations;

    this._terminal.writeVerboseLine(`Executing a maximum of ${this._parallelism} simultaneous processes...`);

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
      if (record.status === OperationStatus.Failure) {
        // This operation failed. Mark it as such and all reachable dependents as blocked.
        // Failed operations get reported, even if silent.
        // Generally speaking, silent operations shouldn't be able to fail, so this is a safety measure.
        const message: string | undefined = record.error?.message;
        if (message) {
          record.terminal.writeErrorLine(message);
        }
        const blockedQueue: Set<OperationExecutionRecord> = new Set(record.consumers);
        for (const blockedRecord of blockedQueue) {
          if (blockedRecord.status === OperationStatus.Ready) {
            blockedRecord.status = OperationStatus.Blocked;
            for (const dependent of blockedRecord.consumers) {
              blockedQueue.add(dependent);
            }
          }
        }
        this._hasReportedFailures = true;
      } else if (record.status === OperationStatus.Cancelled) {
        // This operation was cancelled. Mark it as such and all reachable dependents as cancelled.
        const cancelledQueue: Set<OperationExecutionRecord> = new Set(record.consumers);
        for (const cancelledRecord of cancelledQueue) {
          if (cancelledRecord.status === OperationStatus.Ready) {
            cancelledRecord.status = OperationStatus.Cancelled;
            for (const dependent of cancelledRecord.consumers) {
              cancelledQueue.add(dependent);
            }
          }
        }
      }

      // Apply status changes to direct dependents
      for (const item of record.consumers) {
        // Remove this operation from the dependencies, to unblock the scheduler
        item.dependencies.delete(record);
      }
    };

    await Async.forEachAsync(
      executionQueue,
      async (operation: OperationExecutionRecord) => {
        // Initialize group if uninitialized and log the group name
        const groupRecord: OperationGroupRecord | undefined = operation.group;
        if (groupRecord && !this._startedGroups.has(groupRecord)) {
          this._startedGroups.add(groupRecord);
          this._terminal.writeLine(` ---- ${groupRecord.name} started ---- `);
        }

        // Execute the operation
        await operation.executeAsync(onOperationComplete);

        // Log out the group name and duration if it is the last operation in the group
        if (groupRecord?.finished && !this._finishedGroups.has(groupRecord)) {
          this._finishedGroups.add(groupRecord);
          const finishedLoggingWord: string = groupRecord.hasFailures
            ? 'encountered an error'
            : groupRecord.hasCancellations
            ? 'cancelled'
            : 'finished';
          this._terminal.writeLine(
            ` ---- ${groupRecord.name} ${finishedLoggingWord} (${groupRecord.duration.toFixed(3)}s) ---- `
          );
        }
      },
      {
        concurrency: maxParallelism
      }
    );

    if (this._hasReportedFailures) {
      throw new AlreadyReportedError();
    }
  }
}
