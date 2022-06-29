// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import { performance } from 'perf_hooks';
import { AlreadyReportedError, Async, ITerminal } from '@rushstack/node-core-library';

import { AsyncOperationQueue, IOperationSortFunction } from './AsyncOperationQueue';
import { OperationStatus } from './OperationStatus';
import { IOperationExecutionRecordContext, OperationExecutionRecord } from './OperationExecutionRecord';
import type { Operation } from './Operation';
import type { LoggingManager } from '../pluginFramework/logging/LoggingManager';

export interface IOperationExecutionManagerOptions {
  debugMode: boolean;
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
  private readonly _runnerGroupRecords: ReadonlyMap<string, Set<OperationExecutionRecord>>;
  private readonly _runnerGroupRemainingRecords: Map<string, Set<OperationExecutionRecord>>;
  private readonly _runnerGroupStartTimes: Map<string, number> = new Map();
  private readonly _parallelism: number;
  private readonly _totalOperations: number;
  private readonly _terminal: ITerminal;

  // Variables for current status
  private _hasReportedFailures: boolean;

  public constructor(operations: Set<Operation>, options: IOperationExecutionManagerOptions) {
    const { debugMode, parallelism, terminal, loggingManager } = options;
    this._hasReportedFailures = false;
    this._terminal = terminal;

    // Convert the developer graph to the mutable execution graph;
    const executionRecordContext: IOperationExecutionRecordContext = {
      debugMode,
      terminal,
      loggingManager
    };

    let totalOperations: number = 0;
    const executionRecords: Map<Operation, OperationExecutionRecord> = new Map();
    const runnerGroupExecutionRecords: Map<string, Set<OperationExecutionRecord>> = new Map();
    for (const operation of operations) {
      const executionRecord: OperationExecutionRecord = new OperationExecutionRecord(
        operation,
        executionRecordContext
      );

      executionRecords.set(operation, executionRecord);
      const runnerGroupName: string | undefined = executionRecord.runner.groupName;
      if (runnerGroupName) {
        const groupExecutionRecords: Set<OperationExecutionRecord> | undefined =
          runnerGroupExecutionRecords.get(runnerGroupName);
        if (!groupExecutionRecords) {
          runnerGroupExecutionRecords.set(runnerGroupName, new Set([executionRecord]));
        } else {
          groupExecutionRecords.add(executionRecord);
        }
      }

      if (!executionRecord.runner.silent) {
        // Only count non-silent operations
        totalOperations++;
      }
    }
    this._runnerGroupRecords = runnerGroupExecutionRecords;
    this._runnerGroupRemainingRecords = new Map(runnerGroupExecutionRecords);
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

    this._terminal.writeLine(`Executing a maximum of ${this._parallelism} simultaneous processes...`);

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
      const endTime: number = performance.now();

      // This operation failed. Mark it as such and all reachable dependents as blocked.
      if (record.status === OperationStatus.Failure) {
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
            if (blockedRecord.runner.groupName) {
              this._runnerGroupRemainingRecords.get(blockedRecord.runner.groupName)!.delete(blockedRecord);
            }
          }
        }
        this._hasReportedFailures = true;
      }

      // At this point, we should only have Success/SuccessWithWarning/Failure cases. Remove
      // the record and log out the overall time taken for this runner group to complete.
      const runnerGroupName: string | undefined = record.runner.groupName;
      if (runnerGroupName) {
        const groupRemainingRecords: Set<OperationExecutionRecord> =
          this._runnerGroupRemainingRecords.get(runnerGroupName)!;
        groupRemainingRecords.delete(record);
        if (groupRemainingRecords.size === 0) {
          const startTime: number = this._runnerGroupStartTimes.get(runnerGroupName)!;
          const executionTime: number = Math.round(endTime - startTime);
          const hasFailures: boolean = [...this._runnerGroupRecords.get(runnerGroupName)!].some(
            (record: OperationExecutionRecord) => record.status === OperationStatus.Failure
          );

          const finishedLoggingWord: string = hasFailures ? 'encountered an error' : 'finished';
          this._terminal.writeLine(
            ` ---- ${runnerGroupName} ${finishedLoggingWord} (${executionTime}ms) ---- `
          );
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
        const runnerGroupName: string | undefined = operation.runner.groupName;
        if (runnerGroupName && !this._runnerGroupStartTimes.has(runnerGroupName)) {
          this._runnerGroupStartTimes.set(runnerGroupName, performance.now());
          this._terminal.writeLine(` ---- ${runnerGroupName} started ---- `);
        }
        // Execute the operation
        await operation.executeAsync(onOperationComplete);
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
