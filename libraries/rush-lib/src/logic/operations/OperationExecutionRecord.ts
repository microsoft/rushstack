// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'node:crypto';

import {
  type ITerminal,
  type ITerminalProvider,
  DiscardStdoutTransform,
  SplitterTransform,
  StderrLineTransform,
  StdioSummarizer,
  ProblemCollector,
  TextRewriterTransform,
  Terminal,
  type TerminalWritable
} from '@rushstack/terminal';
import { InternalError, NewlineKind, FileError } from '@rushstack/node-core-library';
import { CollatedTerminal, type CollatedWriter, type StreamCollator } from '@rushstack/stream-collator';

import { OperationStatus, TERMINAL_STATUSES } from './OperationStatus';
import type { IOperationRunner, IOperationRunnerContext } from './IOperationRunner';
import type { Operation } from './Operation';
import { Stopwatch } from '../../utilities/Stopwatch';
import { OperationMetadataManager } from './OperationMetadataManager';
import type { IPhase } from '../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { CollatedTerminalProvider } from '../../utilities/CollatedTerminalProvider';
import type { IOperationExecutionResult } from './IOperationExecutionResult';
import type { IInputsSnapshot } from '../incremental/InputsSnapshot';
import { RushConstants } from '../RushConstants';
import type { IEnvironment } from '../../utilities/Utilities';
import {
  getProjectLogFilePaths,
  type ILogFilePaths,
  initializeProjectLogFilesAsync
} from './ProjectLogWritable';

/**
 * @internal
 */
export interface IOperationExecutionRecordContext {
  streamCollator: StreamCollator;
  onOperationStateChanged?: (record: OperationExecutionRecord) => void;
  createEnvironment?: (record: OperationExecutionRecord) => IEnvironment;
  inputsSnapshot: IInputsSnapshot | undefined;

  debugMode: boolean;
  quietMode: boolean;
}

/**
 * Context object for the executeAsync() method.
 * @internal
 */
export interface IOperationExecutionContext {
  onStartAsync: (record: OperationExecutionRecord) => Promise<OperationStatus | undefined>;
  onResultAsync: (record: OperationExecutionRecord) => Promise<void>;
}

/**
 * Internal class representing everything about executing an operation
 *
 * @internal
 */
export class OperationExecutionRecord implements IOperationRunnerContext, IOperationExecutionResult {
  /**
   * The associated operation.
   */
  public readonly operation: Operation;

  /**
   * The error which occurred while executing this operation, this is stored in case we need
   * it later (for example to re-print errors at end of execution).
   */
  public error: Error | undefined = undefined;

  /**
   * If true, this operation should be executed. If false, it should be skipped.
   */
  public enabled: boolean;

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
   * ```
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
   * ```
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
  public readonly stdioSummarizer: StdioSummarizer = new StdioSummarizer({
    // Allow writing to this object after transforms have been closed. We clean it up manually in a finally block.
    preventAutoclose: true
  });
  public readonly problemCollector: ProblemCollector = new ProblemCollector({
    matcherJson: [
      {
        name: 'rushstack-file-error-unix',
        pattern: FileError.getProblemMatcher({ format: 'Unix' })
      },
      {
        name: 'rushstack-file-error-visualstudio',
        pattern: FileError.getProblemMatcher({ format: 'VisualStudio' })
      }
    ]
  });

  public readonly runner: IOperationRunner;
  public readonly associatedPhase: IPhase;
  public readonly associatedProject: RushConfigurationProject;
  public readonly _operationMetadataManager: OperationMetadataManager;

  public logFilePaths: ILogFilePaths | undefined;

  private readonly _context: IOperationExecutionRecordContext;

  private _collatedWriter: CollatedWriter | undefined = undefined;
  private _status: OperationStatus;
  private _stateHash: string | undefined;
  private _stateHashComponents: ReadonlyArray<string> | undefined;

