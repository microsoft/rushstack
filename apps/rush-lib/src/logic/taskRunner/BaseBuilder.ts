// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITaskWriter } from '@rushstack/stream-collator';
import { TaskStatus } from './TaskStatus';

/**
 * A definition for a task, an execute function returning a promise and a unique string name
 */
export abstract class BaseBuilder {
  /**
   * Name of the task definition.
   */
  abstract name: string;

  /**
   * This flag determines if an incremental build is allowed for the task.
   */
  abstract isIncrementalBuildAllowed: boolean;

  /**
   * Assigned by execute().  True if the build script was an empty string.  Operationally an empty string is
   * like a shell command that succeeds instantly, but e.g. it would be odd to report build time statistics for it.
   */
  abstract hadEmptyScript: boolean;

  /**
   * Method to be executed for the task.
   */
  abstract async execute(writer: ITaskWriter): Promise<TaskStatus>;
}
