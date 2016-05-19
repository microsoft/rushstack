/**
 * @file ITask.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * The definition of a task as used by the TaskRunner
 */

import TaskError from '../errorDetection/TaskError';
import TaskStatus from './TaskStatus';
import { ITaskWriter } from './TaskWriterFactory';

/**
 * A definition for a task, an execute function returning a promise and a unique string name
 */
export interface ITaskDefinition {
  name: string;
  execute: (writer: ITaskWriter) => Promise<void>;
}

/**
 * The interface used internally by TaskRunner, which tracks the dependencies and execution status
 */
export interface ITask extends ITaskDefinition {
  status: TaskStatus;
  dependencies: ITask[];
  dependents: ITask[];
  errors: TaskError[];
}
export default ITask;
