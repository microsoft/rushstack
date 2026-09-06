// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonOperationHeaderPayload } from '@rushstack/rush-daemon-protocol';

const INITIAL_OPERATION_COUNT: number = 0;
const OPERATION_COUNT_INCREMENT: number = 1;

export class OperationHeaderTracker {
  private readonly _headerByOperation: Map<string, IDaemonOperationHeaderPayload> = new Map();
  private _completedOperations: number = INITIAL_OPERATION_COUNT;
  private _totalOperations: number = INITIAL_OPERATION_COUNT;

  public registerOperation(): void {
    this._totalOperations += OPERATION_COUNT_INCREMENT;
  }

  public setOperationHeader(header: IDaemonOperationHeaderPayload): void {
    this._headerByOperation.set(header.operationId, header);
  }

  public takeOperationHeader(operationId: string): IDaemonOperationHeaderPayload {
    const header: IDaemonOperationHeaderPayload | undefined =
      this._headerByOperation.get(operationId);
    if (header !== undefined) {
      this._headerByOperation.delete(operationId);
      this._completedOperations = header.completedOperations;
      this._totalOperations = header.totalOperations;
      return header;
    }
    this._completedOperations += OPERATION_COUNT_INCREMENT;
    return {
      completedOperations: this._completedOperations,
      operationId,
      totalOperations: this._totalOperations
    };
  }
}
