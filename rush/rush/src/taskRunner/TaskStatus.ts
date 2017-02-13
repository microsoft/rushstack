// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Enumeration defining potential states of a task: not started, executing, or completed
 */
enum TaskStatus {
  Ready = 1,
  Executing = 2,
  Success = 3,
  SuccessWithWarning = 4,
  Skipped = 5,
  Failure = 6,
  Blocked = 7
}
export default TaskStatus;
