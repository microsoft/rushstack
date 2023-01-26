// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminal } from '@rushstack/node-core-library';

import { OperationStatus } from './OperationStatus';
import type { Operation, IExecuteOperationContext } from './Operation';
import { OperationGroupRecord } from './OperationGroupRecord';
import { CancellationToken } from '../pluginFramework/CancellationToken';
import { computeTopology } from './AsyncOperationQueue';
import { IOperationState } from './IOperationRunner';

export interface IOperationExecutionOptions {
  cancellationToken: CancellationToken;
  parallelism: number;
  terminal: ITerminal;

  requestRun?: () => void;
}

/**
 * A class which manages the execution of a set of tasks with interdependencies.
 * Initially, and at the end of each task execution, all unblocked tasks
 * are added to a ready queue which is then executed. This is done continually until all
 * tasks are complete, or prematurely fails if any of the tasks fail.
 */
export class OperationExecutionManager {
  private readonly _operations: Operation[];
  private readonly _groupRecords: Map<string, OperationGroupRecord>;
  private readonly _totalOperations: number;

  public constructor(operations: ReadonlySet<Operation>) {
    const groupRecords: Map<string, OperationGroupRecord> = new Map();
    this._groupRecords = groupRecords;

    let totalOperations: number = 0;
    for (const operation of operations) {
      const { groupName } = operation;
      let group: OperationGroupRecord | undefined = undefined;
      if (groupName && !(group = groupRecords.get(groupName))) {
        group = new OperationGroupRecord(groupName);
        groupRecords.set(groupName, group);
      }

      group?.addOperation(operation);

      if (!operation.runner?.silent) {
        // Only count non-silent operations
        totalOperations++;
      }
    }

    this._totalOperations = totalOperations;

    this._operations = computeTopology(operations);

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
  public async executeAsync(executionOptions: IOperationExecutionOptions): Promise<OperationStatus> {
    const totalOperations: number = this._totalOperations;

    let hasReportedFailures: boolean = false;

    const { cancellationToken, parallelism, terminal, requestRun } = executionOptions;

    const startedGroups: Set<OperationGroupRecord> = new Set();
    const finishedGroups: Set<OperationGroupRecord> = new Set();

    const maxParallelism: number = Math.min(totalOperations, parallelism);
    const groupRecords: Map<string, OperationGroupRecord> = this._groupRecords;
    for (const groupRecord of groupRecords.values()) {
      groupRecord.reset();
    }

    for (const operation of this._operations) {
      operation.reset();
    }

    terminal.writeVerboseLine(`Executing a maximum of ${maxParallelism} simultaneous tasks...`);

    const executionContext: IExecuteOperationContext = {
      terminal,
      cancellationToken,

      requestRun,

      queueWork: <T>(workFn: () => Promise<T>, priority: number): Promise<T> => {
        // TODO: Update to throttle parallelism
        // Can just be a standard queue from async
        return workFn();
      },

      beforeExecute: (operation: Operation): void => {
        // Initialize group if uninitialized and log the group name
        const { groupName } = operation;
        const groupRecord: OperationGroupRecord | undefined = groupName
          ? groupRecords.get(groupName)
          : undefined;
        if (groupRecord && !startedGroups.has(groupRecord)) {
          startedGroups.add(groupRecord);
          groupRecord.startTimer();
          terminal.writeLine(` ---- ${groupRecord.name} started ---- `);
        }
      },

      afterExecute: (operation: Operation, state: IOperationState): void => {
        const { groupName } = operation;
        const groupRecord: OperationGroupRecord | undefined = groupName
          ? groupRecords.get(groupName)
          : undefined;
        if (groupRecord) {
          groupRecord.setOperationAsComplete(operation, state);
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

        // Log out the group name and duration if it is the last operation in the group
        if (groupRecord?.finished && !finishedGroups.has(groupRecord)) {
          finishedGroups.add(groupRecord);
          const finishedLoggingWord: string = groupRecord.hasFailures
            ? 'encountered an error'
            : groupRecord.hasCancellations
            ? 'cancelled'
            : 'finished';
          terminal.writeLine(
            ` ---- ${groupRecord.name} ${finishedLoggingWord} (${groupRecord.duration.toFixed(3)}s) ---- `
          );
        }
      }
    };

    await Promise.all(this._operations.map((record: Operation) => record._executeAsync(executionContext)));

    const finalStatus: OperationStatus =
      this._totalOperations === 0
        ? OperationStatus.NoOp
        : cancellationToken.isCancelled
        ? OperationStatus.Cancelled
        : hasReportedFailures
        ? OperationStatus.Failure
        : OperationStatus.Success;

    return finalStatus;
  }
}
