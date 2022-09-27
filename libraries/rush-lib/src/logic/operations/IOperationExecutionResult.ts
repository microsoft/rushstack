// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { OperationStatus } from './OperationStatus';
import type { IStopwatchResult } from '../../utilities/Stopwatch';
import type { Operation } from './Operation';

/**
 * The `IOperationExecutionResult` interface represents the results of executing an {@link Operation}.
 * @alpha
 */
export interface IOperationExecutionResult {
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
   * Object tracking execution timing.
   */
  readonly stopwatch: IStopwatchResult;
  /**
   * The value indicates the duration of the same operation without cache hit.
   */
  readonly nonCachedDurationMs: number | undefined;
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
