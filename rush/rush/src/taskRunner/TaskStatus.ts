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
  Failure = 4,
  Blocked = 5
}
export default TaskStatus;
