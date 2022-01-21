// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TaskStatus } from './TaskStatus';
import { ITaskRunner, ITaskRunnerContext } from './ITaskRunner';

/**
 * Implementation of `ITaskRunner` for tasks with empty scripts.
 */
export class NullTaskRunner implements ITaskRunner {
  private readonly _result: TaskStatus;
  public readonly name: string;
  public readonly hadEmptyScript: boolean = true;
  // The task may never be skipped; it doesn't do anything anyway
  public isSkipAllowed: boolean = false;
  // The task is a no-op, so skip writing an empty cache entry
  public isCacheWriteAllowed: boolean = false;
  // Nothing will get logged, no point allowing warnings
  public readonly warningsAreAllowed: boolean = false;

  public constructor(name: string, result: TaskStatus) {
    this.name = name;
    this._result = result;
  }

  public async executeAsync(context: ITaskRunnerContext): Promise<TaskStatus> {
    return this._result;
  }
}
