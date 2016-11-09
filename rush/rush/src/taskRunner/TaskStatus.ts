/**
 * @file TaskStatus.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * Enumeration defining potential states of a task: not started, executing, or completed
 */

enum TaskStatus {
  Ready = 1,
  Executing = 2,
  Success = 3,
  SuccessWithWarning = 4,
  Failure = 5,
  Blocked = 6
}
export default TaskStatus;
