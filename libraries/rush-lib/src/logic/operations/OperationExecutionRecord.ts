// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StdioSummarizer } from '@rushstack/terminal';
import { InternalError, type IAsyncTaskContext } from '@rushstack/node-core-library';
import { CollatedWriter, StreamCollator } from '@rushstack/stream-collator';

import { OperationStatus } from './OperationStatus';
import { IOperationRunner, IOperationRunnerContext } from './IOperationRunner';
import { Operation } from './Operation';
import { Stopwatch } from '../../utilities/Stopwatch';
import type { IOperationExecutionResult } from './IOperationExecutionResult';

export interface IOperationExecutionRecordContext {
  streamCollator: StreamCollator;
  onOperationStatusChanged?: (record: OperationExecutionRecord) => void;
  beforeExecute?: (
    record: OperationExecutionRecord,
    asyncContext: IAsyncTaskContext
  ) => Promise<OperationStatus | undefined>;
  afterExecute?: (
    record: OperationExecutionRecord,
    asyncContext: IAsyncTaskContext
  ) => Promise<OperationStatus | undefined>;

  debugMode: boolean;
  quietMode: boolean;
}

/**
 * Internal class representing everything about executing an operation
 */
export class OperationExecutionRecord implements IOperationRunnerContext, IOperationExecutionResult {
  /**
   * The operation which is being executed
   */
  public readonly operation: Operation;

  /**
   * The current execution status of an operation. Operations start in the 'ready' state,
   * but can be 'blocked' if an upstream operation failed. It is 'executing' when
   * the operation is executing. Once execution is complete, it is either 'success' or
   * 'failure'.
   */
  public status: OperationStatus = OperationStatus.Ready;

  /**
   * The error which occurred while executing this operation, this is stored in case we need
   * it later (for example to re-print errors at end of execution).
   */
  public error: Error | undefined = undefined;

  /**
   * This number represents how far away this Operation is from the furthest "root" operation (i.e.
   * an operation with no consumers). This helps us to calculate the critical path (i.e. the
   * longest chain of projects which must be executed in order, thereby limiting execution speed
   * of the entire operation tree.
   *
   * This number is calculated via a memoized depth-first search, and when choosing the next
   * operation to execute, the operation with the highest criticalPathLength is chosen.
   *
   * Example:
   *        (0) A
   *             \
   *          (1) B     C (0)         (applications)
   *               \   /|\
   *                \ / | \
   *             (2) D  |  X (1)      (utilities)
   *                    | / \
   *                    |/   \
   *                (2) Y     Z (2)   (other utilities)
   *
   * All roots (A & C) have a criticalPathLength of 0.
   * B has a score of 1, since A depends on it.
   * D has a score of 2, since we look at the longest chain (e.g D->B->A is longer than D->C)
   * X has a score of 1, since the only package which depends on it is A
   * Z has a score of 2, since only X depends on it, and X has a score of 1
   * Y has a score of 2, since the chain Y->X->C is longer than Y->C
   *
   * The algorithm is implemented in AsyncOperationQueue.ts as calculateCriticalPathLength()
   */
  public criticalPathLength: number | undefined = undefined;

  /**
   * The set of operations that must complete before this operation executes.
   */
  public readonly dependencies: Set<OperationExecutionRecord> = new Set();
  /**
   * The set of operations that depend on this operation.
   */
  public readonly consumers: Set<OperationExecutionRecord> = new Set();

  public readonly stopwatch: Stopwatch = new Stopwatch();
  public readonly stdioSummarizer: StdioSummarizer = new StdioSummarizer();

  public readonly runner: IOperationRunner;
  public readonly weight: number;

  public nonCachedDurationMs: number | undefined;

  private readonly _context: IOperationExecutionRecordContext;

  private _collatedWriter: CollatedWriter | undefined = undefined;

  private readonly _cleanupTasks: (() => void)[];

  public constructor(operation: Operation, context: IOperationExecutionRecordContext) {
    const { runner } = operation;

    if (!runner) {
      throw new InternalError(
        `Operation for phase '${operation.associatedPhase?.name}' and project '${operation.associatedProject?.packageName}' has no runner.`
      );
    }

    this.operation = operation;
    this.runner = runner;
    this.weight = operation.weight;
    this._context = context;
    this._cleanupTasks = [
      () => this._collatedWriter?.close(),
      () => this.stdioSummarizer.close(),
      () => this.stopwatch.stop(),
      () => this._context.onOperationStatusChanged?.(this)
    ];
  }

  public get name(): string {
    return this.runner.name;
  }

  public get debugMode(): boolean {
    return this._context.debugMode;
  }

  public get quietMode(): boolean {
    return this._context.quietMode;
  }

  public get collatedWriter(): CollatedWriter {
    // Lazy instantiate because the registerTask() call affects display ordering
    if (!this._collatedWriter) {
      this._collatedWriter = this._context.streamCollator.registerTask(this.name);
    }
    return this._collatedWriter;
  }

  public addCleanupTask(task: () => void): void {
    this._cleanupTasks.unshift(task);
  }

  public async executeAsync(
    onResult: (record: OperationExecutionRecord) => void,
    asyncContext: IAsyncTaskContext
  ): Promise<void> {
    this.status = OperationStatus.Executing;
    this.stopwatch.start();
    const { onOperationStatusChanged, beforeExecute, afterExecute } = this._context;
    onOperationStatusChanged?.(this);

    try {
      const earlyStatus: OperationStatus | undefined = beforeExecute
        ? await beforeExecute(this, asyncContext)
        : undefined;
      if (earlyStatus !== undefined) {
        this.status = earlyStatus;
        onOperationStatusChanged?.(this);
        onResult(this);
        return;
      }

      this.status = await this.runner.executeAsync(this);
      onOperationStatusChanged?.(this);

      if (afterExecute) {
        const updatedStatus: OperationStatus | undefined = await afterExecute(this, asyncContext);
        if (updatedStatus !== undefined) {
          this.status = updatedStatus;
          onOperationStatusChanged?.(this);
        }
      }

      // Delegate global state reporting
      onResult(this);
    } catch (error) {
      this.status = OperationStatus.Failure;
      onOperationStatusChanged?.(this);
      this.error = error;
      // Delegate global state reporting
      onResult(this);
    } finally {
      for (const task of this._cleanupTasks.splice(0)) {
        try {
          task();
        } catch (e) {
          if (this.debugMode) {
            // eslint-disable-next-line no-console
            console.error(`Cleanup task in ${this.name} failed: ${e}`);
          }
        }
      }
    }
  }
}
