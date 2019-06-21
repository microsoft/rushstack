// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITaskWriter } from '@microsoft/stream-collator';

import { Stopwatch } from '../../utilities/Stopwatch';
import { TaskStatus } from './TaskStatus';
import { TaskError } from './TaskError';

/**
 * A definition for a task, an execute function returning a promise and a unique string name
 */
export interface ITaskDefinition {
  /**
   * Name of the task definition.
   */
  name: string;

  /**
   * This flag determines if an incremental build is allowed for the task.
   */
  isIncrementalBuildAllowed: boolean;

  /**
   * Assigned by execute().  True if the build script was an empty string.  Operationally an empty string is
   * like a shell command that succeeds instantly, but e.g. it would be odd to report build time statistics for it.
   */
  hadEmptyScript: boolean;

  /**
   * Method to be executed for the task.
   */
  execute: (writer: ITaskWriter) => Promise<TaskStatus>;
}

/**
 * The interface used internally by TaskRunner, which tracks the dependencies and execution status
 */
export interface ITask extends ITaskDefinition {
  /**
   * The current execution status of a task. Tasks start in the 'ready' state,
   * but can be 'blocked' if an upstream task failed. It is 'executing' when
   * the task is executing. Once execution is complete, it is either 'success' or
   * 'failure'.
   */
  status: TaskStatus;

  /**
   * A set of all dependencies which must be executed before this task is complete.
   * When dependencies finish execution, they are removed from this list.
   */
  dependencies: Set<ITask>;

  /**
   * The inverse of dependencies, lists all projects which are directly dependent on this one.
   */
  dependents: Set<ITask>;

  /**
   * This number represents how far away this Task is from the furthest "root" project (i.e.
   * a project with no dependents). This helps us to calculate the critical path (i.e. the
   * longest chain of projects which must be executed in order, thereby limiting execution speed
   * of the entire task tree.
   *
   * This number is calculated via a memoized recursive function, and when choosing the next
   * task to execute, the task with the highest criticalPathLength is chosen.
   *
   * Example:
   *        (0) A
   *             \
   *          (1) B     C (0)         (applications)
   *               \   /|\
   *                \ / | \
   *             (2) D  |  X (1)      (utilities)
   *                    | / \
   *                    |/   \
   *                (2) Y     Z (2)   (other utilities)
   *
   * All roots (A & C) have a criticalPathLength of 0.
   * B has a score of 1, since A depends on it.
   * D has a score of 2, since we look at the longest chain (e.g D->B->A is longer than D->C)
   * X has a score of 1, since the only package which depends on it is A
   * Z has a score of 2, since only X depends on it, and X has a score of 1
   * Y has a score of 2, since the chain Y->X->C is longer than Y->C
   *
   * The algorithm is implemented in TaskRunner as _calculateCriticalPaths()
   */
  criticalPathLength: number | undefined;

  /**
   * The error which occurred while executing this task, this is stored in case we need
   * it later (for example to re-print errors at end of execution).
   */
  error: TaskError | undefined;

  /**
   * The task writer which contains information from the output streams of this task
   */
  writer: ITaskWriter;

  /**
   * The stopwatch which measures how long it takes the task to execute
   */
  stopwatch: Stopwatch;
}
