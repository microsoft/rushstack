// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Enumeration defining potential states of an operation
 * @beta
 */
export enum OperationStatus {
  /**
   * The Operation is on the queue, ready to execute (but may be waiting for dependencies)
   */
  Ready = 'READY',
  /**
   * The Operation is currently executing
   */
  Executing = 'EXECUTING',
  /**
   * The Operation completed successfully and did not write to standard output
   */
  Success = 'SUCCESS',
  /**
   * The Operation failed
   */
  Failure = 'FAILURE',
  /**
   * The operation was cancelled
   */
  Cancelled = 'CANCELLED',
  /**
   * The Operation could not be executed because one or more of its dependencies failed
   */
  Blocked = 'BLOCKED',
  /**
   * The operation performed no meaningful work.
   */
  NoOp = 'NO OP'
}
