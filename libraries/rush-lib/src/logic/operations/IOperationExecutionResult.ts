// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { StdioSummarizer, IProblemCollector } from '@rushstack/terminal';

import type { OperationStatus } from './OperationStatus';
import type { Operation } from './Operation';
import type { IStopwatchResult } from '../../utilities/Stopwatch';
import type { ILogFilePaths } from './ProjectLogWritable';

/**
 * @alpha
 */
export interface IBaseOperationExecutionResult {
  /**
   * The operation itself
   */
  readonly operation: Operation;

  /**
   * The relative path to the folder that contains operation metadata. This folder will be automatically included in cache entries.
   */
  readonly metadataFolderPath: string | undefined;

  /**
   * Gets the hash of the state of all registered inputs to this operation.
   * Calling this method will throw if Git is not available.
   */
  getStateHash(): string;

  /**
   * Gets the components of the state hash. This is useful for debugging purposes.
   * Calling this method will throw if Git is not available.
   */
  getStateHashComponents(): ReadonlyArray<string>;
}

/**
 * The `IConfigurableOperation` interface represents an {@link Operation} whose
 * execution can be configured before running.
 * @alpha
 */
export interface IConfigurableOperation extends IBaseOperationExecutionResult {
  /**
   * True if the operation should execute in this iteration, false otherwise.
   */
  enabled: boolean;
}

/**
 * The `IOperationExecutionResult` interface represents the results of executing an {@link Operation}.
 * @alpha
 */
export interface IOperationExecutionResult extends IBaseOperationExecutionResult {
  /**
   * The current execution status of an operation. Operations start in the 'ready' state,
   * but can be 'blocked' if an upstream operation failed. It is 'executing' when
   * the operation is executing. Once execution is complete, it is either 'success' or
   * 'failure'.
   */
  readonly status: OperationStatus;
  /**
   * The error which occurred while executing this operation, this is stored in case we need
   * it later (for example to re-print errors at end of execution).
   */
  readonly error: Error | undefined;
  /**
   * If this operation is only present in the graph to maintain dependency relationships, this flag will be set to true.
   */
  readonly silent: boolean;
  /**
   * True if the operation should execute in this iteration, false otherwise.
   */
  readonly enabled: boolean;
  /**
   * Object tracking execution timing.
   */
  readonly stopwatch: IStopwatchResult;
  /**
   * Object used to report a summary at the end of the Rush invocation.
   */
  readonly stdioSummarizer: StdioSummarizer;
  /**
   * Object used to collect problems (errors/warnings/info) encountered during the operation.
   */
  readonly problemCollector: IProblemCollector;
  /**
   * The value indicates the duration of the same operation without cache hit.
   */
  readonly nonCachedDurationMs: number | undefined;
  /**
   * The paths to the log files, if applicable.
   */
  readonly logFilePaths: ILogFilePaths | undefined;
}

/**
 * The `IExecutionResult` interface represents the results of executing a set of {@link Operation}s.
 * @alpha
 */
export interface IExecutionResult {
  /**
   * The results for each scheduled operation.
   */
  readonly operationResults: ReadonlyMap<Operation, IOperationExecutionResult>;
  /**
   * The overall result.
   */
  readonly status: OperationStatus;
}
