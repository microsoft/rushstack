// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITaskWriter } from '@rushstack/stream-collator';

import { TaskStatus } from '../TaskStatus';
import { BaseBuilder } from '../BaseBuilder';

export class MockBuilder extends BaseBuilder {
  public readonly name: string;
  private readonly _action: ((writer?: ITaskWriter) => Promise<TaskStatus>) | undefined;
  public readonly hadEmptyScript: boolean = false;
  public readonly isIncrementalBuildAllowed: boolean = false;

  public constructor(name: string, action?: (writer: ITaskWriter) => Promise<TaskStatus>) {
    super();

    this.name = name;
    this._action = action;
  }

  public async executeAsync(writer: ITaskWriter): Promise<TaskStatus> {
    let result: TaskStatus | void;
    if (this._action) {
      result = await this._action(writer);
    }
    return result ? result : TaskStatus.Success;
  }
}
