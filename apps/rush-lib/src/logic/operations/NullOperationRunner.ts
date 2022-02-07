// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { OperationStatus } from './OperationStatus';
import type { IOperationRunner, IOperationRunnerContext } from './IOperationRunner';

/**
 * Implementation of `IOperationRunner` for operations that require no work, such as empty scripts,
 * skipped operations, or blocked operations.
 */
export class NullOperationRunner implements IOperationRunner {
  public readonly name: string;
  public readonly isNoop: boolean = true;
  // The operation may be skipped; it doesn't do anything anyway
  public isSkipAllowed: boolean = true;
  // The operation is a no-op, so is cacheable.
  public isCacheWriteAllowed: boolean = true;
  // Nothing will get logged, no point allowing warnings
  public readonly warningsAreAllowed: boolean = false;

  public readonly result: OperationStatus;

  public constructor(name: string, result: OperationStatus) {
    this.name = name;
    this.result = result;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    return this.result;
  }
}
