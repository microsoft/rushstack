﻿// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Async } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import type { IOperationState } from './IOperationRunner';
import type { IExecuteOperationContext, Operation } from './Operation';
import type { OperationGroupRecord } from './OperationGroupRecord';
import { OperationStatus } from './OperationStatus';
import { calculateCriticalPathLengths } from './calculateCriticalPath';
import { WorkQueue } from './WorkQueue';

/**
 * Options for the current run.
 *
 * @beta
 */
export interface IOperationExecutionOptions<
  TOperationMetadata extends {} = {},
  TGroupMetadata extends {} = {}
> {
  abortSignal: AbortSignal;
  parallelism: number;
  terminal: ITerminal;

  requestRun?: (requestor?: string) => void;

  beforeExecuteOperationAsync?: (operation: Operation<TOperationMetadata, TGroupMetadata>) => Promise<void>;
  afterExecuteOperationAsync?: (operation: Operation<TOperationMetadata, TGroupMetadata>) => Promise<void>;
  beforeExecuteOperationGroupAsync?: (operationGroup: OperationGroupRecord<TGroupMetadata>) => Promise<void>;
  afterExecuteOperationGroupAsync?: (operationGroup: OperationGroupRecord<TGroupMetadata>) => Promise<void>;
}

/**
 * A class which manages the execution of a set of tasks with interdependencies.
 * Initially, and at the end of each task execution, all unblocked tasks
 * are added to a ready queue which is then executed. This is done continually until all
 * tasks are complete, or prematurely fails if any of the tasks fail.
 *
 * @beta
 */
export class OperationExecutionManager<TOperationMetadata extends {} = {}, TGroupMetadata extends {} = {}> {
  /**
   * The set of operations that will be executed
   */
  private readonly _operations: Operation<TOperationMetadata, TGroupMetadata>[];
  /**
   * The total number of non-silent operations in the graph.
   * Silent operations are generally used to simplify the construction of the graph.
   */
  private readonly _trackedOperationCount: number;

  private readonly _groupRecords: Set<OperationGroupRecord<TGroupMetadata>>;

  public constructor(operations: ReadonlySet<Operation<TOperationMetadata, TGroupMetadata>>) {
    let trackedOperationCount: number = 0;
    for (const operation of operations) {
      if (!operation.runner?.silent) {
        // Only count non-silent operations
        trackedOperationCount++;
      }
    }

    this._trackedOperationCount = trackedOperationCount;

    this._operations = calculateCriticalPathLengths(operations);

    this._groupRecords = new Set(Array.from(this._operations, (e) => e.group).filter((e) => e !== undefined));

    for (const consumer of operations) {
      for (const dependency of consumer.dependencies) {
        if (!operations.has(dependency)) {
          throw new Error(
            `Operation ${JSON.stringify(consumer.name)} declares a dependency on operation ` +
              `${JSON.stringify(dependency.name)} that is not in the set of operations to execute.`
          );
        }
      }
    }
  }

  /**
   * Executes all operations which have been registered, returning a promise which is resolved when all the
   * operations are completed successfully, or rejects when any operation fails.
   */
  public async executeAsync(
    executionOptions: IOperationExecutionOptions<TOperationMetadata, TGroupMetadata>
  ): Promise<OperationStatus> {
    let hasReportedFailures: boolean = false;

    const { abortSignal, parallelism, terminal, requestRun } = executionOptions;

    if (abortSignal.aborted) {
      return OperationStatus.Aborted;
    }

    const startedGroups: Set<OperationGroupRecord> = new Set();
    const finishedGroups: Set<OperationGroupRecord> = new Set();

    const maxParallelism: number = Math.min(this._operations.length, parallelism);

    for (const groupRecord of this._groupRecords) {
      groupRecord.reset();
    }

    for (const operation of this._operations) {
      operation.reset();
    }

    terminal.writeVerboseLine(`Executing a maximum of ${maxParallelism} simultaneous tasks...`);

    const workQueueAbortController: AbortController = new AbortController();
    const abortHandler: () => void = () => workQueueAbortController.abort();
    abortSignal.addEventListener('abort', abortHandler, { once: true });
    try {
      const workQueue: WorkQueue = new WorkQueue(workQueueAbortController.signal);

      const executionContext: IExecuteOperationContext = {
        terminal,
        abortSignal,

        requestRun,

        queueWork: (workFn: () => Promise<OperationStatus>, priority: number): Promise<OperationStatus> => {
          return workQueue.pushAsync(workFn, priority);
        },

        beforeExecuteAsync: async (
          operation: Operation<TOperationMetadata, TGroupMetadata>
        ): Promise<void> => {
          // Initialize group if uninitialized and log the group name
          const { group, runner } = operation;
          if (group) {
            if (!startedGroups.has(group)) {
              startedGroups.add(group);
              group.startTimer();
              terminal.writeLine(` ---- ${group.name} started ---- `);
              await executionOptions.beforeExecuteOperationGroupAsync?.(group);
            }
          }
          if (!runner?.silent) {
            await executionOptions.beforeExecuteOperationAsync?.(operation);
          }
        },

        afterExecuteAsync: async (
          operation: Operation<TOperationMetadata, TGroupMetadata>,
          state: IOperationState
        ): Promise<void> => {
          const { group, runner } = operation;
          if (group) {
            group.setOperationAsComplete(operation, state);
          }

          if (state.status === OperationStatus.Failure) {
            // This operation failed. Mark it as such and all reachable dependents as blocked.
            // Failed operations get reported, even if silent.
            // Generally speaking, silent operations shouldn't be able to fail, so this is a safety measure.
            const message: string | undefined = state.error?.message;
            if (message) {
              terminal.writeErrorLine(message);
            }
            hasReportedFailures = true;
          }

          if (!runner?.silent) {
            await executionOptions.afterExecuteOperationAsync?.(operation);
          }

          if (group) {
            // Log out the group name and duration if it is the last operation in the group
            if (group?.finished && !finishedGroups.has(group)) {
              finishedGroups.add(group);
              const finishedLoggingWord: string = group.hasFailures
                ? 'encountered an error'
                : group.hasCancellations
                  ? 'cancelled'
                  : 'finished';
              terminal.writeLine(
                ` ---- ${group.name} ${finishedLoggingWord} (${group.duration.toFixed(3)}s) ---- `
              );
              await executionOptions.afterExecuteOperationGroupAsync?.(group);
            }
          }
        }
      };

      const workQueuePromise: Promise<void> = Async.forEachAsync(
        workQueue,
        (workFn: () => Promise<void>) => workFn(),
        {
          concurrency: maxParallelism
        }
      );

      await Promise.all(this._operations.map((record: Operation) => record._executeAsync(executionContext)));

      // Terminate queue execution.
      workQueueAbortController.abort();
      await workQueuePromise;
    } finally {
      // Cleanup resources
      abortSignal.removeEventListener('abort', abortHandler);
    }

    const finalStatus: OperationStatus =
      this._trackedOperationCount === 0
        ? OperationStatus.NoOp
        : abortSignal.aborted
          ? OperationStatus.Aborted
          : hasReportedFailures
            ? OperationStatus.Failure
            : OperationStatus.Success;

    return finalStatus;
  }
}
