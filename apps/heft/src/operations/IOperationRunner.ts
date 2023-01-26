// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { OperationStatus } from './OperationStatus';
import type { OperationError } from './OperationError';

import type { CancellationToken } from '../pluginFramework/CancellationToken';
import type { Stopwatch } from '../utilities/Stopwatch';

/**
 * Information passed to the executing `IOperationRunner`
 *
 * @beta
 */
export interface IOperationRunnerContext {
  cancellationToken: CancellationToken;

  isFirstRun: boolean;

  requestRun?: () => void;

  queueWork<T>(workFn: () => Promise<T>, priority: number): Promise<T>;
}

/**
 *
 */
export interface IOperationState {
  status: OperationStatus;
  error: OperationError | undefined;
  stopwatch: Stopwatch;
}

export interface IOperationStates {
  readonly state: Readonly<IOperationState> | undefined;
  readonly lastState: Readonly<IOperationState> | undefined;
}

/**
 * The `Operation` class is a node in the dependency graph of work that needs to be scheduled by the
 * `OperationExecutionManager`. Each `Operation` has a `runner` member of type `IOperationRunner`, whose
 * implementation manages the actual process for running a single operation.
 *
 * @beta
 */
export interface IOperationRunner {
  /**
   * Name of the operation, for logging.
   */
  readonly name: string;

  /**
   * Indicates that this runner is architectural and should not be reported on.
   */
  silent: boolean;

  /**
   * Method to be executed for the operation.
   */
  executeAsync(context: IOperationRunnerContext): Promise<OperationStatus>;
}