  public constructor(operation: Operation, context: IOperationExecutionRecordContext) {
    const { runner, associatedPhase, associatedProject, enabled } = operation;

    if (!runner) {
      throw new InternalError(
        `Operation for phase '${associatedPhase.name}' and project '${associatedProject.packageName}' has no runner.`
      );
    }

    this.operation = operation;
    this.enabled = !!enabled;
    this.runner = runner;
    this.associatedPhase = associatedPhase;
    this.associatedProject = associatedProject;
    this.logFilePaths = undefined;

    this._operationMetadataManager = new OperationMetadataManager({
      operation
    });

    this._context = context;
    this._status = operation.dependencies.size > 0 ? OperationStatus.Waiting : OperationStatus.Ready;
    this._stateHash = undefined;
    this._stateHashComponents = undefined;
  }

  public get name(): string {
    return this.runner.name;
  }

  public get weight(): number {
    return this.operation.weight;
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

  public get nonCachedDurationMs(): number | undefined {
    // Lazy calculated because the state file is created/restored later on
    return this._operationMetadataManager?.stateFile.state?.nonCachedDurationMs;
  }

  public get cobuildRunnerId(): string | undefined {
    // Lazy calculated because the state file is created/restored later on
    return this._operationMetadataManager?.stateFile.state?.cobuildRunnerId;
  }

  public get environment(): IEnvironment | undefined {
    return this._context.createEnvironment?.(this);
  }

  public get metadataFolderPath(): string | undefined {
    return this._operationMetadataManager?.metadataFolderPath;
  }

  public get isTerminal(): boolean {
    return TERMINAL_STATUSES.has(this.status);
  }

  /**
   * The current execution status of an operation. Operations start in the 'ready' state,
   * but can be 'blocked' if an upstream operation failed. It is 'executing' when
   * the operation is executing. Once execution is complete, it is either 'success' or
   * 'failure'.
   */
  public get status(): OperationStatus {
    return this._status;
  }
  public set status(newStatus: OperationStatus) {
    if (newStatus === this._status) {
      return;
    }
    this._status = newStatus;
    this._context.onOperationStateChanged?.(this);
  }

  public get silent(): boolean {
    return !this.enabled || this.runner.silent;
  }

  public getStateHash(): string {
    if (this._stateHash === undefined) {
      const components: readonly string[] = this.getStateHashComponents();

      const hasher: crypto.Hash = crypto.createHash('sha1');
      components.forEach((component) => {
        hasher.update(`${RushConstants.hashDelimiter}${component}`);
      });

      const hash: string = hasher.digest('hex');
      this._stateHash = hash;
    }
    return this._stateHash;
  }

  public getStateHashComponents(): ReadonlyArray<string> {
    if (!this._stateHashComponents) {
      const { inputsSnapshot } = this._context;

      if (!inputsSnapshot) {
        throw new Error(`Cannot calculate state hash without git.`);
      }

      if (this.dependencies.size !== this.operation.dependencies.size) {
        throw new InternalError(
          `State hash calculation failed. Dependencies of record do not match the operation.`
        );
      }

      // The final state hashes of operation dependencies are factored into the hash to ensure that any
      // state changes in dependencies will invalidate the cache.
      const components: string[] = Array.from(this.dependencies, (record) => {
        return `${record.name}=${record.getStateHash()}`;
      }).sort();

      const { associatedProject, associatedPhase } = this;
      // Examples of data in the local state hash:
      // - Environment variables specified in `dependsOnEnvVars`
      // - Git hashes of tracked files in the associated project
      // - Git hash of the shrinkwrap file for the project
      // - Git hashes of any files specified in `dependsOnAdditionalFiles` (must not be associated with a project)
      const localStateHash: string = inputsSnapshot.getOperationOwnStateHash(
        associatedProject,
        associatedPhase.name
      );
      components.push(`local=${localStateHash}`);

      // Examples of data in the config hash:
      // - CLI parameters (ShellOperationRunner)
      const configHash: string = this.runner.getConfigHash();
      components.push(`config=${configHash}`);
      this._stateHashComponents = components;
    }
    return this._stateHashComponents;
  }

  /**
   * {@inheritdoc IOperationRunnerContext.runWithTerminalAsync}
   */
  public async runWithTerminalAsync<T>(
    callback: (terminal: ITerminal, terminalProvider: ITerminalProvider) => Promise<T>,
    options: {
      createLogFile: boolean;
      logFileSuffix: string;
    }
  ): Promise<T> {
    const { associatedProject, stdioSummarizer, problemCollector } = this;
    const { createLogFile, logFileSuffix = '' } = options;

    const logFilePaths: ILogFilePaths | undefined = createLogFile
      ? getProjectLogFilePaths({
          project: associatedProject,
          logFilenameIdentifier: `${this._operationMetadataManager.logFilenameIdentifier}${logFileSuffix}`
        })
      : undefined;

    const projectLogWritable: TerminalWritable | undefined = logFilePaths
      ? await initializeProjectLogFilesAsync({
          logFilePaths,
          enableChunkedOutput: true
        })
      : undefined;
    this.logFilePaths = logFilePaths;
    if (logFilePaths) {
      this._context.onOperationStateChanged?.(this);
    }

    try {
      //#region OPERATION LOGGING
      // TERMINAL PIPELINE:
      //
      //                             +--> quietModeTransform? --> collatedWriter
      //                             |
      // normalizeNewlineTransform --1--> stderrLineTransform --2--> projectLogWritable
      //                                                        |
      //                                                        +--> stdioSummarizer
      const destination: TerminalWritable = projectLogWritable
        ? new SplitterTransform({
            destinations: [projectLogWritable, stdioSummarizer, problemCollector]
          })
        : stdioSummarizer;

      const stderrLineTransform: StderrLineTransform = new StderrLineTransform({
        destination,
        newlineKind: NewlineKind.Lf // for StdioSummarizer
      });

      const splitterTransform1: SplitterTransform = new SplitterTransform({
        destinations: [
          this.quietMode
            ? new DiscardStdoutTransform({ destination: this.collatedWriter })
            : this.collatedWriter,
          stderrLineTransform
        ]
      });

      const normalizeNewlineTransform: TextRewriterTransform = new TextRewriterTransform({
        destination: splitterTransform1,
        normalizeNewlines: NewlineKind.Lf,
        ensureNewlineAtEnd: true
      });

      const collatedTerminal: CollatedTerminal = new CollatedTerminal(normalizeNewlineTransform);
      const terminalProvider: CollatedTerminalProvider = new CollatedTerminalProvider(collatedTerminal, {
        debugEnabled: this.debugMode
      });
      const terminal: Terminal = new Terminal(terminalProvider);
      //#endregion

      const result: T = await callback(terminal, terminalProvider);

      normalizeNewlineTransform.close();

      // If the pipeline is wired up correctly, then closing normalizeNewlineTransform should
      // have closed projectLogWritable.
      if (projectLogWritable?.isOpen) {
        throw new InternalError('The output file handle was not closed');
      }

      return result;
    } finally {
      projectLogWritable?.close();
    }
  }

  public async executeAsync(
    lastState: OperationExecutionRecord | undefined,
    executeContext: IOperationExecutionContext
  ): Promise<void> {
    if (!this.isTerminal) {
      this.stopwatch.reset();
    }
    this.stopwatch.start();
    this.status = OperationStatus.Executing;

    try {
      const earlyReturnStatus: OperationStatus | undefined = await executeContext.onStartAsync(this);
      // When the operation status returns by the hook, bypass the runner execution.
      if (earlyReturnStatus) {
        this.status = earlyReturnStatus;
      } else {
        // If the operation is disabled, skip the runner and directly mark as Skipped.
        // However, if the operation is a NoOp, return NoOp so that cache entries can still be written.
        this.status = this.enabled
          ? await this.runner.executeAsync(this, lastState)
          : this.runner.isNoOp
            ? OperationStatus.NoOp
            : OperationStatus.Skipped;
      }
      // Make sure that the stopwatch is stopped before reporting the result, otherwise endTime is undefined.
      this.stopwatch.stop();
      // Delegate global state reporting
      await executeContext.onResultAsync(this);
    } catch (error) {
      this.status = OperationStatus.Failure;
      this.error = error;
      // Make sure that the stopwatch is stopped before reporting the result, otherwise endTime is undefined.
      this.stopwatch.stop();
      // Delegate global state reporting
      await executeContext.onResultAsync(this);
    } finally {
      if (this.isTerminal) {
        this._collatedWriter?.close();
        this.stdioSummarizer.close();
        this.problemCollector.close();
      }
    }
  }
}
