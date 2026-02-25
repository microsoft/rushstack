// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal, ITerminalProvider } from '@rushstack/terminal';
import type { CollatedWriter } from '@rushstack/stream-collator';

import type { OperationStatus } from './OperationStatus.ts';
import type { OperationMetadataManager } from './OperationMetadataManager.ts';
import type { IStopwatchResult } from '../../utilities/Stopwatch.ts';
import type { IEnvironment } from '../../utilities/Utilities.ts';

/**
 * Information passed to the executing `IOperationRunner`
 *
 * @beta
 */
export interface IOperationRunnerContext {
  /**
   * The writer into which this `IOperationRunner` should write its logs.
   */
  collatedWriter: CollatedWriter;
  /**
   * If Rush was invoked with `--debug`
   */
  debugMode: boolean;
  /**
   * Defaults to `true`. Will be `false` if Rush was invoked with `--verbose`.
   */
  quietMode: boolean;
  /**
   * Object used to manage metadata of the operation.
   *
   * @internal
   */
  _operationMetadataManager: OperationMetadataManager;
  /**
   * Object used to track elapsed time.
   */
  stopwatch: IStopwatchResult;
  /**
   * The current execution status of an operation. Operations start in the 'ready' state,
   * but can be 'blocked' if an upstream operation failed. It is 'executing' when
   * the operation is executing. Once execution is complete, it is either 'success' or
   * 'failure'.
   */
  status: OperationStatus;

  /**
   * The environment in which the operation is being executed.
   * A return value of `undefined` indicates that it should inherit the environment from the parent process.
   */
  environment: IEnvironment | undefined;

  /**
   * Error which occurred while executing this operation, this is stored in case we need
   * it later (for example to re-print errors at end of execution).
   */
  error?: Error;

  /**
   * Invokes the specified callback with a terminal that is associated with this operation.
   *
   * Will write to a log file corresponding to the phase and project, and clean it up upon completion.
   */
  runWithTerminalAsync<T>(
    callback: (terminal: ITerminal, terminalProvider: ITerminalProvider) => Promise<T>,
    options: {
      createLogFile: boolean;
      logFileSuffix?: string;
    }
  ): Promise<T>;
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
   * Whether or not the operation is cacheable. If false, all cache engines will be disabled for this operation.
   */
  cacheable: boolean;

  /**
   * Indicates that this runner's duration has meaning.
   */
  reportTiming: boolean;

  /**
   * Indicates that this runner is architectural and should not be reported on.
   */
  silent: boolean;

  /**
   * If set to true, a warning result should not make Rush exit with a nonzero
   * exit code
   */
  warningsAreAllowed: boolean;

  /**
   * If set to true, this operation is considered a no-op and can be considered always skipped for
   * analysis purposes.
   */
  readonly isNoOp?: boolean;

  /**
   * Method to be executed for the operation.
   */
  executeAsync(context: IOperationRunnerContext): Promise<OperationStatus>;

  /**
   * Return a hash of the configuration that affects the operation.
   */
  getConfigHash(): string;
}
