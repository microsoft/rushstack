// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminal } from '@rushstack/node-core-library';
import type { TerminalWritable } from '@rushstack/terminal';
import { IOperationHashes } from './OperationHash';

import type { OperationStatus } from './OperationStatus';

/**
 * Information passed to the executing `IOperationRunner`
 *
 * @beta
 */
export interface IOperationRunnerContext {
  /**
   * If Rush was invoked with `--debug`
   */
  debugMode: boolean;

  /**
   * Defaults to `true`. Will be `false` if Rush was invoked with `--verbose`.
   */
  quietMode: boolean;

  /**
   * Defaults to `true`. Will be `false` if a dependency is in an unknown state.
   */
  isSkipAllowed: boolean;

  /**
   * Defaults to `true`. Will be `false` if a dependency is in an unknown state.
   */
  isCacheReadAllowed: boolean;

  /**
   * Defaults to `true`. Will be `false` if a dependency is in an unknown state.
   */
  isCacheWriteAllowed: boolean;

  /**
   * Terminal instance for logging messages.
   */
  terminal: ITerminal;

  /**
   * Raw terminal for forwarding stdout/stderr
   */
  terminalWritable: TerminalWritable;

  /**
   * The hashes of the operation state.
   */
  hashes: IOperationHashes | undefined;
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
   * Method to be executed for the operation.
   */
  executeAsync(context: IOperationRunnerContext): Promise<OperationStatus>;
}
