// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { OperationStatus } from './OperationStatus';
import type { OperationExecutionRecord } from './OperationExecutionRecord';
import { InternalError } from '@rushstack/node-core-library';
import { Stopwatch } from '../utilities/Stopwatch';

export class OperationGroupRecord {
  private _operations: Set<OperationExecutionRecord> = new Set();
  private _remainingOperations: Set<OperationExecutionRecord> = new Set();
  private _groupStopwatch: Stopwatch | undefined;

  public readonly name: string;

  public get duration(): number {
    return this._groupStopwatch ? this._groupStopwatch.duration : 0;
  }

  public get finished(): boolean {
    return this._remainingOperations.size === 0;
  }

  public get hasFailures(): boolean {
    for (const operation of this._operations) {
      if (operation.status === OperationStatus.Failure) {
        return true;
      }
    }
    return false;
  }

  public constructor(name: string) {
    this.name = name;
  }

  public addOperation(operation: OperationExecutionRecord): void {
    this._operations.add(operation);
    this._remainingOperations.add(operation);
  }

  public startTimer(): void {
    // Keep this undefined until needed, then start to avoid subsequent calls to startTimer()
    if (!this._groupStopwatch) {
      this._groupStopwatch = Stopwatch.start();
    }
  }

  public setOperationAsComplete(operation: OperationExecutionRecord): void {
    if (!this._remainingOperations.has(operation)) {
      throw new InternalError(`Operation ${operation.name} is not in the group ${this.name}`);
    }
    this._remainingOperations.delete(operation);
    if (this._remainingOperations.size === 0 && this._groupStopwatch) {
      this._groupStopwatch.stop();
    }
  }
}
