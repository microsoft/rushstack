// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { OperationStatus } from './OperationStatus';
import { IOperationRunner, IOperationRunnerContext } from './IOperationRunner';

/**
 * Implementation of `IOperationRunner` for operations that require no work, such as empty scripts,
 * or operations that are skipped by filters.
 */
export class NullOperationRunner implements IOperationRunner {
  private readonly _result: OperationStatus;
  public readonly name: string;
  public readonly hadEmptyScript: boolean = true;
  // The operation may never be skipped; it doesn't do anything anyway
  public isSkipAllowed: boolean = false;
  // The operation is a no-op, so skip writing an empty cache entry
  public isCacheWriteAllowed: boolean = false;
  // Nothing will get logged, no point allowing warnings
  public readonly warningsAreAllowed: boolean = false;

  public constructor(name: string, result: OperationStatus) {
    this.name = name;
    this._result = result;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    return this._result;
  }
}
