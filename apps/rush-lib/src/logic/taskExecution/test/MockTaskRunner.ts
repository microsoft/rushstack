// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { CollatedTerminal } from '@rushstack/stream-collator';

import { TaskStatus } from '../TaskStatus';
import { ITaskRunner, ITaskRunnerContext } from '../ITaskRunner';

export class MockTaskRunner implements ITaskRunner {
  private readonly _action: ((terminal: CollatedTerminal) => Promise<TaskStatus>) | undefined;
  public readonly name: string;
  public readonly hadEmptyScript: boolean = false;
  public isSkipAllowed: boolean = false;
  public isCacheWriteAllowed: boolean = false;
  public readonly warningsAreAllowed: boolean;

  public constructor(
    name: string,
    action?: (terminal: CollatedTerminal) => Promise<TaskStatus>,
    warningsAreAllowed: boolean = false
  ) {
    this.name = name;
    this._action = action;
    this.warningsAreAllowed = warningsAreAllowed;
  }

  public async executeAsync(context: ITaskRunnerContext): Promise<TaskStatus> {
    let result: TaskStatus | undefined;
    if (this._action) {
      result = await this._action(context.collatedWriter.terminal);
    }
    return result || TaskStatus.Success;
  }
}
