// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Enumeration defining potential states of an operation: not started, executing, or completed
 */
export enum OperationStatus {
  Ready = 'READY',
  Executing = 'EXECUTING',
  Success = 'SUCCESS',
  SuccessWithWarning = 'SUCCESS WITH WARNINGS',
  Skipped = 'SKIPPED',
  FromCache = 'FROM CACHE',
  Failure = 'FAILURE',
  Blocked = 'BLOCKED'
}
