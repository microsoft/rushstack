// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { CollatedTerminal } from '@rushstack/stream-collator';

import { OperationStatus } from '../OperationStatus.ts';
import type { IOperationRunner, IOperationRunnerContext } from '../IOperationRunner.ts';

export class MockOperationRunner implements IOperationRunner {
  private readonly _action: ((terminal: CollatedTerminal) => Promise<OperationStatus>) | undefined;
  public readonly name: string;
  public readonly reportTiming: boolean = true;
  public readonly silent: boolean = false;
  public readonly cacheable: boolean = false;
  public readonly warningsAreAllowed: boolean;
  public readonly isNoOp?: boolean | undefined;

  public constructor(
    name: string,
    action?: (terminal: CollatedTerminal) => Promise<OperationStatus>,
    warningsAreAllowed: boolean = false,
    isNoOp: boolean | undefined = undefined
  ) {
    this.isNoOp = isNoOp;
    this.name = name;
    this._action = action;
    this.warningsAreAllowed = warningsAreAllowed;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    let result: OperationStatus | undefined;
    if (this._action) {
      result = await this._action(context.collatedWriter.terminal);
    }
    return result || OperationStatus.Success;
  }

  public getConfigHash(): string {
    return 'mock';
  }
}
