// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Enumeration defining potential states of a task: not started, executing, or completed
 */
export enum TaskStatus {
  Ready = 'READY',
  Executing = 'EXECUTING',
  Success = 'SUCCESS',
  SuccessWithWarning = 'SUCCESS WITH WARNINGS',
  Skipped = 'SKIPPED',
  Failure = 'FAILURE',
  Blocked = 'BLOCKED',
}
