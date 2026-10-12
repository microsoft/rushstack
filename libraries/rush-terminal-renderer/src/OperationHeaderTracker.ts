// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonOperationHeaderPayload } from '@rushstack/rush-daemon-protocol';

const INITIAL_OPERATION_COUNT: number = 0;
const OPERATION_COUNT_INCREMENT: number = 1;

export class OperationHeaderTracker {
  readonly #headerByOperation: Map<string, IDaemonOperationHeaderPayload> = new Map();
  #completedOperations: number = INITIAL_OPERATION_COUNT;
  #totalOperations: number = INITIAL_OPERATION_COUNT;

  public registerOperation(): void {
    this.#totalOperations += OPERATION_COUNT_INCREMENT;
  }

  public setOperationHeader(header: IDaemonOperationHeaderPayload): void {
    this.#headerByOperation.set(header.operationId, header);
  }

  public takeOperationHeader(operationId: string): IDaemonOperationHeaderPayload {
    const header: IDaemonOperationHeaderPayload | undefined = this.#headerByOperation.get(operationId);
    if (header !== undefined) {
      this.#headerByOperation.delete(operationId);
      this.#completedOperations = header.completedOperations;
      this.#totalOperations = header.totalOperations;
      return header;
    }
    this.#completedOperations += OPERATION_COUNT_INCREMENT;
    return {
      completedOperations: this.#completedOperations,
      operationId,
      totalOperations: this.#totalOperations
    };
  }
}
