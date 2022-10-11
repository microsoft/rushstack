// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  DiscardStdoutTransform,
  SplitterTransform,
  StderrLineTransform,
  StdioSummarizer,
  TerminalWritable,
  TextRewriterTransform
} from '@rushstack/terminal';
import { InternalError, ITerminal, NewlineKind, Terminal } from '@rushstack/node-core-library';
import { CollatedTerminal, CollatedWriter, StreamCollator } from '@rushstack/stream-collator';

import { OperationStatus } from './OperationStatus';
import { IOperationRunner, IOperationRunnerContext } from './IOperationRunner';
import { Operation } from './Operation';
import { Stopwatch } from '../../utilities/Stopwatch';
import { OperationStateFile } from './OperationStateFile';
import { IOperationProcessor } from './IOperationProcessor';
import { CollatedTerminalProvider } from '../../utilities/CollatedTerminalProvider';
import { IOperationHashes } from './OperationHash';

export interface IOperationExecutionRecordContext {
  streamCollator: StreamCollator;

  debugMode: boolean;
  quietMode: boolean;
}

/**
 * Internal class representing everything about executing an operation
 */
export class OperationExecutionRecord implements IOperationRunnerContext {
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

  public silent: boolean = false;

  public isSkipAllowed: boolean = true;
  public isCacheReadAllowed: boolean = true;
  public isCacheWriteAllowed: boolean = true;

  public hashes: IOperationHashes | undefined = undefined;

  /**
   * The set of operations that must complete before this operation executes.
   */
  public readonly dependencies: Set<OperationExecutionRecord> = new Set();
  /**
   * The set of operations that depend on this operation.
   */
  public readonly consumers: Set<OperationExecutionRecord> = new Set();

  public readonly operation: Operation;

  public readonly stopwatch: Stopwatch = new Stopwatch();
  public readonly stdioSummarizer: StdioSummarizer = new StdioSummarizer();

  public runner: IOperationRunner;
  public readonly weight: number;
  public readonly _operationStateFile: OperationStateFile | undefined;

  private readonly _context: IOperationExecutionRecordContext;

  private _writer: CollatedWriter | undefined = undefined;
  private _terminalWritable: TerminalWritable | undefined = undefined;
  private _terminal: ITerminal | undefined = undefined;

  public constructor(operation: Operation, context: IOperationExecutionRecordContext) {
    this.operation = operation;
    const { runner } = operation;

    if (!runner) {
      throw new InternalError(
        `Operation for phase '${operation.associatedPhase.name}' and project '${operation.associatedProject.packageName}' has no runner.`
      );
    }
    this.silent = runner.silent;

    this.runner = runner;
    this.weight = operation.weight;

    const { associatedProject } = operation;

    this._operationStateFile = associatedProject
      ? new OperationStateFile({
          filename: `${associatedProject.projectFolder}/${operation.metadataFolderRelativePath}/state.json`
        })
      : undefined;
    this._context = context;
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

  public get nonCachedDurationMs(): number | undefined {
    // Lazy calculated because the state file is created/restored later on
    return this._operationStateFile?.state?.nonCachedDurationMs;
  }

  public get terminalWritable(): TerminalWritable {
    if (!this._terminalWritable) {
      const stderrLineTransform: StderrLineTransform = new StderrLineTransform({
        destination: this.stdioSummarizer,
        newlineKind: NewlineKind.Lf // for StdioSummarizer
      });

      const discardTransform: DiscardStdoutTransform = new DiscardStdoutTransform({
        destination: this._collatedWriter
      });

      const splitterTransform: SplitterTransform = new SplitterTransform({
        destinations: [this.quietMode ? discardTransform : this._collatedWriter, stderrLineTransform]
      });

      const normalizeNewlineTransform: TextRewriterTransform = new TextRewriterTransform({
        destination: splitterTransform,
        normalizeNewlines: NewlineKind.Lf,
        ensureNewlineAtEnd: true
      });

      this._terminalWritable = normalizeNewlineTransform;
    }
    return this._terminalWritable;
  }

  public get terminal(): ITerminal {
    if (!this._terminal) {
      const collatedTerminal: CollatedTerminal = new CollatedTerminal(this.terminalWritable);
      this._terminal = new Terminal(new CollatedTerminalProvider(collatedTerminal));
    }
    return this._terminal;
  }

  private get _collatedWriter(): CollatedWriter {
    // Lazy instantiate because the registerTask() call affects display ordering
    if (!this._writer) {
      this._writer = this._context.streamCollator.registerTask(this.name);
    }
    return this._writer;
  }

  public async executeAsync(onResult: (record: OperationExecutionRecord) => void): Promise<void> {
    this.status = OperationStatus.Executing;

    try {
      let status: OperationStatus = this.status;
      const processor: IOperationProcessor | undefined = this.operation.processor;
      if (processor) {
        // Handle, e.g. build cache read
        status = await processor.beforeBuildAsync(this);
        if (status !== OperationStatus.Ready) {
          this.status = status;
          await this._operationStateFile?.tryRestoreAsync();
          return onResult(this);
        }
      }

      this.stopwatch.start();
      status = await this.runner.executeAsync(this);
      this.stopwatch.stop();

      await this._operationStateFile?.writeAsync({
        nonCachedDurationMs: this.stopwatch.duration * 1000,
        hashes: this.hashes,
        status
      });

      if (processor) {
        // Handle, e.g. build cache write
        status = await processor.afterBuildAsync(this, status);
      }

      this.status = status;
      // Delegate global state reporting
      onResult(this);
    } catch (error) {
      this.status = OperationStatus.Failure;
      this.error = error;
      // Delegate global state reporting
      onResult(this);
    } finally {
      this.silent = this.runner.silent;
      this._terminalWritable?.close();
      this._writer?.close();
      this.stopwatch.stop();
    }
  }
}
