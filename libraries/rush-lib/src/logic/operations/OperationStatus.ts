// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Enumeration defining potential states of an operation
 * @beta
 */
export enum OperationStatus {
  /**
   * The Operation is ready to execute. All its dependencies have succeeded.
   */
  Ready = 'READY',
  /**
   * The Operation is waiting for one or more dependencies to complete.
   */
  Waiting = 'WAITING',
  /**
   * The Operation is Queued
   */
  Queued = 'QUEUED',
  /**
   * The Operation is currently executing
   */
  Executing = 'EXECUTING',
  /**
   * The Operation completed successfully and did not write to standard output
   */
  Success = 'SUCCESS',
  /**
   * The Operation completed successfully, but wrote to standard output
   */
  SuccessWithWarning = 'SUCCESS WITH WARNINGS',
  /**
   * The Operation was skipped via the legacy incremental build logic
   */
  Skipped = 'SKIPPED',
  /**
   * The Operation had its outputs restored from the build cache
   */
  FromCache = 'FROM CACHE',
  /**
   * The Operation failed
   */
  Failure = 'FAILURE',
  /**
   * The Operation could not be executed because one or more of its dependencies failed
   */
  Blocked = 'BLOCKED',
  /**
   * The Operation was a no-op (for example, it had an empty script)
   */
  NoOp = 'NO OP',
  /**
   * The Operation was aborted before it could execute.
   */
  Aborted = 'ABORTED'
}

/**
 * The set of statuses that are considered terminal.
 * @alpha
 */
export const TERMINAL_STATUSES: Set<OperationStatus> = new Set([
  OperationStatus.Success,
  OperationStatus.SuccessWithWarning,
  OperationStatus.Skipped,
  OperationStatus.Blocked,
  OperationStatus.FromCache,
  OperationStatus.Failure,
  OperationStatus.NoOp,
  OperationStatus.Aborted
]);

/**
 * The set of statuses that are considered successful and don't trigger a rebuild if current.
 */
export const SUCCESS_STATUSES: Set<OperationStatus> = new Set([
  OperationStatus.Success,
  OperationStatus.FromCache,
  OperationStatus.NoOp
]);
